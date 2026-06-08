#!/usr/bin/env python3
"""
export_annotation_csv.py
========================
Export posts from existing data sources to a CSV file for human annotation.

Data sources (in priority order):
  1. FastAPI SQLite dev.db → social_mentions (body_snippet + ticker join)
  2. Template rows (if no DB data available)

Output:
  backend/app/ml/training/data/annotation_queue_YYYYMMDD.csv

Columns:
  id, text, symbol, source, created_at,
  auto_risk_label, auto_composite_score, auto_highlighted_terms,
  risk_label (blank), direction_label (blank), notes (blank)

NOTE: auto_risk_label is for reference only. Do NOT use it as the true label.
      Fill in risk_label and direction_label manually.

Usage:
  cd social-trade-risk/backend
  python ../scripts/export_annotation_csv.py
  python ../scripts/export_annotation_csv.py --output /path/to/queue.csv --limit 200
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# ── path setup ────────────────────────────────────────────────────────────────
# Must run from backend/ so that 'app' is importable.
# Alternatively set PYTHONPATH=backend explicitly.
SCRIPT_DIR  = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

OUT_DIR = BACKEND_DIR / "app" / "ml" / "training" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_DB  = BACKEND_DIR / "dev.db"
DEFAULT_OUT = OUT_DIR / f"annotation_queue_{datetime.now().strftime('%Y%m%d')}.csv"

FIELDNAMES = [
    "id", "text", "symbol", "source", "created_at",
    "auto_risk_label", "auto_composite_score", "auto_highlighted_terms",
    "risk_label", "direction_label", "notes",
]


# ── auto-label via heuristic ──────────────────────────────────────────────────

def _auto_label(text: str) -> dict:
    """Run heuristic _compute_scores; return auto labels for CSV reference column."""
    try:
        from app.routers.copilot import _compute_scores
        s = _compute_scores(text)
        return {
            "auto_risk_label":        s["predicted_risk_label"],
            "auto_composite_score":   round(s["composite_score"], 2),
            "auto_highlighted_terms": json.dumps(s["highlighted_terms"], ensure_ascii=False),
        }
    except Exception as exc:
        print(f"  [warn] heuristic unavailable ({exc}) — using defaults", file=sys.stderr)
        return {
            "auto_risk_label":        "Low",
            "auto_composite_score":   0.0,
            "auto_highlighted_terms": "[]",
        }


def _text_hash(text: str) -> str:
    norm = " ".join(text.lower().split())
    return hashlib.sha256(norm.encode()).hexdigest()


# ── data source: SQLite social_mentions ───────────────────────────────────────

def _load_from_sqlite(db_path: Path, limit: int) -> list[dict]:
    """
    Load social_mentions from SQLite dev.db.
    Joins with tickers to get symbol.
    Deduplicates by normalized text hash.
    """
    if not db_path.exists():
        print(f"  [info] SQLite DB not found: {db_path}", file=sys.stderr)
        return []
    try:
        from sqlalchemy import create_engine, text as sa_text
        engine = create_engine(f"sqlite:///{db_path}", pool_pre_ping=True)
        with engine.connect() as conn:
            rows = conn.execute(sa_text("""
                SELECT
                    sm.id,
                    sm.body_snippet,
                    sm.source,
                    sm.ts,
                    sm.created_at,
                    t.symbol
                FROM social_mentions sm
                JOIN tickers t ON t.id = sm.ticker_id
                WHERE sm.body_snippet IS NOT NULL
                  AND length(trim(sm.body_snippet)) > 5
                ORDER BY sm.created_at DESC
            """)).fetchall()
    except Exception as exc:
        print(f"  [warn] SQLite query failed: {exc}", file=sys.stderr)
        return []

    seen: set[str] = set()
    records: list[dict] = []

    for row in rows:
        sm_id, snippet, source, ts, created_at, symbol = row
        snippet = (snippet or "").strip()
        if not snippet:
            continue

        h = _text_hash(snippet)
        if h in seen:
            continue
        seen.add(h)

        ts_str = str(ts)[:19] if ts else (str(created_at)[:19] if created_at else "")
        auto = _auto_label(snippet)
        records.append({
            "id":          f"sm_{sm_id}",
            "text":        snippet,
            "symbol":      symbol or "",
            "source":      source or "reddit",
            "created_at":  ts_str,
            **auto,
            "risk_label":       "",
            "direction_label":  "",
            "notes":            "",
        })
        if len(records) >= limit:
            break

    return records


# ── fallback: illustrative template rows ─────────────────────────────────────

def _template_rows() -> list[dict]:
    """
    Return illustrative template rows when no DB data is available.
    Covers all 3 risk levels and all 3 direction classes.
    risk_label / direction_label left blank for human to fill.
    """
    examples = [
        # High risk, bullish
        ("GME to the moon! Diamond hands! Shorts are trapped! HODL!",            "GME",  "template"),
        ("AMC last chance before it explodes. Buy now or miss out forever.",       "AMC",  "template"),
        ("Guaranteed easy money! Can't lose! 100% gains incoming!",               "GME",  "template"),
        ("Short interest above 140%% — mathematically impossible to sustain.",    "GME",  "template"),
        # Medium risk, bullish
        ("KOSS volume is exploding and everyone is watching it closely.",          "KOSS", "template"),
        ("BlackBerry meme-stock attention picking up. Thesis is mixed.",           "BB",   "template"),
        # Low risk, bullish
        ("NVIDIA strong earnings beat on AI demand. Long-term hold.",              "NVDA", "template"),
        ("Tesla discussion is bullish but mostly based on earnings expectations.", "TSLA", "template"),
        # Low risk, bearish
        ("I hate this stock, it just keeps going down. Thinking of selling.",     "GME",  "template"),
        ("Not sure about AMC anymore. Fundamental thesis seems weak.",             "AMC",  "template"),
        # Low risk, neutral
        ("This is totally unrelated to stocks: I had pizza for lunch today.",     "",     "template"),
        ("Weather is nice today. Nothing financial here.",                         "",     "template"),
        ("The movie was good. Not sure what to watch next.",                       "",     "template"),
        ("brabrabra aslkdjf qwerty random text no financial content.",             "",     "template"),
    ]
    rows = []
    for i, (text, symbol, source) in enumerate(examples, start=1):
        auto = _auto_label(text)
        rows.append({
            "id":               f"tmpl_{i:03d}",
            "text":             text,
            "symbol":           symbol,
            "source":           source,
            "created_at":       datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            **auto,
            "risk_label":       "",
            "direction_label":  "",
            "notes":            "",
        })
    return rows


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export annotation queue CSV from existing data sources."
    )
    parser.add_argument(
        "--output", default=str(DEFAULT_OUT),
        help=f"Output CSV path (default: {DEFAULT_OUT})"
    )
    parser.add_argument(
        "--db", default=str(DEFAULT_DB),
        help=f"SQLite dev.db path (default: {DEFAULT_DB})"
    )
    parser.add_argument(
        "--limit", default=500, type=int,
        help="Max rows to export from DB (default: 500)"
    )
    parser.add_argument(
        "--template-only", action="store_true",
        help="Force template rows even if DB data exists"
    )
    args = parser.parse_args()

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if args.template_only:
        records = _template_rows()
        print(f"[export] --template-only: using {len(records)} template rows.")
    else:
        print(f"[export] Reading SQLite: {args.db}")
        records = _load_from_sqlite(Path(args.db), args.limit)
        if records:
            print(f"[export] Loaded {len(records)} unique posts (deduped by text hash).")
        else:
            print("[export] No DB data found — falling back to template rows.")
            records = _template_rows()

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)

    print(f"[export] Written {len(records)} rows → {out_path}")
    print()
    print("[export] Next steps:")
    print("  1. Open the CSV in Excel or Google Sheets.")
    print("  2. Fill in 'risk_label'    → Low / Medium / High")
    print("  3. Fill in 'direction_label' → bullish / bearish / neutral")
    print("  4. Use 'auto_risk_label' as a reference hint, NOT as the true label.")
    print("  5. Save and run: python scripts/import_labeled_csv.py --input <labeled_file>")


if __name__ == "__main__":
    main()
