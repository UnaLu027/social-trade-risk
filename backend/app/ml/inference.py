"""
Model inference — loads best_model.pkl (from experiment_train.py) when available,
falls back to the original hype_rf_model.pkl.  Never crashes the API.
"""
import json
import os
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.ml.feature_engineering import FEATURE_NAMES, EXTENDED_FEATURE_NAMES, LABEL_MAP, LABEL_TEXT_MAP

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# Primary: best model produced by experiment_train.py
BEST_MODEL_PATH    = os.path.join(MODELS_DIR, "best_model.pkl")
BEST_META_PATH     = os.path.join(MODELS_DIR, "best_model_metadata.json")

# Fallback: original StackingClassifier from train.py
LEGACY_MODEL_PATH  = os.path.join(MODELS_DIR, "hype_rf_model.pkl")
LEGACY_META_PATH   = os.path.join(MODELS_DIR, "model_metadata.json")

_model = None
_metadata: dict = {}
_active_feature_names: list[str] = FEATURE_NAMES


def load_model() -> bool:
    global _model, _metadata, _active_feature_names

    # Try best_model first
    if os.path.exists(BEST_MODEL_PATH):
        try:
            _model = joblib.load(BEST_MODEL_PATH)
            if os.path.exists(BEST_META_PATH):
                with open(BEST_META_PATH) as f:
                    _metadata = json.load(f)
            # Detect which feature set the model was trained on
            feat_names = _metadata.get("feature_names", FEATURE_NAMES)
            _active_feature_names = feat_names
            print(
                f"[ML] best_model loaded — {_metadata.get('best_model_name', '?')} | "
                f"macro_f1={_metadata.get('test_macro_f1', '?')} | "
                f"features={len(_active_feature_names)}"
            )
            return True
        except Exception as e:
            print(f"[ML] best_model load failed ({e}), falling back to legacy model")
            _model = None

    # Fallback to original model
    if os.path.exists(LEGACY_MODEL_PATH):
        try:
            _model = joblib.load(LEGACY_MODEL_PATH)
            _active_feature_names = FEATURE_NAMES
            if os.path.exists(LEGACY_META_PATH):
                with open(LEGACY_META_PATH) as f:
                    _metadata = json.load(f)
            print(
                f"[ML] legacy model loaded — accuracy={_metadata.get('accuracy')} | "
                f"F1={_metadata.get('f1_weighted')}"
            )
            return True
        except Exception as e:
            print(f"[ML] legacy model load failed ({e})")

    print("[ML] No model available. Run app.ml.train or app.ml.experiment_train first.")
    return False


def predict_risk(features: dict[str, Any]) -> dict:
    """
    Predict risk label + probabilities from a feature dict.
    Supports both 13-feature (legacy) and 16-feature (extended) models automatically.
    Missing features are filled with 0.
    """
    if _model is None:
        return {"label": 1, "label_text": "Medium Risk", "probabilities": [0.15, 0.60, 0.25]}

    # Build feature vector; fill missing keys with 0 rather than crashing
    row = {k: features.get(k, 0) for k in _active_feature_names}
    X = pd.DataFrame([row])[_active_feature_names].values

    try:
        probs = _model.predict_proba(X)[0].tolist()
        label = int(np.argmax(probs))
    except Exception as e:
        print(f"[ML] predict_risk error: {e}")
        return {"label": 1, "label_text": "Medium Risk", "probabilities": [0.15, 0.60, 0.25]}

    return {
        "label": label,
        "label_text": LABEL_TEXT_MAP.get(label, "Unknown"),
        "probabilities": probs,
    }


def get_metadata() -> dict:
    return _metadata


def get_active_feature_names() -> list[str]:
    return _active_feature_names
