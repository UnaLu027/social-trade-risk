"""
Colab text model inference for post-analyze.

Models at: backend/app/ml/text_model/
  word_vectorizer.joblib  — TfidfVectorizer, 12 000 vocab, ngram (1,2)
  char_vectorizer.joblib  — TfidfVectorizer, 8 000 vocab,  ngram (3,5)
  risk_model.joblib       — dict{'model': GradientBoostingClassifier, ...}
  direction_model.joblib  — dict{'model': LogisticRegression, ...}
  numeric_scaler.joblib   — StandardScaler, 12 features

Pipeline:
  risk:      word_tfidf + char_tfidf  (20 000 features)         → GBC
  direction: word_tfidf + char_tfidf + 12 numeric (20 012 feat) → LogReg

Label order: always read from model.classes_ (alphabetical in sklearn).
  risk:      ['High', 'Low', 'Medium']
  direction: ['bearish', 'bullish', 'neutral']

Numeric features: the exact 12 training features are unknown in deployment.
  Strategy: pass scaler.mean_ to scaler.transform() → scaled values are all 0
  → numeric features contribute zero bias to the LogReg direction model
  → direction is determined purely from TF-IDF text features
"""
from __future__ import annotations

import json
import os
import threading
import warnings
from pathlib import Path
from typing import Optional

import numpy as np

_DIR = Path(os.path.dirname(__file__)) / "text_model"

_word_vec  = None
_char_vec  = None
_risk_clf  = None
_dir_clf   = None
_scaler    = None
_risk_labels: list[str]    = ["High", "Low", "Medium"]   # model.classes_ order
_dir_labels:  list[str]    = ["bearish", "bullish", "neutral"]
_numeric_default: Optional[np.ndarray] = None            # scaler.mean_ reshaped
_trained_at: Optional[str] = None
_model_id:   Optional[str] = None
_loaded      = False
_lock        = threading.Lock()

_REQUIRED = [
    "word_vectorizer.joblib",
    "char_vectorizer.joblib",
    "risk_model.joblib",
    "direction_model.joblib",
    "numeric_scaler.joblib",
]


def load_text_model() -> bool:
    """Load all Colab model files.  Idempotent — safe to call multiple times."""
    global _word_vec, _char_vec, _risk_clf, _dir_clf, _scaler
    global _risk_labels, _dir_labels, _numeric_default
    global _trained_at, _model_id, _loaded

    with _lock:
        if _loaded:
            return True

        for fname in _REQUIRED:
            if not (_DIR / fname).exists():
                print(f"[text_inference] Missing: {fname} — skipping Colab model load")
                return False

        try:
            import joblib

            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                _word_vec = joblib.load(_DIR / "word_vectorizer.joblib")
                _char_vec = joblib.load(_DIR / "char_vectorizer.joblib")
                _scaler   = joblib.load(_DIR / "numeric_scaler.joblib")
                risk_obj  = joblib.load(_DIR / "risk_model.joblib")
                dir_obj   = joblib.load(_DIR / "direction_model.joblib")

            # Models stored as dicts {'model': classifier, ...}
            _risk_clf = risk_obj["model"] if isinstance(risk_obj, dict) else risk_obj
            _dir_clf  = dir_obj["model"]  if isinstance(dir_obj,  dict) else dir_obj

            # Always use model.classes_ — sklearn sorts alphabetically.
            # risk: ['High', 'Low', 'Medium'] | direction: ['bearish', 'bullish', 'neutral']
            _risk_labels = list(_risk_clf.classes_)
            _dir_labels  = list(_dir_clf.classes_)

            # Default numeric input = scaler mean → scaled output = all zeros (no bias).
            # The exact 12 training features are unknown at deployment time; passing the
            # mean of each feature is the safest unbiased default.
            n = int(getattr(_scaler, "n_features_in_", 12))
            _numeric_default = np.array(_scaler.mean_).reshape(1, n)

            meta_path = _DIR / "model_metadata.json"
            if meta_path.exists():
                with open(meta_path) as f:
                    meta = json.load(f)
                _trained_at = meta.get("trained_at")
                _model_id   = meta.get("model_id")

            _loaded = True
            print(
                f"[text_inference] Colab model loaded — "
                f"risk={type(_risk_clf).__name__}({_risk_labels}), "
                f"dir={type(_dir_clf).__name__}({_dir_labels}), "
                f"model_id={_model_id}"
            )
            return True

        except Exception as exc:
            print(f"[text_inference] Load error: {exc}")
            _loaded = False
            return False


def is_loaded() -> bool:
    return _loaded


def predict_text(text: str) -> Optional[dict]:
    """
    Run Colab text model on a single post string.
    Returns dict with risk + direction info, or None on any error.
    Never raises — all exceptions are caught and logged.
    """
    if not _loaded:
        load_text_model()
        if not _loaded:
            return None

    try:
        import scipy.sparse as sp

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            X_word = _word_vec.transform([text])   # sparse (1, 12 000)
            X_char = _char_vec.transform([text])   # sparse (1,  8 000)

        X_text  = sp.hstack([X_word, X_char])      # sparse (1, 20 000)
        X_dense = X_text.toarray()                 # dense  (1, 20 000)

        # ── Risk classification (text-only features) ─────────────────────────
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            risk_proba = _risk_clf.predict_proba(X_dense)[0].tolist()

        ri = int(np.argmax(risk_proba))
        risk_label = _risk_labels[ri]
        risk_conf  = round(float(risk_proba[ri]), 4)
        risk_probs = {_risk_labels[i]: round(float(p), 4) for i, p in enumerate(risk_proba)}

        # ── Direction classification (text + numeric features) ────────────────
        # Numeric features: use scaler.mean_ → scaled values are all 0 (unbiased).
        # This means direction is determined entirely from the TF-IDF text features.
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                num_scaled = _scaler.transform(_numeric_default)  # (1, 12) all zeros
            X_dir = np.hstack([X_dense, num_scaled])              # (1, 20 012)
        except Exception as e:
            print(f"[text_inference] numeric scaling error ({e}), text-only direction")
            # Fallback: pad text features to match expected dim
            n_num = _dir_clf.n_features_in_ - X_dense.shape[1]
            X_dir = np.hstack([X_dense, np.zeros((1, max(n_num, 0)))])

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            dir_proba = _dir_clf.predict_proba(X_dir)[0].tolist()

        di = int(np.argmax(dir_proba))
        dir_label = _dir_labels[di]
        dir_conf  = round(float(dir_proba[di]), 4)
        dir_probs = {_dir_labels[i]: round(float(p), 4) for i, p in enumerate(dir_proba)}

        return {
            "risk_label":              risk_label,
            "risk_confidence":         risk_conf,
            "risk_probabilities":      risk_probs,
            "direction_label":         dir_label,
            "direction_confidence":    dir_conf,
            "direction_probabilities": dir_probs,
            "model_id":                _model_id,
            "trained_at":              _trained_at,
        }

    except Exception as exc:
        print(f"[text_inference] predict_text error: {exc}")
        return None
