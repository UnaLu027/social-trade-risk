#!/usr/bin/env python3
"""
import_labeled_csv.py
====================
Validate and import a human-annotated CSV into human_labels_v1.csv.

Validation rules:
  - text:            must be non-empty
  - risk_label:      must be exactly Low | Medium | High
  - direction_label: must be exactly bullish | bearish | neutral

Deduplication:
  SHA256 hash of lowercased, whitespace-normalized text.
  Rows whose text already exists in human_labels_v1.csv are skipped.

Output:
  backend/app/ml/training/data/human_labels_v1.csv

Output columns:
  text, risk_label, direction_label, source_dataset, source_type,
  label_method, notes, sample_weight

Usage:
  python scripts/import_labeled_csv.py --input annotation_queue_20260608_labeled.csv
  python scripts/import_labeled_csv.py --input labeled.csv --dry-run
  python scripts/import_labeled_csv.py --input labeled.csv --sample-weight 3.0
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from pathlib import Path

VALID_RISK      = {"Low", "Medium", "High"}
VALID_DIRECTION = {"bullish", "bearish", "neutral"}

SCRIPT_DIR  = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_DIR / "backend"

OUT_DIR  = BACKEND_DIR / "app" / "ml" / "training" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_PATH = OUT_DIR / "human_labels_v1.csv"

OUT_FIELDNAMES = [
    "text", "risk_label", "direction_label",
    "source_dataset", "source_type", "label_method",
    "notes", "sample_weight",
]


def _hash(text: str) -> str:
    norm = " ".join(text.lower().split())
    return hashlib.sha256(norm.encode()).hexdigest()


def _load_existing_hashes() -> set[str]:
    """Return set of text hashes already in human_labels_v1.csv."""
    if not OUT_PATH.exists():
        return set()
    hashes: set[str] = set()
    with open(OUT_PATH, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            t = row.get("text", "").strip()
            if t:
                hashes.add(_hash(t))
    return hashes


def _normalize_label(val: str) -> str:
    """Normalize capitalization for common typos: LOW → Low, BULLISH → bullish."""
    v = val.strip()
    # risk label
    if v.lower() in {"low", "medium", "high"}:
        return v.capitalize()
    # direction label
    if v.lower() in {"bullish", "bearish", "neutral"}:
        return v.lower()
    return v


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate and import human-labeled annotation CSV."
    )
    parser.add_argument(
        "--input", required=True,
        help="Path to the labeled CSV file."
    )
    parser.add_argument(
        "--source-dataset", default="annotation_queue",
        help="Source dataset tag written to output (default: annotation_queue)"
    )
    parser.add_argument(
        "--label-method", default="human",
        help="Label method tag (default: human)"
    )
    parser.add_argument(
        "--sample-weight", default=2.0, type=float,
        help="Sample weight for training. human=2.0 (default), synthetic=1.0"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Validate only; do not write to human_labels_v1.csv"
    )
    args = parser.parse_args()

    in_path = Path(args.input)
    if not in_path.exists():
        print(f"[import] ERROR: Input file not found: {in_path}", file=sys.stderr)
        sys.exit(1)

    existing_hashes = _load_existing_hashes()
    existing_count  = len(existing_hashes)
    print(f"[import] Existing human_labels_v1.csv: {existing_count} records.")
    print(f"[import] Reading: {in_path}")

    errors:    list[str]  = []
    new_rows:  list[dict] = []
    n_dup     = 0
    n_invalid = 0
    n_blank_label = 0

    with open(in_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        if "text" not in fields:
            print("[import] ERROR: CSV must have a 'text' column.", file=sys.stderr)
            sys.exit(1)

        for line_num, row in enumerate(reader, start=2):
            text  = row.get("text", "").strip()
            risk  = _normalize_label(row.get("risk_label", ""))
            direc = _normalize_label(row.get("direction_label", ""))
            notes = row.get("notes", "").strip()
            src_type = row.get("source", "user_input").strip()

            # ── validation ────────────────────────────────────────────────
            if not text:
                errors.append(f"Line {line_num}: empty text — skipped")
                n_invalid += 1
                continue

            if not risk or not direc:
                # Row not yet annotated (one or both labels blank) — skip
                n_blank_label += 1
                continue

            if risk not in VALID_RISK:
                errors.append(
                    f"Line {line_num}: invalid risk_label='{risk}' "
                    f"(must be Low/Medium/High) text='{text[:40]}' — skipped"
                )
                n_invalid += 1
                continue

            if direc not in VALID_DIRECTION:
                errors.append(
                    f"Line {line_num}: invalid direction_label='{direc}' "
                    f"(must be bullish/bearish/neutral) text='{text[:40]}' — skipped"
                )
                n_invalid += 1
                continue

            # ── deduplication ─────────────────────────────────────────────
            h = _hash(text)
            if h in existing_hashes:
                n_dup += 1
                continue
            existing_hashes.add(h)

            new_rows.append({
                "text":           text,
                "risk_label":     risk,
                "direction_label": direc,
                "source_dataset": args.source_dataset,
                "source_type":    src_type,
                "label_method":   args.label_method,
                "notes":          notes,
                "sample_weight":  args.sample_weight,
            })

    # ── report ────────────────────────────────────────────────────────────────
    if errors:
        print(f"\n[import] Validation issues ({len(errors)} rows):")
        for e in errors[:30]:
            print(f"  {e}")
        if len(errors) > 30:
            print(f"  ... and {len(errors) - 30} more")
        print()

    print(f"[import] Results:")
    print(f"  New rows to import:    {len(new_rows)}")
    print(f"  Skipped (duplicate):   {n_dup}")
    print(f"  Skipped (invalid):     {n_invalid}")
    print(f"  Skipped (blank label): {n_blank_label}")

    if n_blank_label > 0 and len(new_rows) == 0 and n_invalid == 0:
        print(
            "\n[import] All rows were skipped because risk_label or direction_label is empty.\n"
            "         Open the CSV in Excel / Google Sheets, fill in both columns,\n"
            "         then re-run without --dry-run to import."
        )

    if args.dry_run:
        print("[import] Dry-run mode — not writing.")
        if errors:
            sys.exit(1)
        return

    if not new_rows:
        print("[import] Nothing new to import. human_labels_v1.csv unchanged.")
        return

    # Append or create
    write_header = not OUT_PATH.exists()
    with open(OUT_PATH, "a" if not write_header else "w",
              newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_FIELDNAMES)
        if write_header:
            writer.writeheader()
        writer.writerows(new_rows)

    total = existing_count + len(new_rows)
    print(f"\n[import] Written {len(new_rows)} new rows → {OUT_PATH}")
    print(f"[import] human_labels_v1.csv total: ~{total} records.")
    print(f"[import] Next step: python scripts/merge_training_data.py")

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
