import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer

_analyzer: SentimentIntensityAnalyzer | None = None


def _get_analyzer() -> SentimentIntensityAnalyzer:
    global _analyzer
    if _analyzer is None:
        try:
            _analyzer = SentimentIntensityAnalyzer()
        except LookupError:
            nltk.download("vader_lexicon", quiet=True)
            _analyzer = SentimentIntensityAnalyzer()
    return _analyzer


def score_text(text: str) -> float:
    """Returns VADER compound score: -1.0 (very negative) to +1.0 (very positive)."""
    if not text or not text.strip():
        return 0.0
    analyzer = _get_analyzer()
    scores = analyzer.polarity_scores(text)
    return float(scores["compound"])


def score_batch(texts: list[str]) -> list[float]:
    return [score_text(t) for t in texts]
