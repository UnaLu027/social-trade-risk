import json
import os
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.ml.feature_engineering import FEATURE_NAMES, LABEL_MAP, LABEL_TEXT_MAP

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODELS_DIR, "hype_rf_model.pkl")
METADATA_PATH = os.path.join(MODELS_DIR, "model_metadata.json")

_model = None
_metadata: dict = {}


def load_model() -> bool:
    global _model, _metadata
    if not os.path.exists(MODEL_PATH):
        print(f"[ML] Model not found at {MODEL_PATH}. Run app.ml.train first.")
        return False
    _model = joblib.load(MODEL_PATH)
    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH) as f:
            _metadata = json.load(f)
    print(f"[ML] Model loaded — accuracy={_metadata.get('accuracy')}, F1={_metadata.get('f1_weighted')}")
    return True


def predict_risk(features: dict[str, Any]) -> dict:
    if _model is None:
        return {"label": 1, "label_text": "Medium Risk", "probabilities": [0.15, 0.60, 0.25]}

    X = pd.DataFrame([features])[FEATURE_NAMES].values
    probs = _model.predict_proba(X)[0].tolist()
    label = int(_model.predict(X.reshape(1, -1))[0])
    return {
        "label": label,
        "label_text": LABEL_TEXT_MAP[label],
        "probabilities": probs,
    }


def get_metadata() -> dict:
    return _metadata
