"""
Text Signal Feature Extractor
==============================
Extracts 5 text-derived features from social media post text.

Design philosophy:
  In PRODUCTION  — features are computed from real post text using VADER
  sub-components + linguistic heuristics.  This is compatible with future
  replacement by Transformer embeddings (e.g., DistilBERT sentence vectors)
  without architectural changes: just swap _compute_from_text() outputs.

  In TRAINING    — synthetic data has no raw text, so features are *simulated*
  from existing numeric signals (avg_sentiment, bullish_ratio, mention_growth,
  hype_score_raw) with Gaussian noise, matching expected real-world distributions.

The 5 features
--------------
1. text_sentiment_compound  (-1 → +1)
   VADER compound score of the post body.
   High = strongly positive/bullish language.

2. text_exclamation_density (0 → 1)
   Fraction of sentences ending in "!" or containing "!!" / "🚀" / "moon".
   Proxy for retail excitement and FOMO signals.

3. text_manipulation_score  (0 → 1)
   Density of pump-and-dump / hype language:
   "guaranteed", "can't lose", "short squeeze", "to the moon", "apes", etc.
   High scores correlate with coordinated retail campaigns.

4. text_urgency_score       (0 → 1)
   Urgency markers: "NOW", "today", "last chance", countdown language,
   and rapid re-posting patterns.
   Elevated before price spikes in GME / AMC events.

5. text_credibility_score   (0 → 1)
   Inverse of manipulation: formal language, source citation, balanced tone.
   Low-credibility posts (score near 0) amplify risk signals.
"""

import re
from typing import Optional

import numpy as np

# ── Keyword lists ─────────────────────────────────────────────────────────────
_MANIPULATION_KEYWORDS = [
    "short squeeze", "gamma squeeze", "to the moon", "moon", "rocket",
    "apes together", "diamond hands", "hold the line", "wsb", "yolo",
    "guaranteed", "can't lose", "can't stop", "tendies", "retard",
    "100x", "1000x", "lambo", "buy now", "last chance",
]
_URGENCY_KEYWORDS = [
    "now", "today", "asap", "hurry", "breaking", "just in",
    "alert", "warning", "urgent", "before it's too late", "limited time",
    "last chance", "buying opportunity",
]
_CREDIBILITY_KEYWORDS = [
    "sec filing", "earnings report", "analyst", "p/e ratio", "dcf",
    "fundamentals", "balance sheet", "revenue", "guidance", "eps",
    "10-k", "10-q", "institutional", "hedge fund", "short interest report",
]

# ── Production: compute from real text ───────────────────────────────────────

def compute_from_text(text: str) -> dict:
    """
    Compute all 5 text signal features from a real post body string.
    Used in production (real social mentions).
    """
    if not text or not isinstance(text, str):
        return _zero_features()

    lower = text.lower()
    words = lower.split()
    n_words = max(len(words), 1)
    sentences = re.split(r'[.!?]+', text)
    n_sent = max(len(sentences), 1)

    # 1. sentiment_compound: use VADER if available, else heuristic
    try:
        from nltk.sentiment.vader import SentimentIntensityAnalyzer
        sia = SentimentIntensityAnalyzer()
        compound = float(sia.polarity_scores(text)["compound"])
    except Exception:
        pos_count = sum(1 for w in words if w in {"great", "good", "bull", "buy", "moon", "up"})
        neg_count = sum(1 for w in words if w in {"bad", "crash", "sell", "dump", "bear", "short"})
        compound = float(np.clip((pos_count - neg_count) / n_words * 5, -1, 1))

    # 2. exclamation_density
    excl_count = text.count("!") + text.count("!!") + text.count("🚀") + lower.count("moon")
    exclamation_density = float(np.clip(excl_count / n_sent, 0, 1))

    # 3. manipulation_score
    manip_hits = sum(1 for kw in _MANIPULATION_KEYWORDS if kw in lower)
    manipulation_score = float(np.clip(manip_hits / max(n_words / 10, 1), 0, 1))

    # 4. urgency_score
    urgency_hits = sum(1 for kw in _URGENCY_KEYWORDS if kw in lower)
    urgency_score = float(np.clip(urgency_hits / 3.0, 0, 1))

    # 5. credibility_score
    cred_hits = sum(1 for kw in _CREDIBILITY_KEYWORDS if kw in lower)
    credibility_score = float(np.clip(cred_hits / 3.0, 0, 1))

    return {
        "text_sentiment_compound":  round(compound, 4),
        "text_exclamation_density": round(exclamation_density, 4),
        "text_manipulation_score":  round(manipulation_score, 4),
        "text_urgency_score":       round(urgency_score, 4),
        "text_credibility_score":   round(credibility_score, 4),
    }


def _zero_features() -> dict:
    return {
        "text_sentiment_compound":  0.0,
        "text_exclamation_density": 0.0,
        "text_manipulation_score":  0.0,
        "text_urgency_score":       0.0,
        "text_credibility_score":   0.5,
    }


# ── Training: simulate features from numeric signals ──────────────────────────

def simulate_from_signals(
    avg_sentiment: float,
    bullish_ratio: float,
    mention_growth_ratio: float,
    hype_score_raw: float,
    rng: Optional[np.random.Generator] = None,
) -> dict:
    """
    Simulate text signal features for synthetic training rows.

    Each feature is derived from correlated numeric signals with additive
    Gaussian noise to avoid perfect correlation with labels.

    Correlation rationale
    ─────────────────────
    sentiment_compound   ← avg_sentiment  (direct VADER proxy)
    exclamation_density  ← bullish_ratio * mention_growth_ratio  (excitement × velocity)
    manipulation_score   ← hype_score_raw / 100  (hype = pump language)
    urgency_score        ← mention_growth_ratio / 5  (rapid growth = urgency)
    credibility_score    ← 1 - manipulation_score  (inversely related)
    """
    if rng is None:
        rng = np.random.default_rng()

    noise = lambda scale: float(rng.normal(0, scale))

    sentiment_compound = float(np.clip(avg_sentiment + noise(0.10), -1, 1))

    excl_base = float(np.clip(bullish_ratio * min(mention_growth_ratio / 3.0, 1.0), 0, 1))
    exclamation_density = float(np.clip(excl_base + noise(0.05), 0, 1))

    manip_base = float(np.clip(hype_score_raw / 100.0, 0, 1))
    manipulation_score = float(np.clip(manip_base + noise(0.07), 0, 1))

    urgency_base = float(np.clip(mention_growth_ratio / 5.0, 0, 1))
    urgency_score = float(np.clip(urgency_base + noise(0.06), 0, 1))

    credibility_score = float(np.clip(1.0 - manipulation_score + noise(0.08), 0, 1))

    return {
        "text_sentiment_compound":  round(sentiment_compound, 4),
        "text_exclamation_density": round(exclamation_density, 4),
        "text_manipulation_score":  round(manipulation_score, 4),
        "text_urgency_score":       round(urgency_score, 4),
        "text_credibility_score":   round(credibility_score, 4),
    }


TEXT_FEATURE_NAMES = [
    "text_sentiment_compound",
    "text_exclamation_density",
    "text_manipulation_score",
    "text_urgency_score",
    "text_credibility_score",
]
