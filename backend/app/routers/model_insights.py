"""
Model Insights router
Exposes best-model metadata, feature importances, and model comparison table
so the frontend can render the ML Insights dashboard page.
"""
import json
import os

import numpy as np
from fastapi import APIRouter, HTTPException

from app.ml import inference as _inf

router = APIRouter(prefix="/api/v1/model-insights", tags=["model-insights"])

_MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "ml", "models")


def _load_json(filename: str) -> dict:
    path = os.path.join(_MODELS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"{filename} not found. Run experiment_train.py first.")
    with open(path) as f:
        return json.load(f)


@router.get("/")
def get_model_insights():
    """
    Return best-model metadata + feature importances in one call.
    The frontend uses this for the main Model Insights dashboard.
    """
    meta = _load_json("best_model_metadata.json")

    # ── Feature importances ──────────────────────────────────────────────────
    importances = []
    model = _inf._model
    feat_names = _inf._active_feature_names

    if model is not None:
        try:
            # Unwrap Pipeline → get the actual estimator
            estimator = model.named_steps.get("model") if hasattr(model, "named_steps") else model

            if hasattr(estimator, "feature_importances_"):
                raw = estimator.feature_importances_
            elif hasattr(estimator, "estimators_"):
                # StackingClassifier: average importances of base RF estimator
                for name, est in estimator.estimators_:
                    if hasattr(est, "feature_importances_"):
                        raw = est.feature_importances_
                        break
                else:
                    raw = np.ones(len(feat_names)) / len(feat_names)
            else:
                raw = np.ones(len(feat_names)) / len(feat_names)

            total = float(raw.sum()) or 1.0
            importances = [
                {"feature": feat_names[i], "importance": round(float(raw[i]) / total, 4)}
                for i in range(len(feat_names))
            ]
            importances.sort(key=lambda x: x["importance"], reverse=True)
        except Exception as e:
            print(f"[model_insights] importance extraction failed: {e}")

    return {
        **meta,
        "feature_importances": importances,
        "active_model": "best_model" if os.path.exists(
            os.path.join(_MODELS_DIR, "best_model.pkl")
        ) else "legacy",
    }


@router.get("/comparison")
def get_model_comparison():
    """Return the per-candidate comparison table from the last experiment run."""
    return _load_json("model_comparison.json")


@router.get("/experiments-summary")
def get_experiments_summary():
    """
    Return the cross-run summary (base vs extended vs noleakage vs textfeatures).
    Shows progression across all experiments that have been run.
    """
    path = os.path.join(_MODELS_DIR, "experiments_summary.json")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)
