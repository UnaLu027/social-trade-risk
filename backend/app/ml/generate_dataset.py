"""
Generates ~8,000 labeled training rows for the hype risk classifier.
Uses rule-based synthetic scenarios modeled after GME/AMC 2021 patterns.

⚠ Leakage note:
  `hype_score_raw` is computed from [mention_growth_ratio, bullish_ratio,
  volume_spike_ratio, avg_sentiment, price_change_pct_1h, option_volume_spike]
  and the label function also uses `hype_score_raw > 75` as a threshold.
  To reduce label leakage, labels are noised by `LABEL_NOISE_RATE` (5% random flip).
  `experiment_train.py` runs a second experiment WITHOUT `hype_score_raw` to
  quantify the leakage impact.

Run: python -m app.ml.generate_dataset
"""
import json
import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from app.ml.feature_engineering import compute_hype_score, FEATURE_NAMES, EXTENDED_FEATURE_NAMES
from app.ml.text_features import simulate_from_signals, TEXT_FEATURE_NAMES

RNG = np.random.default_rng(42)
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "training_data.csv")

# Fraction of labels that are randomly flipped to reduce rule-leakage determinism.
LABEL_NOISE_RATE = 0.05


def _label(row: pd.Series) -> int:
    hype = row["hype_score_raw"]
    mgr = row["mention_growth_ratio"]
    vsr = row["volume_spike_ratio"]
    sir = row["short_interest_ratio"]
    if (mgr > 2.0 and vsr > 2.5) or hype > 75 or (sir > 0.35 and mgr > 1.5):
        return 2
    if hype > 40 or mgr > 1.0:
        return 1
    return 0


def _augment(base: dict, n: int, noise_scale: float = 0.15) -> list[dict]:
    rows = []
    for _ in range(n):
        noisy = {}
        for k, v in base.items():
            if k == "hour_of_day":
                noisy[k] = int(np.clip(v + RNG.integers(-2, 3), 0, 23))
            else:
                noisy[k] = float(np.clip(v + RNG.normal(0, abs(v) * noise_scale + 0.01), 0 if k != "avg_sentiment" and k != "price_change_pct_1h" and k != "price_change_pct_24h" else -10, 100))
        rows.append(noisy)
    return rows


def _make_base_scenarios() -> list[dict]:
    scenarios = []

    # Low risk baseline (normal stocks)
    for _ in range(60):
        mgr = float(RNG.uniform(0.8, 1.2))
        br = float(RNG.uniform(0.4, 0.6))
        vs = float(RNG.uniform(0.7, 1.3))
        sent = float(RNG.uniform(-0.1, 0.2))
        pc1h = float(RNG.uniform(-0.02, 0.02))
        si = float(RNG.uniform(0.02, 0.1))
        opt = float(RNG.uniform(0.8, 1.2))
        mc1h = int(RNG.integers(5, 50))
        mc24h = int(mc1h * RNG.integers(15, 25))
        hype = compute_hype_score(mgr, br, vs, sent, pc1h, opt)
        scenarios.append({
            "mention_count_1h": mc1h, "mention_count_24h": mc24h,
            "mention_growth_ratio": mgr, "bullish_ratio": br,
            "avg_sentiment": sent, "influencer_score": float(RNG.uniform(0, 100)),
            "price_change_pct_1h": pc1h, "price_change_pct_24h": pc1h * RNG.uniform(2, 5),
            "volume_spike_ratio": vs, "short_interest_ratio": si,
            "option_volume_spike": opt, "hype_score_raw": hype,
            "hour_of_day": int(RNG.integers(9, 17)),
        })

    # Medium risk (elevated social activity)
    for _ in range(50):
        mgr = float(RNG.uniform(1.2, 2.5))
        br = float(RNG.uniform(0.55, 0.75))
        vs = float(RNG.uniform(1.2, 2.5))
        sent = float(RNG.uniform(0.1, 0.4))
        pc1h = float(RNG.uniform(0.02, 0.12))
        si = float(RNG.uniform(0.08, 0.25))
        opt = float(RNG.uniform(1.2, 2.5))
        mc1h = int(RNG.integers(50, 300))
        mc24h = int(mc1h * RNG.integers(12, 20))
        hype = compute_hype_score(mgr, br, vs, sent, pc1h, opt)
        scenarios.append({
            "mention_count_1h": mc1h, "mention_count_24h": mc24h,
            "mention_growth_ratio": mgr, "bullish_ratio": br,
            "avg_sentiment": sent, "influencer_score": float(RNG.uniform(50, 500)),
            "price_change_pct_1h": pc1h, "price_change_pct_24h": pc1h * RNG.uniform(2, 5),
            "volume_spike_ratio": vs, "short_interest_ratio": si,
            "option_volume_spike": opt, "hype_score_raw": hype,
            "hour_of_day": int(RNG.integers(6, 23)),
        })

    # High risk (squeeze-like conditions, modeled after GME Jan 2021)
    for _ in range(40):
        mgr = float(RNG.uniform(2.5, 8.0))
        br = float(RNG.uniform(0.70, 0.95))
        vs = float(RNG.uniform(2.5, 6.0))
        sent = float(RNG.uniform(0.35, 0.85))
        pc1h = float(RNG.uniform(0.10, 0.50))
        si = float(RNG.uniform(0.25, 0.65))
        opt = float(RNG.uniform(2.5, 5.0))
        mc1h = int(RNG.integers(300, 2000))
        mc24h = int(mc1h * RNG.integers(15, 30))
        hype = compute_hype_score(mgr, br, vs, sent, pc1h, opt)
        scenarios.append({
            "mention_count_1h": mc1h, "mention_count_24h": mc24h,
            "mention_growth_ratio": mgr, "bullish_ratio": br,
            "avg_sentiment": sent, "influencer_score": float(RNG.uniform(500, 5000)),
            "price_change_pct_1h": pc1h, "price_change_pct_24h": pc1h * RNG.uniform(3, 8),
            "volume_spike_ratio": vs, "short_interest_ratio": si,
            "option_volume_spike": opt, "hype_score_raw": hype,
            "hour_of_day": int(RNG.integers(0, 23)),
        })

    return scenarios


