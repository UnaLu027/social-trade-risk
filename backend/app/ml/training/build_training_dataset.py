"""
build_training_dataset.py
=========================
Build a training CSV from the SQL Server demo seed data (social_posts + risk_snapshots).

Usage:
    cd backend
    python -m app.ml.training.build_training_dataset

Outputs (saved to backend/app/ml/training/data/):
    training_data.csv      — feature matrix + label column
    feature_names.json     — ordered list of feature column names
    label_mapping.json     — {0: "Low", 1: "Medium", 2: "High", 3: "Critical"}

Data notes:
    - All data is demo/weak-label synthetic data.
    - Labels: Low=0, Medium=1, High=2, Critical=3
    - No data leakage: text features derived only from post content,
      not from the risk_label column itself.
    - US stocks only (no .TW symbols).

Phase 2: replace/augment with Financial PhraseBank / WallStreetBets public datasets.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# ── allow running from project root ─────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[4]   # social-trade-risk/backend
sys.path.insert(0, str(ROOT))

import pandas as pd

# ── output directory ──────────────────────────────────────────────────────────
OUT_DIR = Path(__file__).parent / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── label mapping ─────────────────────────────────────────────────────────────
LABEL_MAP = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}
LABEL_MAP_INV = {v: k for k, v in LABEL_MAP.items()}

# ── keyword features ──────────────────────────────────────────────────────────
HYPE_TERMS    = ["moon","squeeze","diamond","hodl","trapped","explodes","apes","tendies","yolo","wsb"]
FOMO_TERMS    = ["buy now","last chance","miss out","don't miss","act fast","before it"]
SQUEEZE_TERMS = ["short squeeze","short interest","shorts are trapped","hedge fund","citadel","forced to cover"]
MANIP_TERMS   = ["guaranteed","can't lose","easy money","100%","manipulation","suppressing"]
URGENCY_TERMS = ["now or never","act now","do it now","limited time","before close","this is it"]


def _keyword_features(text: str) -> dict:
    lower = text.lower()
    return {
        "hype_term_count":    sum(1 for t in HYPE_TERMS    if t in lower),
        "fomo_term_count":    sum(1 for t in FOMO_TERMS    if t in lower),
        "squeeze_term_count": sum(1 for t in SQUEEZE_TERMS if t in lower),
        "manip_term_count":   sum(1 for t in MANIP_TERMS   if t in lower),
        "urgency_term_count": sum(1 for t in URGENCY_TERMS if t in lower),
        "text_length":        len(text.split()),
        "exclamation_count":  text.count("!"),
        "caps_ratio":         sum(1 for c in text if c.isupper()) / max(len(text), 1),
        "emoji_count":        len(re.findall(r'[^\x00-\x7F]', text)),
    }


def load_from_sqlserver() -> pd.DataFrame:
    """Try to connect to SQL Server and pull social_posts + risk_snapshots."""
    try:
        import pyodbc  # type: ignore

        # Prefer environment variable; fall back to local SSMS instance
        import os
        server   = os.getenv("DB_SERVER",   r"UNA-ASUS-NB1\SQLEXPRESS")
        database = os.getenv("DB_NAME",     "SocialTradingRisk")
        user     = os.getenv("DB_USER",     "")
        password = os.getenv("DB_PASSWORD", "")

        if user:
            conn_str = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={server};DATABASE={database};"
                f"UID={user};PWD={password};TrustServerCertificate=yes"
            )
        else:
            conn_str = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={server};DATABASE={database};"
                f"Trusted_Connection=yes;TrustServerCertificate=yes"
            )

        conn = pyodbc.connect(conn_str, timeout=10)
        print(f"[dataset] Connected to SQL Server: {server}/{database}")

        posts_df = pd.read_sql(
            "SELECT symbol, content, risk_label, hype_label, manipulation_label, sentiment_label "
            "FROM social_posts WHERE risk_label IS NOT NULL",
            conn,
        )

        snap_df = pd.read_sql(
            "SELECT symbol, AVG(social_hype_score) AS avg_hype, "
            "       AVG(manipulation_signal_score) AS avg_manip, "
            "       AVG(fomo_score) AS avg_fomo, "
            "       AVG(short_squeeze_pressure) AS avg_squeeze, "
            "       AVG(bullish_ratio) AS avg_bullish "
            "FROM risk_snapshots "
            "WHERE data_quality IN ('demo','good') "
            "GROUP BY symbol",
            conn,
        )
        conn.close()

        df = posts_df.merge(snap_df, on="symbol", how="left")
        print(f"[dataset] Loaded {len(df)} rows from SQL Server.")
        return df

    except Exception as e:
        print(f"[dataset] SQL Server unavailable ({e}), using embedded demo data.")
        return pd.DataFrame()


def load_demo_data() -> pd.DataFrame:
    """Embedded demo data that mirrors seed_product_demo_sqlserver.sql."""
    rows = [
        # GME Critical
        {"symbol": "GME", "content": "GME to the moon! Shorts are trapped. Buy now before it explodes.",        "risk_label": "Critical", "hype_label": "high",   "avg_hype": 99, "avg_manip": 95, "avg_fomo": 98, "avg_squeeze": 99, "avg_bullish": 0.95},
        {"symbol": "GME", "content": "Diamond hands. Hold the line. This is THE squeeze.",                       "risk_label": "High",     "hype_label": "high",   "avg_hype": 96, "avg_manip": 90, "avg_fomo": 94, "avg_squeeze": 98, "avg_bullish": 0.91},
        {"symbol": "GME", "content": "The short interest is insane. Retail is not leaving. Citadel is scared.",  "risk_label": "Critical", "hype_label": "high",   "avg_hype": 99, "avg_manip": 95, "avg_fomo": 98, "avg_squeeze": 99, "avg_bullish": 0.95},
        {"symbol": "GME", "content": "Every hedge fund short on GME is about to get destroyed. HODL.",           "risk_label": "Critical", "hype_label": "high",   "avg_hype": 99, "avg_manip": 95, "avg_fomo": 98, "avg_squeeze": 99, "avg_bullish": 0.95},
        {"symbol": "GME", "content": "Short interest above 140%, this is mathematically impossible to sustain.", "risk_label": "High",     "hype_label": "high",   "avg_hype": 96, "avg_manip": 90, "avg_fomo": 94, "avg_squeeze": 98, "avg_bullish": 0.91},
        {"symbol": "GME", "content": "Robinhood just restricted GME buying. This is the final proof shorts own the brokers.", "risk_label": "Critical", "hype_label": "high", "avg_hype": 99, "avg_manip": 97, "avg_fomo": 97, "avg_squeeze": 97, "avg_bullish": 0.87},
        # AMC High
        {"symbol": "AMC", "content": "AMC has huge retail momentum and could squeeze next.",      "risk_label": "High",   "hype_label": "medium", "avg_hype": 78, "avg_manip": 66, "avg_fomo": 73, "avg_squeeze": 82, "avg_bullish": 0.79},
        {"symbol": "AMC", "content": "AMC to the moon after GME. Retail army never sleeps.",      "risk_label": "High",   "hype_label": "high",   "avg_hype": 78, "avg_manip": 66, "avg_fomo": 73, "avg_squeeze": 82, "avg_bullish": 0.79},
        {"symbol": "AMC", "content": "AMC squeeze is inevitable. The same pattern as GME.",        "risk_label": "High",   "hype_label": "high",   "avg_hype": 78, "avg_manip": 66, "avg_fomo": 73, "avg_squeeze": 82, "avg_bullish": 0.79},
        # BB Medium
        {"symbol": "BB",  "content": "BB is getting meme-stock attention but the thesis is mixed.", "risk_label": "Medium", "hype_label": "medium", "avg_hype": 70, "avg_manip": 58, "avg_fomo": 66, "avg_squeeze": 74, "avg_bullish": 0.74},
        {"symbol": "BB",  "content": "BlackBerry still has patents. Not a pure squeeze but retail is watching.", "risk_label": "Medium", "hype_label": "medium", "avg_hype": 70, "avg_manip": 58, "avg_fomo": 66, "avg_squeeze": 74, "avg_bullish": 0.74},
        # KOSS High
        {"symbol": "KOSS","content": "KOSS volume is exploding and everyone is watching it.",      "risk_label": "High",   "hype_label": "medium", "avg_hype": 76, "avg_manip": 62, "avg_fomo": 71, "avg_squeeze": 80, "avg_bullish": 0.77},
        {"symbol": "KOSS","content": "KOSS has insane short float, tiny company, huge leverage for squeeze.", "risk_label": "High", "hype_label": "high", "avg_hype": 76, "avg_manip": 62, "avg_fomo": 71, "avg_squeeze": 80, "avg_bullish": 0.77},
        # NOK Medium
        {"symbol": "NOK", "content": "NOK is being mentioned more but the setup is not as extreme.", "risk_label": "Medium", "hype_label": "medium", "avg_hype": 60, "avg_manip": 44, "avg_fomo": 55, "avg_squeeze": 52, "avg_bullish": 0.68},
        # TSLA Medium/Low
        {"symbol": "TSLA","content": "Tesla discussion is bullish but mostly based on earnings expectations.", "risk_label": "Medium", "hype_label": "low", "avg_hype": 52, "avg_manip": 31, "avg_fomo": 44, "avg_squeeze": 26, "avg_bullish": 0.64},
        {"symbol": "TSLA","content": "TSLA holders are retail too but it's more about product story.", "risk_label": "Low", "hype_label": "low", "avg_hype": 52, "avg_manip": 31, "avg_fomo": 44, "avg_squeeze": 26, "avg_bullish": 0.64},
        # PLTR Medium
        {"symbol": "PLTR","content": "PLTR has loyal retail holders but today discussion looks normal.",    "risk_label": "Medium", "hype_label": "low", "avg_hype": 55, "avg_manip": 36, "avg_fomo": 48, "avg_squeeze": 34, "avg_bullish": 0.66},
        # NVDA Low
        {"symbol": "NVDA","content": "NVDA is trending due to AI news, not a short squeeze narrative.",     "risk_label": "Low",    "hype_label": "low", "avg_hype": 42, "avg_manip": 24, "avg_fomo": 31, "avg_squeeze": 18, "avg_bullish": 0.59},
        {"symbol": "NVDA","content": "NVIDIA earnings beat. Institutional and retail both love it. No hype risk.", "risk_label": "Low", "hype_label": "low", "avg_hype": 42, "avg_manip": 24, "avg_fomo": 31, "avg_squeeze": 18, "avg_bullish": 0.59},
    ]
    return pd.DataFrame(rows)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build feature matrix from raw dataframe."""
    records = []
    for _, row in df.iterrows():
        text = str(row.get("content", ""))
        kw   = _keyword_features(text)

        records.append({
            # Text features
            **kw,
            # Social / market features (from risk_snapshots, may be NaN for new posts)
            "avg_hype_score":      float(row.get("avg_hype",    0) or 0),
            "avg_manip_score":     float(row.get("avg_manip",   0) or 0),
            "avg_fomo_score":      float(row.get("avg_fomo",    0) or 0),
            "avg_squeeze_pressure":float(row.get("avg_squeeze", 0) or 0),
            "avg_bullish_ratio":   float(row.get("avg_bullish", 0.5) or 0.5),
            # Label (integer)
            "label": LABEL_MAP.get(str(row.get("risk_label", "Low")), 0),
            # Metadata
            "symbol": row.get("symbol", "UNKNOWN"),
            "data_source": "demo_weak_label",
        })

    return pd.DataFrame(records)


def main():
    # 1. Load data (SQL Server → demo fallback)
    df_raw = load_from_sqlserver()
    if df_raw.empty:
        df_raw = load_demo_data()

    # 2. Build features
    df_feat = build_features(df_raw)
    print(f"[dataset] Feature matrix: {df_feat.shape}")
    print(f"[dataset] Label distribution:\n{df_feat['label'].value_counts().sort_index().to_string()}")

    # 3. Save
    csv_path = OUT_DIR / "training_data.csv"
    df_feat.to_csv(csv_path, index=False)
    print(f"[dataset] Saved → {csv_path}")

    feature_names = [c for c in df_feat.columns if c not in ("label", "symbol", "data_source")]
    with open(OUT_DIR / "feature_names.json", "w") as f:
        json.dump(feature_names, f, indent=2)

    with open(OUT_DIR / "label_mapping.json", "w") as f:
        json.dump(LABEL_MAP_INV, f, indent=2)

    print("[dataset] Done.")


if __name__ == "__main__":
    main()
