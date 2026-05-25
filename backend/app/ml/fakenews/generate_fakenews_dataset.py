"""
Generates a synthetic fake news training dataset with research-backed patterns.
No external downloads needed — fully self-contained.

KEY FIX: source_credibility distributions now OVERLAP significantly so the model
CANNOT rely solely on this one feature. It must learn the true linguistic signals:
uppercase ratio, exclamation density, sentiment extremity, word diversity, etc.

Run: python -m app.ml.fakenews.generate_fakenews_dataset
"""
import os
import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "fakenews_dataset.csv")

FEATURE_NAMES = [
    "word_count",
    "uppercase_ratio",
    "exclamation_count",
    "question_count",
    "sentiment_score",
    "sentiment_extremity",
    "avg_word_length",
    "unique_word_ratio",
    "stock_mention_count",
    "url_count",
    "quote_count",
    "source_credibility",
]


def _generate_fake_samples(n: int) -> list[dict]:
    """
    Generate fake news feature vectors (label=1).
    Characteristics:
    - Short to medium length (sensational social-media style)
    - HIGH uppercase ratio (shouting)
    - MANY exclamation marks
    - EXTREME sentiment (very pos or very neg)
    - LOW unique word ratio (repetitive)
    - SHORT average word length (simple words)
    - source_credibility OVERLAPS with real (0.1 – 0.7) so model can't cheat
    """
    rows = []
    for _ in range(n):
        # Fake news comes in two flavours: short social posts and longer articles
        if RNG.random() < 0.4:
            # Short sensational post (10-60 words)
            word_count = int(RNG.integers(10, 60))
            uppercase_ratio = float(RNG.uniform(0.35, 0.95))   # very high
            exclamation_count = int(RNG.integers(3, 15))
            unique_word_ratio = float(RNG.uniform(0.50, 0.85)) # short text → naturally higher
            avg_word_length = float(RNG.uniform(3.5, 5.0))
        else:
            # Longer fake article (60-400 words)
            word_count = int(RNG.integers(60, 400))
            uppercase_ratio = float(RNG.uniform(0.12, 0.50))
            exclamation_count = int(RNG.integers(2, 12))
            unique_word_ratio = float(RNG.uniform(0.28, 0.55))
            avg_word_length = float(RNG.uniform(3.8, 5.5))

        question_count = int(RNG.integers(0, 8))

        # Extreme sentiment (very positive OR very negative)
        polarity = RNG.choice([-1, 1])
        sentiment_score = float(polarity * RNG.uniform(0.55, 1.0))
        sentiment_extremity = abs(sentiment_score)

        stock_mention_count = int(RNG.integers(1, 9))  # fake news loves name-dropping tickers
        url_count = int(RNG.integers(0, 3))
        quote_count = int(RNG.integers(0, 2))

        # OVERLAPPING credibility: fake articles can appear on semi-credible sites
        source_credibility = float(RNG.uniform(0.05, 0.65))

        rows.append({
            "word_count": word_count,
            "uppercase_ratio": uppercase_ratio,
            "exclamation_count": exclamation_count,
            "question_count": question_count,
            "sentiment_score": sentiment_score,
            "sentiment_extremity": sentiment_extremity,
            "avg_word_length": avg_word_length,
            "unique_word_ratio": unique_word_ratio,
            "stock_mention_count": stock_mention_count,
            "url_count": url_count,
            "quote_count": quote_count,
            "source_credibility": source_credibility,
            "label": 1,
        })
    return rows


