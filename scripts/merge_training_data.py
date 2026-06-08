#!/usr/bin/env python3
"""
merge_training_data.py
======================
Merge human-labeled data (required) with an optional base CSV to produce
the final training dataset for the new text-based risk + direction models.

Inputs:
  [required] backend/app/ml/training/data/human_labels_v1.csv
  [optional] --base <path>   additional CSV (e.g. older human-labeled batch)

Output:
  backend/app/ml/training/data/training_social_posts_v2.csv

Output columns:
  text, risk_label, direction_label, source_dataset, source_type,
  label_method, notes, sample_weight

Design notes:
  - Does NOT generate synthetic data (that's generate_dataset.py for the old model)
  - Deduplicates across all inputs by SHA256 hash of normalized text
  - Human labels: sample_weight=2.0 by default (kept from import step)
  - Label distribution is printed so you can see class balance before training

Usage:
  python scripts/merge_training_data.py
  python scripts/merge_training_data.py --base extra_labels.csv
  python scripts/merge_training_data.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from collections import Counter
from pathlib import Path

SCRIPT_DIR  = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_DIR / "backend"

DATA_DIR    = BACKEND_DIR / "app" / "ml" / "training" / "data"
HUMAN_PATH  = DATA_DIR / "human_labels_v1.csv"
OUT_PATH    = DATA_DIR / "training_social_posts_v2.csv"

OUT_FIELDNAMES = [
    "text", "risk_label", "direction_label",
    "source_dataset", "source_type", "label_method",
    "notes", "sample_weight",
]

VALID_RISK      = {"Low", "Medium", "High"}
VALID_DIRECTION = {"bullish", "bearish", "neutral"}


def _hash(text: str) -> str:
    norm = " ".join(text.lower().split())
    return hashlib.sha256(norm.encode()).hexdigest()


def _load_csv(path: Path, label: str) -> list[dict]:
    """Load a labeled CSV; validate risk_label and direction_label; skip bad rows."""
    if not path.exists():
        print(f"[merge] ERROR: {label} not found: {path}", file=sys.stderr)
        return []

    rows: list[dict] = []
    n_bad = 0
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            text  = row.get("text", "").strip()
            risk  = row.get("risk_label", "").strip()
            direc = row.get("direction_label", "").strip()

            if not text:
                n_bad += 1
                continue
            if risk not in VALID_RISK:
                print(f"  [warn] {label} line {i}: bad risk_label='{risk}' — skipped")
                n_bad += 1
                continue
            if direc not in VALID_DIRECTION:
                print(f"  [warn] {label} line {i}: bad direction_label='{direc}' — skipped")
                n_bad += 1
                continue

            rows.append({
                "text":            text,
                "risk_label":      risk,
                "direction_label": direc,
                "source_dataset":  row.get("source_dataset", "unknown").strip(),
                "source_type":     row.get("source_type", "unknown").strip(),
                "label_method":    row.get("label_method", "human").strip(),
                "notes":           row.get("notes", "").strip(),
                "sample_weight":   row.get("sample_weight", "2.0").strip(),
            })

    if n_bad:
        print(f"  [warn] {label}: {n_bad} rows skipped (bad labels or empty text).")
    print(f"[merge] Loaded {len(rows)} valid rows from {label} ({path.name})")
    return rows


def _dedup(all_rows: list[dict]) -> list[dict]:
    """Deduplicate by text hash; first occurrence wins."""
    seen: set[str] = set()
    deduped: list[dict] = []
    n_dup = 0
    for row in all_rows:
        h = _hash(row["text"])
        if h in seen:
            n_dup += 1
            continue
        seen.add(h)
        deduped.append(row)
    if n_dup:
        print(f"[merge] Deduplicated: removed {n_dup} duplicate rows.")
    return deduped


def _print_distribution(rows: list[dict]) -> None:
    risk_counts = Counter(r["risk_label"] for r in rows)
    dir_counts  = Counter(r["direction_label"] for r in rows)
    total = len(rows)
    print(f"\n[merge] Label distribution ({total} total rows):")
    print(f"  Risk labels:")
    for label in ["Low", "Medium", "High"]:
        n = risk_counts.get(label, 0)
        pct = 100 * n / total if total else 0
        print(f"    {label:<8}: {n:4d}  ({pct:.1f}%)")
    print(f"  Direction labels:")
    for label in ["bullish", "bearish", "neutral"]:
        n = dir_counts.get(label, 0)
        pct = 100 * n / total if total else 0
        print(f"    {label:<8}: {n:4d}  ({pct:.1f}%)")

    # Imbalance warnings
    min_risk = min(risk_counts.values(), default=0)
    max_risk = max(risk_counts.values(), default=0)
    if max_risk > 0 and min_risk / max_risk < 0.3:
        minority = min(risk_counts, key=risk_counts.get)
        print(f"\n  [warn] Risk class imbalance: '{minority}' is "
              f"underrepresented ({min_risk}/{max_risk}). "
              f"Consider annotating more {minority}-risk examples.")

    min_dir = min(dir_counts.values(), default=0)
    max_dir = max(dir_counts.values(), default=0)
    if max_dir > 0 and min_dir / max_dir < 0.3:
        minority = min(dir_counts, key=dir_counts.get)
        print(f"  [warn] Direction class imbalance: '{minority}' is "
              f"underrepresented ({min_dir}/{max_dir}). "
              f"Consider annotating more {minority} examples.")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Merge human-labeled data into training_social_posts_v2.csv."
    )
    parser.add_argument(
        "--base", default=None,
        help="Optional additional labeled CSV to merge (e.g. older batch)."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Report distribution only; do not write output file."
    )
    args = parser.parse_args()

    # ── load human labels (required) ─────────────────────────────────────────
    if not HUMAN_PATH.exists():
        print(
            f"[merge] ERROR: human_labels_v1.csv not found at {HUMAN_PATH}\n"
            f"        Run import_labeled_csv.py first.",
            file=sys.stderr
        )
        sys.exit(1)

    all_rows = _load_csv(HUMAN_PATH, "human_labels_v1")

    # ── load optional base CSV ────────────────────────────────────────────────
    if args.base:
        base_path = Path(args.base)
        base_rows = _load_csv(base_path, f"base({base_path.name})")
        all_rows  = base_rows + all_rows   # human labels appended last → win on dedup

    # ── dedup ─────────────────────────────────────────────────────────────────
    all_rows = _dedup(all_rows)

    if not all_rows:
        print("[merge] ERROR: No valid rows after deduplication.", file=sys.stderr)
        sys.exit(1)

    _print_distribution(all_rows)

    if args.dry_run:
        print("[merge] Dry-run mode — not writing.")
        return

    # ── write ─────────────────────────────────────────────────────────────────
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"[merge] Written {len(all_rows)} rows → {OUT_PATH}")
    print(f"[merge] Next step: train new TF-IDF + GBM model on this dataset.")


if __name__ == "__main__":
    main()
