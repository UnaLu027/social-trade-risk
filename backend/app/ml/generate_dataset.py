"""
Generates ~8,000 labeled training rows for the hype risk classifier.
Uses real GME/AMC yfinance price data as a skeleton + Gaussian noise augmentation.
Run: python -m app.ml.generate_dataset
"""
import json
import os
import numpy as np
import pandas as pd
from app.ml.feature_engineering import compute_hype_score, FEATURE_NAMES

RNG = np.random.default_rng(42)
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "training_data.csv")


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

    df["label"] = df.apply(_label, axis=1)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    df = df.iloc[:target_rows]

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Generated {len(df)} rows → {output_path}")
    print(f"Label distribution:\n{df['label'].value_counts()}")
    return df


if __name__ == "__main__":
    generate()
