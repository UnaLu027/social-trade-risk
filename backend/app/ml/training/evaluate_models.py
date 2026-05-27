"""
evaluate_models.py
==================
Load saved model(s) and produce a comprehensive evaluation report.

Usage:
    cd backend
    python -m app.ml.training.evaluate_models

Outputs (printed + saved to backend/app/ml/models/evaluation_report.json):
    - Accuracy, Macro F1, Weighted F1
    - High/Critical recall (most important metric)
    - Confusion matrix
    - Classification report
    - ROC-AUC (One-vs-Rest, macro)
    - Feature importance (if available)
    - Data quality note (demo / weak-label)

Evaluation principles:
    - Do NOT optimise only accuracy — High/Critical recall is the key metric.
    - Report macro F1 to detect class imbalance problems.
    - All results are clearly labelled as 'demo_weak_label' data.
    - Never use test data during training (enforced by train_fusion_model.py).
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

DATA_DIR  = Path(__file__).parent / "data"
MODEL_DIR = Path(__file__).resolve().parents[3] / "ml" / "models"

from sklearn.metrics import (
    accuracy_score, f1_score, classification_report,
    confusion_matrix, roc_auc_score
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import label_binarize
import joblib
import pandas as pd


LABEL_NAMES = ["Low", "Medium", "High", "Critical"]
CLASSES     = [0, 1, 2, 3]


def load_test_data():
    csv = DATA_DIR / "training_data.csv"
    if not csv.exists():
        print("[eval] training_data.csv not found — run build_training_dataset.py first.")
        sys.exit(1)
    df = pd.read_csv(csv)

    with open(DATA_DIR / "feature_names.json") as f:
        feature_names = json.load(f)

    available = [c for c in feature_names if c in df.columns]
    X = df[available].fillna(0.0).values
    y = df["label"].values

    _, X_test, _, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
    print(f"[eval] Test set: {len(y_test)} samples")
    return X_test, y_test, available


def evaluate_model(name: str, model_dict: dict, X_test, y_test, feature_names: list[str]) -> dict:
    model  = model_dict.get("model") or model_dict  # handle plain estimator or dict
    scaler = model_dict.get("scaler")

    X_ev = scaler.transform(X_test) if scaler else X_test
    y_pred = model.predict(X_ev)

    # Probabilities for ROC-AUC
    try:
        y_proba = model.predict_proba(X_ev)
        y_bin   = label_binarize(y_test, classes=CLASSES)
        roc_auc = roc_auc_score(y_bin, y_proba, multi_class="ovr", average="macro",
                                 labels=CLASSES)
    except Exception:
        roc_auc = None

    acc   = accuracy_score(y_test, y_pred)
    mf1   = f1_score(y_test, y_pred, average="macro",    zero_division=0)
    wf1   = f1_score(y_test, y_pred, average="weighted", zero_division=0)
    cm    = confusion_matrix(y_test, y_pred).tolist()

    high_mask   = (y_test >= 2)
    high_recall = (
        float(np.sum((y_pred >= 2) & high_mask) / np.sum(high_mask))
        if high_mask.any() else 0.0
    )

    # Feature importance
    fi = {}
    estimator = model
    if hasattr(estimator, "feature_importances_"):
        raw = estimator.feature_importances_
        fi  = {feature_names[i]: round(float(raw[i]), 4) for i in np.argsort(raw)[::-1][:10]}
    elif hasattr(estimator, "coef_"):
        mean_coef = np.abs(estimator.coef_).mean(axis=0)
        fi = {feature_names[i]: round(float(mean_coef[i]), 4) for i in np.argsort(mean_coef)[::-1][:10]}

    # Per-class report
    clf_report = classification_report(
        y_test, y_pred,
        target_names=LABEL_NAMES,
        zero_division=0,
        output_dict=True,
    )

    print(f"\n{'='*60}")
    print(f"Model: {name}")
    print(f"  Accuracy:          {acc:.4f}")
    print(f"  Macro F1:          {mf1:.4f}")
    print(f"  Weighted F1:       {wf1:.4f}")
    print(f"  High/Crit Recall:  {high_recall:.4f}")
    if roc_auc is not None:
        print(f"  ROC-AUC (macro):   {roc_auc:.4f}")
    print(f"\n  Classification Report:")
    print(classification_report(y_test, y_pred, target_names=LABEL_NAMES, zero_division=0))
    print(f"  Confusion Matrix:\n{np.array(cm)}")
    if fi:
        print(f"\n  Top Features: {list(fi.keys())[:5]}")

    return {
        "model_name":          name,
        "accuracy":            round(acc, 4),
        "macro_f1":            round(mf1, 4),
        "weighted_f1":         round(wf1, 4),
        "high_risk_recall":    round(high_recall, 4),
        "roc_auc_macro":       round(roc_auc, 4) if roc_auc else None,
        "confusion_matrix":    cm,
        "classification_report": clf_report,
        "feature_importance":  fi,
        "evaluated_at":        datetime.utcnow().isoformat(),
        "data_source":         "demo_weak_label",
        "note":                "Results are based on synthetic demo data. Update with real WallStreetBets/Financial PhraseBank data for production use.",
    }


def main():
    X_test, y_test, feature_names = load_test_data()

    reports = []

    # 1. Load best_model.pkl (from train_fusion_model.py)
    best_pkl = MODEL_DIR / "best_model.pkl"
    if best_pkl.exists():
        payload    = joblib.load(best_pkl)
        meta_file  = MODEL_DIR / "model_metadata.json"
        model_name = "best_model"
        if meta_file.exists():
            with open(meta_file) as f:
                meta = json.load(f)
            model_name = meta.get("best_model_name", "best_model")
        rep = evaluate_model(model_name, payload, X_test, y_test, feature_names)
        reports.append(rep)
    else:
        print(f"[eval] {best_pkl} not found — run train_fusion_model.py first.")

    # 2. Load text_classifier.pkl (from train_text_classifier.py) if available
    text_pkl = MODEL_DIR / "text_classifier.pkl"
    if text_pkl.exists():
        text_model = joblib.load(text_pkl)
        # Text classifier uses raw text — can't be evaluated here on numerical features
        print("\n[eval] text_classifier.pkl found (TF-IDF / transformer pipeline).")
        print("[eval] Skipping numerical evaluation — run with text data separately.")

    if not reports:
        print("[eval] No models found. Run train_fusion_model.py first.")
        sys.exit(0)

    # Save report
    report_path = MODEL_DIR / "evaluation_report.json"
    with open(report_path, "w") as f:
        json.dump(reports, f, indent=2)
    print(f"\n[eval] Evaluation report saved → {report_path}")

    # Summary
    best = max(reports, key=lambda r: (r["weighted_f1"], r["high_risk_recall"]))
    print(f"\n[eval] Best: {best['model_name']}")
    print(f"       Weighted F1={best['weighted_f1']:.4f}  High-Risk Recall={best['high_risk_recall']:.4f}")
    print(f"\n[eval] ⚠️  Data note: {best['note']}")


if __name__ == "__main__":
    main()