def _generate_real_samples(n: int) -> list[dict]:
    """
    Generate real news feature vectors (label=0).
    Characteristics:
    - Medium to long length (journalistic style)
    - LOW uppercase ratio
    - FEW or zero exclamation marks
    - MODERATE sentiment
    - HIGH unique word ratio (varied vocabulary)
    - LONGER average word length (formal language)
    - source_credibility OVERLAPS with fake (0.35 – 1.0)
    """
    rows = []
    for _ in range(n):
        word_count = int(RNG.integers(80, 900))
        uppercase_ratio = float(RNG.uniform(0.00, 0.12))   # low
        exclamation_count = int(RNG.integers(0, 2))          # rarely any
        question_count = int(RNG.integers(0, 4))

        # Financial journalism can express STRONG opinions (negative earnings,
        # market crashes, positive breakthroughs) — range must be wide.
        # Key differentiators from fake: structure, not just magnitude.
        sentiment_score = float(RNG.uniform(-0.82, 0.82))
        sentiment_extremity = abs(sentiment_score)

        avg_word_length = float(RNG.uniform(5.0, 8.5))      # formal vocabulary
        unique_word_ratio = float(RNG.uniform(0.55, 0.92))  # diverse wording

        stock_mention_count = int(RNG.integers(0, 4))
        url_count = int(RNG.integers(0, 6))
        quote_count = int(RNG.integers(1, 7))               # real journalism quotes sources

        # OVERLAPPING credibility: some real news on lesser-known sites
        source_credibility = float(RNG.uniform(0.35, 1.0))

        rows.append({
            "word_count": word_count,
            "uppercase_ratio": uppercase_ratio,
            "exclamation_count": exclamation_count,
            "question_count": question_count,
            "sentiment_score": sentiment_score,
            "sentiment_extremity": sentiment_extremity,
            "avg_word_length": avg_word_length,
            "unique_word_ratio": unique_word_ratio,
            "stock_mention_count": stock_mention_count,
            "url_count": url_count,
            "quote_count": quote_count,
            "source_credibility": source_credibility,
            "label": 0,
        })
    return rows


def _add_noise(rows: list[dict], noise_scale: float = 0.08) -> list[dict]:
    """Add Gaussian noise to numeric features to increase diversity."""
    noisy = []
    for row in rows:
        r = dict(row)
        for field in FEATURE_NAMES:
            v = r[field]
            if field in ("word_count", "exclamation_count", "question_count",
                         "stock_mention_count", "url_count", "quote_count"):
                r[field] = max(0, int(v + RNG.normal(0, max(abs(v) * noise_scale, 0.5))))
            elif field in ("uppercase_ratio", "unique_word_ratio", "source_credibility"):
                r[field] = float(np.clip(v + RNG.normal(0, noise_scale * 0.3), 0.0, 1.0))
            elif field == "sentiment_score":
                r[field] = float(np.clip(v + RNG.normal(0, noise_scale), -1.0, 1.0))
                r["sentiment_extremity"] = abs(r["sentiment_score"])
            elif field != "sentiment_extremity":
                r[field] = float(np.clip(v + RNG.normal(0, abs(v) * noise_scale + 0.01), 0.0, None))
        noisy.append(r)
    return noisy


def generate(output_path: str = OUTPUT_PATH, target_rows: int = 6000) -> pd.DataFrame:
    """Generate synthetic fake news dataset and save to CSV."""
    n_fake = target_rows // 2
    n_real = target_rows - n_fake

    # Generate base samples (1/3 of target each)
    fake_base = _generate_fake_samples(n_fake // 3)
    real_base = _generate_real_samples(n_real // 3)

    # Augment with noise to reach target count
    fake_augmented = _add_noise(fake_base * ((n_fake // len(fake_base)) + 1))[:n_fake]
    real_augmented = _add_noise(real_base * ((n_real // len(real_base)) + 1))[:n_real]

    all_rows = fake_augmented + real_augmented
    df = pd.DataFrame(all_rows)
    df = df[FEATURE_NAMES + ["label"]]

    # Clip edge cases
    df["uppercase_ratio"]    = df["uppercase_ratio"].clip(0, 1)
    df["unique_word_ratio"]  = df["unique_word_ratio"].clip(0, 1)
    df["source_credibility"] = df["source_credibility"].clip(0, 1)
    df["sentiment_score"]    = df["sentiment_score"].clip(-1, 1)
    df["sentiment_extremity"]= df["sentiment_extremity"].clip(0, 1)
    df["word_count"]         = df["word_count"].clip(1, None)
    df["avg_word_length"]    = df["avg_word_length"].clip(2.0, None)

    df = df.sample(frac=1, random_state=42).reset_index(drop=True).iloc[:target_rows]

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Generated {len(df)} rows -> {output_path}")
    print(f"Label distribution:\n{df['label'].value_counts()}")
    return df


if __name__ == "__main__":
    generate()