def _add_derived_features(df: pd.DataFrame) -> pd.DataFrame:
    """Append the three extended features to a base-feature DataFrame."""
    df["mention_accel"] = (
        df["mention_count_24h"] / (df["mention_count_1h"] * 24 + 1)
    ).clip(0, 10).round(4)
    df["sentiment_volume"] = (
        df["bullish_ratio"].clip(0, 1) * (df["volume_spike_ratio"] / 5.0).clip(0, 1)
    ).round(4)
    df["risk_composite"] = (
        df["mention_growth_ratio"] * df["volume_spike_ratio"] * (1.0 + df["short_interest_ratio"])
    ).clip(0, 50).round(4)
    return df


def _add_text_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Simulate 5 text signal features from existing numeric signals.
    Each row gets VADER-proxy + linguistic heuristic values computed via
    simulate_from_signals(), so experiment_train --textfeatures can use them.
    """
    rng = np.random.default_rng(99)   # separate seed for reproducibility
    text_rows = [
        simulate_from_signals(
            avg_sentiment=float(row["avg_sentiment"]),
            bullish_ratio=float(row["bullish_ratio"]),
            mention_growth_ratio=float(row["mention_growth_ratio"]),
            hype_score_raw=float(row["hype_score_raw"]),
            rng=rng,
        )
        for _, row in df.iterrows()
    ]
    text_df = pd.DataFrame(text_rows, index=df.index)
    return pd.concat([df, text_df], axis=1)


def generate(output_path: str = OUTPUT_PATH, target_rows: int = 8000) -> pd.DataFrame:
    base_scenarios = _make_base_scenarios()
    per_base = target_rows // len(base_scenarios) + 1

    all_rows = []
    for scenario in base_scenarios:
        all_rows.append(scenario)
        all_rows.extend(_augment(scenario, per_base - 1))

    df = pd.DataFrame(all_rows)[FEATURE_NAMES]
    # Clip to valid ranges
    df["bullish_ratio"] = df["bullish_ratio"].clip(0, 1)
    df["avg_sentiment"] = df["avg_sentiment"].clip(-1, 1)
    df["hype_score_raw"] = df["hype_score_raw"].clip(0, 100)
    df["hour_of_day"] = df["hour_of_day"].clip(0, 23).astype(int)

    # Deterministic label from rules
    df["label"] = df.apply(_label, axis=1)

    # ── Label noise: flip LABEL_NOISE_RATE fraction of rows to an adjacent class ──
    # This prevents the model from simply memorising the labelling rule.
    n_noise = max(1, int(len(df) * LABEL_NOISE_RATE))
    noise_idx = RNG.choice(len(df), size=n_noise, replace=False)
    # Flip: 0↔1, 1↔0 or 1↔2, 2↔1  (never jump 0↔2 directly)
    for i in noise_idx:
        orig = df.at[i, "label"]
        if orig == 0:
            df.at[i, "label"] = 1
        elif orig == 2:
            df.at[i, "label"] = 1
        else:  # 1 → flip to 0 or 2 with equal probability
            df.at[i, "label"] = int(RNG.choice([0, 2]))

    # ── Derived features (16-feature set) ───────────────────────────────────────
    df = _add_derived_features(df)

    # ── Text signal features (21-feature set, Phase 3) ──────────────────────────
    df = _add_text_features(df)

    # ── Shuffle BEFORE assigning timestamps ──────────────────────────────────────
    # Base scenarios are created in class order (low → medium → high). Shuffling
    # first ensures the synthetic timeline mixes all three classes throughout, so
    # time-based train/val/test split produces balanced class distributions in
    # each fold rather than grouping all low-risk rows into the training set.
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    df = df.iloc[:target_rows]

    # ── Synthetic timestamps (for time-based split support) ─────────────────────
    # Assigned AFTER shuffling so the temporal ordering is class-balanced.
    base_ts = datetime(2021, 1, 1)
    timestamps = [base_ts + timedelta(hours=int(i * 3)) for i in range(len(df))]
    df["synthetic_ts"] = timestamps

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Generated {len(df)} rows → {output_path}")
    print(f"Label distribution:\n{df['label'].value_counts()}")
    print(f"Label noise applied to ~{n_noise} rows ({LABEL_NOISE_RATE:.0%})")
    return df


if __name__ == "__main__":
    generate()
