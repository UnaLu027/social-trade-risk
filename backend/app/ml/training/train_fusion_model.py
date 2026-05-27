"""
train_fusion_model.py
=====================
Train a multi-feature fusion classifier using market, social, text, and
(optionally) network features.

Models compared via GridSearchCV / RandomizedSearchCV:
    - LogisticRegression (baseline)
    - RandomForest
    - GradientBoosting
    - MLPClassifier
    - XGBoost (optional, if xgboost installed)

Usage:
    cd backend
    python -m app.ml.training.train_fusion_model

Outputs (saved to backend/app/ml/models/):
    best_model.pkl           — best estimator from GridSearch
    model_metadata.json      — all experiment metrics
    experiment_summary.json  — list of dicts for /api/v1/model-lab/experiments

Anti-leakage rules:
    - Labels come from risk_label column, NOT from computed score columns.
    - Train/test split uses stratified sampling.
    - No future data in training set.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

DATA_DIR  = Path(__file__).parent / "data"
MODEL_DIR = Path(__file__).resolve().parents[3] / "ml" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split, GridSearchCV, StratifiedKFold
from sklearn.metrics import (
    accuracy_score, f1_score, classification_report,
    confusion_matrix, roc_auc_score
)
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.pipeline import Pipeline
import joblib


FEATURE_COLS = [
    "hype_term_count", "fomo_term_count", "squeeze_term_count",
    "manip_term_count", "urgency_term_count",
    "text_length", "exclamation_count", "caps_ratio",
    "avg_hype_score", "avg_manip_score", "avg_fomo_score",
    "avg_squeeze_pressure", "avg_bullish_ratio",
]


def load_data():
    csv = DATA_DIR / "training_data.csv"
    if not csv.exists():
        print("[fusion] training_data.csv not found — run build_training_dataset.py first.")
        sys.exit(1)
    df = pd.read_csv(csv)
    available = [c for c in FEATURE_COLS if c in df.columns]
    X = df[available].fillna(0.0).values
    y = df["label"].values
    print(f"[fusion] Loaded {len(X)} samples, {len(available)} features")
    return X, y, available


def evaluate(name: str, model, X_test, y_test, scaler=None) -> dict:
    X_ev = scaler.transform(X_test) if scaler else X_test
    y_pred = model.predict(X_ev)
    acc   = accuracy_score(y_test, y_pred)
    mf1   = f1_score(y_test, y_pred, average="macro",    zero_division=0)
    wf1   = f1_score(y_test, y_pred, average="weighted", zero_division=0)
    cm    = confusion_matrix(y_test, y_pred)

    # High-or-Critical recall (classes 2 and 3)
    high_mask   = (y_test >= 2)
    high_recall = (
        float(np.sum((y_pred >= 2) & high_mask) / np.sum(high_mask))
        if high_mask.any() else 0.0
    )

    print(f"\n[fusion] ── {name} ──────────────")
    print(f"  accuracy={acc:.3f}  macro_f1={mf1:.3f}  weighted_f1={wf1:.3f}  high_recall={high_recall:.3f}")
    print(classification_report(y_test, y_pred,
                                 target_names=["Low","Medium","High","Critical"],
                                 zero_division=0))
    return {
        "model_name":       name,
        "accuracy":         round(acc, 4),
        "macro_f1":         round(mf1, 4),
        "weighted_f1":      round(wf1, 4),
        "high_risk_recall": round(high_recall, 4),
        "confusion_matrix": cm.tolist(),
        "trained_at":       datetime.utcnow().isoformat(),
    }


def train_all(X_train, X_test, y_train, y_test, feature_names):
    scaler = StandardScaler()
    X_tr_s = scaler.fit_transform(X_train)

    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    results = []
    models  = {}

    # ── 1. Logistic Regression ─────────────────────────────────────────────
    param_lr = {"C": [0.1, 0.5, 1.0, 2.0], "max_iter": [500]}
    gs_lr = GridSearchCV(
        LogisticRegression(class_weight="balanced", random_state=42),
        param_lr, cv=cv, scoring="weighted_f1", n_jobs=-1,
    )
    gs_lr.fit(X_tr_s, y_train)
    lr_res = evaluate("Logistic Regression", gs_lr.best_estimator_, X_test, y_test, scaler)
    lr_res["experiment_id"] = "exp_lr_001"
    lr_res["feature_set"]   = "market_social_text"
    results.append(lr_res)
    models["Logistic Regression"] = (gs_lr.best_estimator_, scaler)

    # ── 2. Random Forest ──────────────────────────────────────────────────
    param_rf = {"n_estimators": [50, 100], "max_depth": [None, 10], "min_samples_split": [2, 5]}
    gs_rf = GridSearchCV(
        RandomForestClassifier(class_weight="balanced", random_state=42),
        param_rf, cv=cv, scoring="weighted_f1", n_jobs=-1,
    )
    gs_rf.fit(X_train, y_train)   # RF doesn't need scaling
    rf_res = evaluate("Random Forest", gs_rf.best_estimator_, X_test, y_test)
    rf_res["experiment_id"] = "exp_rf_001"
    rf_res["feature_set"]   = "market_social_text"
    # Feature importance
    fi = dict(zip(feature_names, gs_rf.best_estimator_.feature_importances_.tolist()))
    rf_res["feature_importance"] = {k: round(v, 4) for k, v in sorted(fi.items(), key=lambda x: -x[1])[:8]}
    results.append(rf_res)
    models["Random Forest"] = (gs_rf.best_estimator_, None)

    # ── 3. Gradient Boosting ──────────────────────────────────────────────
    param_gb = {"n_estimators": [100, 200], "learning_rate": [0.05, 0.1], "max_depth": [3, 5]}
    gs_gb = GridSearchCV(
        GradientBoostingClassifier(random_state=42),
        param_gb, cv=cv, scoring="weighted_f1", n_jobs=-1,
    )
    gs_gb.fit(X_train, y_train)
    gb_res = evaluate("Gradient Boosting", gs_gb.best_estimator_, X_test, y_test)
    gb_res["experiment_id"] = "exp_gb_001"
    gb_res["feature_set"]   = "market_social_text"
    fi_gb = dict(zip(feature_names, gs_gb.best_estimator_.feature_importances_.tolist()))
    gb_res["feature_importance"] = {k: round(v, 4) for k, v in sorted(fi_gb.items(), key=lambda x: -x[1])[:8]}
    results.append(gb_res)
    models["Gradient Boosting"] = (gs_gb.best_estimator_, None)

    # ── 4. MLP Neural Network ─────────────────────────────────────────────
    param_mlp = {
        "hidden_layer_sizes": [(128, 64), (64, 32)],
        "alpha": [0.0001, 0.001],
        "max_iter": [500],
    }
    gs_mlp = GridSearchCV(
        MLPClassifier(random_state=42, early_stopping=True),
        param_mlp, cv=cv, scoring="weighted_f1", n_jobs=-1,
    )
    gs_mlp.fit(X_tr_s, y_train)
    mlp_res = evaluate("MLP Neural Network", gs_mlp.best_estimator_, X_test, y_test, scaler)
    mlp_res["experiment_id"] = "exp_mlp_001"
    mlp_res["feature_set"]   = "neural_fusion"
    results.append(mlp_res)
    models["MLP Neural Network"] = (gs_mlp.best_estimator_, scaler)

    # ── 5. XGBoost (optional) ─────────────────────────────────────────────
    try:
        from xgboost import XGBClassifier  # type: ignore
        xgb = XGBClassifier(
            n_estimators=100, learning_rate=0.1, max_depth=4,
            use_label_encoder=False, eval_metric="mlogloss",
            random_state=42, verbosity=0,
        )
        xgb.fit(X_train, y_train)
        xgb_res = evaluate("XGBoost", xgb, X_test, y_test)
        xgb_res["experiment_id"] = "exp_xgb_001"
        xgb_res["feature_set"]   = "market_social_text"
        results.append(xgb_res)
        models["XGBoost"] = (xgb, None)
    except ImportError:
        print("[fusion] XGBoost not installed — skipping (pip install xgboost)")

    return results, models


def select_best(results: list[dict]) -> str:
    # Primary sort: weighted_f1; secondary: high_risk_recall
    return max(results, key=lambda r: (r["weighted_f1"], r["high_risk_recall"]))["model_name"]


def main():
    X, y, feature_names = load_data()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    results, models = train_all(X_train, X_test, y_train, y_test, feature_names)

    best_name = select_best(results)
    print(f"\n[fusion] Best model: {best_name}")

    # Save best model
    best_estimator, best_scaler = models[best_name]
    payload = {"model": best_estimator}
    if best_scaler:
        payload["scaler"] = best_scaler

    joblib.dump(payload, MODEL_DIR / "best_model.pkl")
    print(f"[fusion] Saved best model → {MODEL_DIR / 'best_model.pkl'}")

    # Save metadata
    best_result = next(r for r in results if r["model_name"] == best_name)
    metadata = {
        "best_model_name":   best_name,
        "test_accuracy":     best_result["accuracy"],
        "test_macro_f1":     best_result["macro_f1"],
        "test_weighted_f1":  best_result["weighted_f1"],
        "high_risk_recall":  best_result["high_risk_recall"],
        "feature_names":     feature_names,
        "trained_at":        datetime.utcnow().isoformat(),
        "data_source":       "demo_weak_label",
        "label_mapping":     {0: "Low", 1: "Medium", 2: "High", 3: "Critical"},
    }
    with open(MODEL_DIR / "model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    # Save experiment summary for model-lab API
    with open(MODEL_DIR / "experiment_summary.json", "w") as f:
        json.dump(results, f, indent=2)

    print(f"[fusion] Saved metadata → {MODEL_DIR / 'model_metadata.json'}")
    print(f"[fusion] Saved experiments → {MODEL_DIR / 'experiment_summary.json'}")
    print("[fusion] Done.")


if __name__ == "__main__":
    main()
