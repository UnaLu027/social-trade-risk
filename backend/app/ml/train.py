"""
Trains the hype risk StackingClassifier.
Run: python -m app.ml.train
"""
import json
import os
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.ml.feature_engineering import FEATURE_NAMES
from app.ml.generate_dataset import generate, OUTPUT_PATH

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODELS_DIR, "hype_rf_model.pkl")
METADATA_PATH = os.path.join(MODELS_DIR, "model_metadata.json")


def train():
    os.makedirs(MODELS_DIR, exist_ok=True)

    # Generate (or load existing) training data
    if not os.path.exists(OUTPUT_PATH):
        df = generate()
    else:
        df = pd.read_csv(OUTPUT_PATH)
        print(f"Loaded existing dataset: {len(df)} rows")

    X = df[FEATURE_NAMES].values
    y = df["label"].values

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    estimators = [
        ("rf", RandomForestClassifier(n_estimators=200, max_depth=10, random_state=42, n_jobs=-1)),
        ("lr", LogisticRegression(C=0.1, max_iter=1000, random_state=42)),
    ]
    stacking = StackingClassifier(
        estimators=estimators,
        final_estimator=GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, random_state=42),
        cv=5,
        n_jobs=-1,
    )
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", stacking),
    ])

    print("Training StackingClassifier (this may take 1-2 minutes)...")
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    f1 = f1_score(y_test, y_pred, average="weighted")
    accuracy = float((y_pred == y_test).mean())
    report = classification_report(y_test, y_pred, target_names=["low", "medium", "high"])
    print(report)

    joblib.dump(pipeline, MODEL_PATH)

    metadata = {
        "accuracy": round(accuracy, 4),
        "f1_weighted": round(f1, 4),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "feature_names": FEATURE_NAMES,
        "label_map": {"0": "low", "1": "medium", "2": "high"},
        "model_type": "StackingClassifier(RF + LR → GradientBoosting)",
    }
    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nModel saved → {MODEL_PATH}")
    print(f"Accuracy: {accuracy:.4f} | F1-weighted: {f1:.4f}")
    return pipeline, metadata


if __name__ == "__main__":
    train()
