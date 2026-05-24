"""
Trains the fake news classifier using GradientBoostingClassifier.
Run: python -m app.ml.fakenews.train_fakenews
"""
import json
import os
from datetime import datetime, timezone

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.ml.fakenews.generate_fakenews_dataset import (
    FEATURE_NAMES,
    OUTPUT_PATH,
    generate,
)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODELS_DIR, "fakenews_model.pkl")
METADATA_PATH = os.path.join(MODELS_DIR, "fakenews_metadata.json")


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

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", GradientBoostingClassifier(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=4,
            random_state=42,
        )),
    ])

    print("Training GradientBoostingClassifier for fake news detection...")
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    f1 = float(f1_score(y_test, y_pred, average="weighted"))
    accuracy = float((y_pred == y_test).mean())
    report = classification_report(y_test, y_pred, target_names=["real", "fake"])
    print(report)

    joblib.dump(pipeline, MODEL_PATH)

    # Compute feature importances from the GradientBoosting model
    gbc = pipeline.named_steps["model"]
    importances = gbc.feature_importances_.tolist()
    feature_importance_map = dict(zip(FEATURE_NAMES, importances))

    metadata = {
        "accuracy": round(accuracy, 4),
        "f1_weighted": round(f1, 4),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "feature_names": FEATURE_NAMES,
        "label_map": {"0": "real", "1": "fake"},
        "model_type": "GradientBoostingClassifier",
        "feature_importances": feature_importance_map,
    }
    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nModel saved -> {MODEL_PATH}")
    print(f"Accuracy: {accuracy:.4f} | F1-weighted: {f1:.4f}")
    return pipeline, metadata


if __name__ == "__main__":
    train()
