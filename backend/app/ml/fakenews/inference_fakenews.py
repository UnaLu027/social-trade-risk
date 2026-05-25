"""
Inference module for the fake news classifier.
"""
import json
import os
import re
from typing import Any

import joblib
import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer

from app.ml.fakenews.generate_fakenews_dataset import FEATURE_NAMES

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODELS_DIR, "fakenews_model.pkl")
METADATA_PATH = os.path.join(MODELS_DIR, "fakenews_metadata.json")

_model = None
_metadata: dict = {}
_vader: SentimentIntensityAnalyzer | None = None

# Known credible source domains (simplified)
_CREDIBLE_DOMAINS = {
    "reuters.com", "bloomberg.com", "wsj.com", "ft.com", "nytimes.com",
    "bbc.com", "apnews.com", "cnbc.com", "marketwatch.com", "barrons.com",
    "economist.com", "financialtimes.com", "fortune.com", "businessinsider.com",
    "seekingalpha.com", "morningstar.com", "investopedia.com",
}

_STOCK_TICKER_RE = re.compile(r'\$([A-Z]{1,5})\b')
_URL_RE = re.compile(r'https?://\S+|www\.\S+')
_QUOTE_RE = re.compile(r'"[^"]{5,}"')


def _get_vader() -> SentimentIntensityAnalyzer:
    global _vader
    if _vader is None:
        try:
            _vader = SentimentIntensityAnalyzer()
        except LookupError:
            nltk.download("vader_lexicon", quiet=True)
            _vader = SentimentIntensityAnalyzer()
    return _vader


def _train_in_background():
    """Train the fake news model in a daemon thread (non-blocking startup)."""
    import threading

    def _do_train():
        global _model, _metadata
        try:
            from app.ml.fakenews.train_fakenews import train
            _model, _metadata = train()
            print("[fakenews] Background training complete.")
        except Exception as e:
            print(f"[fakenews] Background training failed: {e}")

    t = threading.Thread(target=_do_train, daemon=True)
    t.start()


def load_fakenews_model() -> bool:
    """
    Load the fake news model at startup.
    If the .pkl is missing, trains in a BACKGROUND THREAD so uvicorn
    can respond to healthcheck requests immediately.
    """
    global _model, _metadata
    if not os.path.exists(MODEL_PATH):
        print(f"[fakenews] Model not found — training in background (won't block startup).")
        _train_in_background()
        return True   # Startup continues; predict_fakenews() returns 'uncertain' until ready

    _model = joblib.load(MODEL_PATH)
    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH) as f:
            _metadata = json.load(f)
    print(
        f"[fakenews] Model loaded — accuracy={_metadata.get('accuracy')}, "
        f"F1={_metadata.get('f1_weighted')}"
    )
    return True


def extract_features(text: str, url: str = "") -> list[float]:
    """Extract the 12 features from raw text for fake news detection."""
    words = text.split()
    word_count = len(words)
    if word_count == 0:
        return [0.0] * len(FEATURE_NAMES)

    # uppercase_ratio: fraction of words that are ALL CAPS (len >= 2)
    uppercase_words = [w for w in words if w.isupper() and len(w) >= 2]
    uppercase_ratio = len(uppercase_words) / word_count

    # exclamation_count
    exclamation_count = text.count("!")

    # question_count
    question_count = text.count("?")

    # sentiment via VADER
    vader = _get_vader()
    scores = vader.polarity_scores(text)
    sentiment_score = scores["compound"]
    sentiment_extremity = abs(sentiment_score)

    # avg_word_length (strip punctuation)
    clean_words = [re.sub(r'[^\w]', '', w) for w in words if re.sub(r'[^\w]', '', w)]
    avg_word_length = (
        sum(len(w) for w in clean_words) / len(clean_words) if clean_words else 4.0
    )

    # unique_word_ratio
    unique_word_ratio = len(set(w.lower() for w in words)) / word_count

    # stock_mention_count: count $TICKER patterns
    stock_mention_count = len(_STOCK_TICKER_RE.findall(text))

    # url_count
    url_count = len(_URL_RE.findall(text))

    # quote_count: number of quoted phrases
    quote_count = len(_QUOTE_RE.findall(text))

    # source_credibility: based on URL domain if provided.
    # Default 0.2 (unknown/no URL = treat as lower credibility, e.g. social media post)
    # This intentionally biases toward detecting potential fake news when source is unknown.
    source_credibility = 0.2
    if url:
        cleaned = url.lower().replace("https://", "").replace("http://", "").replace("www.", "")
        domain = cleaned.split("/")[0]
        is_credible = any(domain.endswith(d) for d in _CREDIBLE_DOMAINS)
        source_credibility = 0.9 if is_credible else 0.35

    return [
        float(word_count),
        float(uppercase_ratio),
        float(exclamation_count),
        float(question_count),
        float(sentiment_score),
        float(sentiment_extremity),
        float(avg_word_length),
        float(unique_word_ratio),
        float(stock_mention_count),
        float(url_count),
        float(quote_count),
        float(source_credibility),
    ]


def predict_fakenews(text: str, url: str = "") -> dict:
    """
    Predict whether text is fake news.
    Returns: {fake_probability, label, contributing_features, confidence, stock_mentions}
    """
    if _model is None:
        return {
            "fake_probability": 0.5,
            "label": "uncertain",
            "confidence": 0.0,
            "contributing_features": [],
            "stock_mentions": [],
        }

    features = extract_features(text, url)
    feature_dict = dict(zip(FEATURE_NAMES, features))

    import numpy as np
    X = np.array([features])
    probs = _model.predict_proba(X)[0]
    fake_probability = float(probs[1])  # prob of class 1 (fake)

    # Determine label
    if fake_probability >= 0.65:
        label = "fake"
    elif fake_probability <= 0.35:
        label = "real"
    else:
        label = "uncertain"

    # Confidence: distance from 0.5
    confidence = float(abs(fake_probability - 0.5) * 2)

    # Contributing features: use stored importances from metadata
    feature_importances = _metadata.get("feature_importances", {})
    contributing = []
    for fname, fval in feature_dict.items():
        importance = feature_importances.get(fname, 0.0)
        # Compute impact direction: high uppercase/exclamation push toward fake
        fake_indicators = {
            "uppercase_ratio", "exclamation_count", "sentiment_extremity", "stock_mention_count"
        }
        real_indicators = {
            "avg_word_length", "unique_word_ratio", "source_credibility", "word_count", "quote_count"
        }
        if fname in fake_indicators:
            impact = "fake_signal"
        elif fname in real_indicators:
            impact = "real_signal"
        else:
            impact = "neutral"
        contributing.append({
            "name": fname,
            "value": round(fval, 4),
            "importance": round(importance, 4),
            "impact": impact,
        })
    # Sort by importance descending
    contributing.sort(key=lambda x: x["importance"], reverse=True)

    # Extract mentioned stock tickers
    stock_mentions = list(set(_STOCK_TICKER_RE.findall(text)))

    return {
        "fake_probability": round(fake_probability, 4),
        "label": label,
        "confidence": round(confidence, 4),
        "contributing_features": contributing[:8],  # top 8 features
        "stock_mentions": stock_mentions,
    }
