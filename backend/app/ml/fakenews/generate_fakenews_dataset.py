"""
Generates a synthetic fake news training dataset with research-backed patterns.
No external downloads needed — fully self-contained.
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
    """Generate fake news feature vectors (label=1)."""
    rows = []
    for _ in range(n):
        word_count = int(RNG.integers(30, 300))
        uppercase_ratio = float(RNG.uniform(0.18, 0.60))  # high uppercase
        exclamation_count = int(RNG.integers(3, 20))       # many exclamations
        question_count = int(RNG.integers(0, 8))
        # Extreme sentiment (very positive or very negative)
        polarity = RNG.choice([-1, 1])
        sentiment_score = float(polarity * RNG.uniform(0.6, 1.0))
        sentiment_extremity = abs(sentiment_score)
        avg_word_length = float(RNG.uniform(3.5, 5.5))     # shorter words
        unique_word_ratio = float(RNG.uniform(0.30, 0.55)) # more repetition
        stock_mention_count = int(RNG.integers(0, 8))
        url_count = int(RNG.integers(0, 3))
        quote_count = int(RNG.integers(0, 2))
        source_credibility = float(RNG.uniform(0.0, 0.35)) # low credibility
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
    """Generate real news feature vectors (label=0)."""
    rows = []
    for _ in range(n):
        word_count = int(RNG.integers(80, 800))
        uppercase_ratio = float(RNG.uniform(0.01, 0.10))   # low uppercase
        exclamation_count = int(RNG.integers(0, 2))          # few exclamations
        question_count = int(RNG.integers(0, 4))
        # Moderate sentiment
        sentiment_score = float(RNG.uniform(-0.45, 0.45))
        sentiment_extremity = abs(sentiment_score)
        avg_word_length = float(RNG.uniform(5.0, 8.0))      # longer words
        unique_word_ratio = float(RNG.uniform(0.55, 0.90))  # more variety
        stock_mention_count = int(RNG.integers(0, 5))
        url_count = int(RNG.integers(0, 5))
        quote_count = int(RNG.integers(1, 6))
        source_credibility = float(RNG.uniform(0.55, 1.0))  # high credibility
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
    numeric_fields = FEATURE_NAMES
    for row in rows:
        r = dict(row)
        for field in numeric_fields:
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


def generate(output_path: str = OUTPUT_PATH, target_rows: int = 5000) -> pd.DataFrame:
    """Generate synthetic fake news dataset and save to CSV."""
    n_fake = target_rows // 2
    n_real = target_rows - n_fake

    # Generate base samples
    fake_base = _generate_fake_samples(n_fake // 3)
    real_base = _generate_real_samples(n_real // 3)

    # Augment with noise to reach target count
    fake_augmented = _add_noise(fake_base * ((n_fake // len(fake_base)) + 1))[:n_fake]
    real_augmented = _add_noise(real_base * ((n_real // len(real_base)) + 1))[:n_real]

    all_rows = fake_augmented + real_augmented
    df = pd.DataFrame(all_rows)

    # Reorder columns
    df = df[FEATURE_NAMES + ["label"]]

    # Clip edge cases
    df["uppercase_ratio"] = df["uppercase_ratio"].clip(0, 1)
    df["unique_word_ratio"] = df["unique_word_ratio"].clip(0, 1)
    df["source_credibility"] = df["source_credibility"].clip(0, 1)
    df["sentiment_score"] = df["sentiment_score"].clip(-1, 1)
    df["sentiment_extremity"] = df["sentiment_extremity"].clip(0, 1)
    df["word_count"] = df["word_count"].clip(1, None)
    df["avg_word_length"] = df["avg_word_length"].clip(2.0, None)

    # Shuffle
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    df = df.iloc[:target_rows]

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Generated {len(df)} rows -> {output_path}")
    print(f"Label distribution:\n{df['label'].value_counts()}")
    return df


if __name__ == "__main__":
    generate()
