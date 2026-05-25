"""
Iterative ML Experiment Pipeline
=================================
Trains multiple candidate models, runs RandomizedSearchCV, evaluates on a
hold-out test set, and saves the best model + a full experiment log.

Usage (from repo root):
    cd backend
    python -m app.ml.experiment_train               # default: extended features
    python -m app.ml.experiment_train --noleakage   # exclude hype_score_raw
    python -m app.ml.experiment_train --base        # use original 13 features only

Outputs:
    backend/app/ml/models/best_model.pkl
    backend/app/ml/models/best_model_metadata.json
    backend/app/ml/experiments/<timestamp>_experiment.json
"""

import argparse
import json
import os
import sys
import warnings
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    GradientBoostingClassifier,
    RandomForestClassifier,
    StackingClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.model_selection import RandomizedSearchCV, train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_class_weight

warnings.filterwarnings("ignore")

from app.ml.feature_engineering import (
    EXTENDED_FEATURE_NAMES,
    FEATURE_NAMES,
    LABEL_MAP,
)
from app.ml.generate_dataset import OUTPUT_PATH, generate

# ── Paths ────────────────────────────────────────────────────────────────────
MODELS_DIR      = os.path.join(os.path.dirname(__file__), "models")
EXPERIMENTS_DIR = os.path.join(os.path.dirname(__file__), "experiments")
BEST_MODEL_PATH      = os.path.join(MODELS_DIR, "best_model.pkl")
BEST_META_PATH       = os.path.join(MODELS_DIR, "best_model_metadata.json")
MODEL_COMPARISON_PATH = os.path.join(MODELS_DIR, "model_comparison.json")

# ── Model catalogue with RandomizedSearch param grids ───────────────────────
# cv=3, n_iter=20 keeps wall-clock time under ~5 min on a laptop CPU.
_CANDIDATES = [
    {
        "name": "LogisticRegression",
        "estimator": LogisticRegression(max_iter=2000, random_state=42),
        "params": {
            "model__C": [0.01, 0.05, 0.1, 0.5, 1.0, 5.0],
            "model__penalty": ["l2"],
            "model__solver": ["lbfgs", "saga"],
        },
        "n_iter": 10,
    },
    {
        "name": "RandomForest",
        "estimator": RandomForestClassifier(random_state=42, n_jobs=-1),
        "params": {
            "model__n_estimators": [100, 200, 300],
            "model__max_depth": [6, 8, 10, 12, None],
            "model__min_samples_split": [2, 5, 10],
            "model__min_samples_leaf": [1, 2, 4],
            "model__class_weight": ["balanced", None],
        },
        "n_iter": 20,
    },
    {
        "name": "GradientBoosting",
        "estimator": GradientBoostingClassifier(random_state=42),
        "params": {
            "model__n_estimators": [100, 150, 200],
            "model__learning_rate": [0.05, 0.1, 0.15, 0.2],
            "model__max_depth": [3, 4, 5, 6],
            "model__subsample": [0.7, 0.8, 1.0],
            "model__min_samples_leaf": [1, 3, 5],
        },
        "n_iter": 20,
    },
    {
        "name": "MLP",
        "estimator": MLPClassifier(max_iter=400, random_state=42, early_stopping=True),
        "params": {
            "model__hidden_layer_sizes": [
                (64,), (128,), (64, 32), (128, 64), (128, 64, 32)
            ],
            "model__alpha": [1e-4, 1e-3, 1e-2],
            "model__learning_rate_init": [1e-3, 5e-4, 1e-4],
            "model__activation": ["relu", "tanh"],
        },
        "n_iter": 20,
    },
    {
        "name": "StackingClassifier",
        "estimator": StackingClassifier(
            estimators=[
                ("rf", RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)),
                ("lr", LogisticRegression(C=0.1, max_iter=1000, random_state=42)),
            ],
            final_estimator=GradientBoostingClassifier(random_state=42),
            cv=3,
            n_jobs=-1,
        ),
        "params": {
            "model__final_estimator__n_estimators": [50, 100, 150],
            "model__final_estimator__learning_rate": [0.05, 0.1, 0.15],
            "model__final_estimator__max_depth": [3, 4, 5],
        },
        "n_iter": 9,
    },
]


# ── Metric helpers ───────────────────────────────────────────────────────────

def _full_metrics(y_true, y_pred, y_pred_proba=None, label_names=None) -> dict:
    label_names = label_names or ["low", "medium", "high"]
    acc   = float(accuracy_score(y_true, y_pred))
    wf1   = float(f1_score(y_true, y_pred, average="weighted"))
    mf1   = float(f1_score(y_true, y_pred, average="macro"))
    cm    = confusion_matrix(y_true, y_pred, labels=[0, 1, 2]).tolist()
    prec, rec, f1s, sup = precision_recall_fscore_support(
        y_true, y_pred, labels=[0, 1, 2], zero_division=0
    )
    per_class = {
        label_names[i]: {
            "precision": round(float(prec[i]), 4),
            "recall":    round(float(rec[i]),  4),
            "f1":        round(float(f1s[i]),  4),
            "support":   int(sup[i]),
        }
        for i in range(len(label_names))
    }
    return {
        "accuracy":      round(acc, 4),
        "weighted_f1":   round(wf1, 4),
        "macro_f1":      round(mf1, 4),
        "confusion_matrix": cm,
        "per_class":     per_class,
        # High-risk recall is the single most important indicator for this task
        "high_risk_recall": round(float(rec[2]), 4),
    }


# ── Main pipeline ─────────────────────────────────────────────────────────────

def run_experiment(
    feature_set: str = "extended",   # "base" | "extended" | "noleakage"
    cv_folds: int = 3,
    test_size: float = 0.20,
    val_size: float = 0.15,
    random_state: int = 42,
) -> dict:
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(EXPERIMENTS_DIR, exist_ok=True)

    # ── 1. Load / generate data ──────────────────────────────────────────────
    if not os.path.exists(OUTPUT_PATH):
        print("Training data not found — generating now...")
        df = generate()
    else:
        df = pd.read_csv(OUTPUT_PATH)
        print(f"Loaded training data: {len(df)} rows")

    # Resolve feature list
    if feature_set == "base":
        feat_names = FEATURE_NAMES
        note = "Original 13 features (backward-compatible)"
    elif feature_set == "noleakage":
        feat_names = [f for f in EXTENDED_FEATURE_NAMES if f != "hype_score_raw"]
        note = "15 extended features, hype_score_raw EXCLUDED to measure leakage"
    else:  # extended (default)
        feat_names = EXTENDED_FEATURE_NAMES
        note = "16 extended features including hype_score_raw and 3 derived features"

    # Ensure derived columns exist (needed when loading an old CSV without them)
    for col in ["mention_accel", "sentiment_volume", "risk_composite"]:
        if col not in df.columns:
            if col == "mention_accel":
                df[col] = (df["mention_count_24h"] / (df["mention_count_1h"] * 24 + 1)).clip(0, 10)
            elif col == "sentiment_volume":
                df[col] = (df["bullish_ratio"].clip(0, 1) * (df["volume_spike_ratio"] / 5).clip(0, 1))
            elif col == "risk_composite":
                df[col] = (df["mention_growth_ratio"] * df["volume_spike_ratio"] * (1 + df["short_interest_ratio"])).clip(0, 50)

    # Only keep feature columns that actually exist in the dataframe
    feat_names = [f for f in feat_names if f in df.columns]

    print(f"\nFeature set: '{feature_set}' ({len(feat_names)} features)")
    print(f"Note: {note}")

    # ── 2. Drop duplicates + handle missing values ───────────────────────────
    n_before = len(df)
    df = df.drop_duplicates(subset=feat_names).dropna(subset=feat_names + ["label"])
    print(f"After dedup/dropna: {n_before} → {len(df)} rows")

    # Outlier clipping (3-sigma per feature)
    for col in feat_names:
        mu, sigma = df[col].mean(), df[col].std()
        df[col] = df[col].clip(mu - 3 * sigma, mu + 3 * sigma)

    # ── 3. Class distribution ─────────────────────────────────────────────────
    y_all = df["label"].values.astype(int)
    X_all = df[feat_names].values
    label_counts = {LABEL_MAP[k]: int(v) for k, v in zip(*np.unique(y_all, return_counts=True))}
    print(f"Class distribution: {label_counts}")

    # ── 4. Train / Val / Test split ───────────────────────────────────────────
    # Use time-based split if synthetic_ts column is available
    if "synthetic_ts" in df.columns:
        df_sorted = df.sort_values("synthetic_ts").reset_index(drop=True)
        n = len(df_sorted)
        train_end = int(n * (1 - test_size - val_size))
        val_end   = int(n * (1 - test_size))
        X_train = df_sorted[feat_names].values[:train_end]
        y_train = df_sorted["label"].values[:train_end].astype(int)
        X_val   = df_sorted[feat_names].values[train_end:val_end]
        y_val   = df_sorted["label"].values[train_end:val_end].astype(int)
        X_test  = df_sorted[feat_names].values[val_end:]
        y_test  = df_sorted["label"].values[val_end:].astype(int)
        split_method = "time-based"
    else:
        X_tmp, X_test, y_tmp, y_test = train_test_split(
            X_all, y_all, test_size=test_size, random_state=random_state, stratify=y_all
        )
        val_ratio = val_size / (1 - test_size)
        X_train, X_val, y_train, y_val = train_test_split(
            X_tmp, y_tmp, test_size=val_ratio, random_state=random_state, stratify=y_tmp
        )
        split_method = "stratified-random"

    print(f"Split ({split_method}): train={len(y_train)}, val={len(y_val)}, test={len(y_test)}")

    # ── 5. Class weights (for imbalance) ──────────────────────────────────────
    classes = np.unique(y_train)
    cw = compute_class_weight("balanced", classes=classes, y=y_train)
    class_weight_dict = {int(c): float(w) for c, w in zip(classes, cw)}
    print(f"Class weights: {class_weight_dict}")

    # ── 6. Train each candidate with RandomizedSearchCV ─────────────────────
    results = []
    best_val_mf1 = -1.0
    best_pipeline = None
    best_candidate_name = ""

    for cand in _CANDIDATES:
        print(f"\n{'─'*60}")
        print(f"  Training: {cand['name']} (n_iter={cand['n_iter']}, cv={cv_folds})")

        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("model", cand["estimator"]),
        ])

        search = RandomizedSearchCV(
            pipeline,
            param_distributions=cand["params"],
            n_iter=cand["n_iter"],
            cv=cv_folds,
            scoring="f1_macro",
            n_jobs=-1,
            random_state=random_state,
            verbose=0,
            refit=True,
        )
        search.fit(X_train, y_train)
        best_pipe = search.best_estimator_

        # Evaluate on val set
        y_val_pred  = best_pipe.predict(X_val)
        val_metrics = _full_metrics(y_val, y_val_pred)

        print(
            f"  Val → accuracy={val_metrics['accuracy']:.4f} | "
            f"macro_f1={val_metrics['macro_f1']:.4f} | "
            f"weighted_f1={val_metrics['weighted_f1']:.4f} | "
            f"high_risk_recall={val_metrics['high_risk_recall']:.4f}"
        )

        # Per-class recall summary
        for cls, m in val_metrics["per_class"].items():
            print(f"    [{cls}] P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1']:.3f} n={m['support']}")

        results.append({
            "model_name":        cand["name"],
            "best_params":       search.best_params_,
            "cv_best_score":     round(float(search.best_score_), 4),
            "val_metrics":       val_metrics,
        })

        if val_metrics["macro_f1"] > best_val_mf1:
            best_val_mf1 = val_metrics["macro_f1"]
            best_pipeline = best_pipe
            best_candidate_name = cand["name"]

    # ── 7. Final evaluation on hold-out test set ─────────────────────────────
    print(f"\n{'═'*60}")
    print(f"  Best model on val set: {best_candidate_name} (macro_f1={best_val_mf1:.4f})")
    print(f"  Final evaluation on TEST set:")

    y_test_pred  = best_pipeline.predict(X_test)
    test_metrics = _full_metrics(y_test, y_test_pred)

    print(f"  accuracy={test_metrics['accuracy']:.4f} | macro_f1={test_metrics['macro_f1']:.4f} | "
          f"weighted_f1={test_metrics['weighted_f1']:.4f}")
    print(f"  high_risk_recall={test_metrics['high_risk_recall']:.4f}")
    print(f"\n  Classification report:")
    print(classification_report(
        y_test, y_test_pred,
        labels=[0, 1, 2],
        target_names=["low", "medium", "high"],
        zero_division=0,
    ))
    print(f"  Confusion matrix:\n{np.array(test_metrics['confusion_matrix'])}")

    # ── 8. Leakage flag ───────────────────────────────────────────────────────
    leakage_warning = None
    if feature_set != "noleakage" and "hype_score_raw" in feat_names:
        leakage_warning = (
            "[WARNING] hype_score_raw is a weighted composite of other training features "
            "AND is used as a labelling threshold (>75 -> high risk). "
            "High F1 may partly reflect rule memorisation. "
            "Re-run with --noleakage to compare."
        )
        print(f"\n  {leakage_warning}")

    # ── 9. Save best model ────────────────────────────────────────────────────
    joblib.dump(best_pipeline, BEST_MODEL_PATH)
    print(f"\n  Saved best_model.pkl → {BEST_MODEL_PATH}")

    metadata = {
        "experiment_id":    datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
        "feature_set":      feature_set,
        "feature_names":    feat_names,
        "n_features":       len(feat_names),
        "split_method":     split_method,
        "n_train":          int(len(y_train)),
        "n_val":            int(len(y_val)),
        "n_test":           int(len(y_test)),
        "class_distribution": label_counts,
        "best_model_name":  best_candidate_name,
        "test_accuracy":    test_metrics["accuracy"],
        "test_macro_f1":    test_metrics["macro_f1"],
        "test_weighted_f1": test_metrics["weighted_f1"],
        "test_high_risk_recall": test_metrics["high_risk_recall"],
        "test_confusion_matrix": test_metrics["confusion_matrix"],
        "test_per_class":   test_metrics["per_class"],
        "label_map":        {"0": "low", "1": "medium", "2": "high"},
        "leakage_warning":  leakage_warning,
        "trained_at":       datetime.now(timezone.utc).isoformat(),
    }
    with open(BEST_META_PATH, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"  Saved best_model_metadata.json → {BEST_META_PATH}")

    # ── 10. Model comparison table (committed artifact for the API) ─────────────
    comparison = {
        "experiment_id":   metadata["experiment_id"],
        "feature_set":     feature_set,
        "split_method":    split_method,
        "best_model_name": best_candidate_name,
        "selection_metric": "val_macro_f1",
        "trained_at":      metadata["trained_at"],
        "candidates": [
            {
                "name":                r["model_name"],
                "val_accuracy":        r["val_metrics"]["accuracy"],
                "val_macro_f1":        r["val_metrics"]["macro_f1"],
                "val_weighted_f1":     r["val_metrics"]["weighted_f1"],
                "val_high_risk_recall":r["val_metrics"]["high_risk_recall"],
                "cv_best_score":       r["cv_best_score"],
                "val_per_class":       r["val_metrics"]["per_class"],
                "best_params":         r["best_params"],
            }
            for r in results
        ],
    }
    with open(MODEL_COMPARISON_PATH, "w") as f:
        json.dump(comparison, f, indent=2)
    print(f"  Model comparison → {MODEL_COMPARISON_PATH}")

    # ── 11. Full experiment log (gitignored, local only) ─────────────────────
    exp_log = {
        **metadata,
        "note": note,
        "all_candidates": results,
    }
    log_filename = f"{metadata['experiment_id']}_{feature_set}_experiment.json"
    log_path = os.path.join(EXPERIMENTS_DIR, log_filename)
    with open(log_path, "w") as f:
        json.dump(exp_log, f, indent=2)
    print(f"  Experiment log → {log_path}")

    print(f"\n{'═'*60}")
    print("  DONE.")
    print(f"  Best model:      {best_candidate_name}")
    print(f"  Test macro F1:   {test_metrics['macro_f1']:.4f}")
    print(f"  High-risk recall:{test_metrics['high_risk_recall']:.4f}")
    if leakage_warning:
        print(f"\n  Run with --noleakage for a leakage-free benchmark.")
    print(f"{'═'*60}\n")

    return exp_log


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Iterative ML experiment pipeline")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--base",      action="store_true", help="Use original 13 features")
    group.add_argument("--noleakage", action="store_true", help="Exclude hype_score_raw")
    parser.add_argument("--cv",       type=int, default=3,    help="Cross-validation folds (default 3)")
    parser.add_argument("--regen",    action="store_true",    help="Regenerate training data")
    args = parser.parse_args()

    if args.regen and os.path.exists(OUTPUT_PATH):
        os.remove(OUTPUT_PATH)
        print("Deleted existing training_data.csv — regenerating...")

    if args.base:
        feat_set = "base"
    elif args.noleakage:
        feat_set = "noleakage"
    else:
        feat_set = "extended"

    run_experiment(feature_set=feat_set, cv_folds=args.cv)
