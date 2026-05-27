"""
train_text_classifier.py
========================
Train a text-only risk classifier on social post content.

Baseline: TF-IDF + LogisticRegression (no GPU needed).
Optional: FinBERT / DistilBERT sentence embeddings (Phase 2).

Usage:
    cd backend
    python -m app.ml.training.train_text_classifier [--use-transformer]

Outputs (saved to backend/app/ml/models/):
    text_classifier.pkl         — best text model pipeline
    text_classifier_meta.json   — metrics + config

Notes:
    - Falls back gracefully if transformers/sentence-transformers not installed.
    - Does NOT run at Railway startup (inference only on Railway).
    - Avoid committing large transformer weight files (.bin, .safetensors).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

DATA_DIR  = Path(__file__).parent / "data"
MODEL_DIR = Path(__file__).resolve().parents[3] / "ml" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ── imports ───────────────────────────────────────────────────────────────────

import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, accuracy_score, f1_score
import joblib


def load_data() -> tuple[list[str], list[int]]:
    csv = DATA_DIR / "training_data.csv"
    if not csv.exists():
        print("[text_clf] training_data.csv not found — run build_training_dataset.py first.")
        sys.exit(1)
    df = pd.read_csv(csv)
    # Re-load raw text from demo (feature CSV stores keyword counts, not text)
    # For now, reconstruct a minimal synthetic text corpus from labels for validation
    from app.ml.training.build_training_dataset import load_demo_data
    df_raw = load_demo_data()
    texts  = df_raw["content"].tolist()
    from app.ml.training.build_training_dataset import LABEL_MAP
    labels = [LABEL_MAP.get(l, 0) for l in df_raw["risk_label"]]
    return texts, labels


def train_tfidf_baseline(texts, labels):
    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.25, random_state=42, stratify=labels
    )

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=5000,
            min_df=1,
            sublinear_tf=True,
        )),
        ("clf", LogisticRegression(
            C=1.0,
            max_iter=1000,
            class_weight="balanced",
            random_state=42,
        )),
    ])

    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)

    acc  = accuracy_score(y_test, y_pred)
    mf1  = f1_score(y_test, y_pred, average="macro",    zero_division=0)
    wf1  = f1_score(y_test, y_pred, average="weighted", zero_division=0)

    print(f"[text_clf] TF-IDF + LR — accuracy={acc:.3f}  macro_f1={mf1:.3f}  weighted_f1={wf1:.3f}")
    print(classification_report(y_test, y_pred, target_names=["Low","Medium","High","Critical"], zero_division=0))

    return pipeline, {"accuracy": acc, "macro_f1": mf1, "weighted_f1": wf1}


def try_transformer_embeddings(texts: list[str]) -> np.ndarray | None:
    """
    Try to get DistilBERT sentence embeddings.
    Returns None if sentence-transformers is not installed.
    """
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
        print("[text_clf] Loading sentence-transformers (DistilBERT)…")
        model = SentenceTransformer("distilbert-base-nli-mean-tokens")
        embeddings = model.encode(texts, show_progress_bar=True)
        print(f"[text_clf] Embedding shape: {embeddings.shape}")
        return embeddings
    except ImportError:
        print("[text_clf] sentence-transformers not installed — skipping transformer embeddings.")
        print("[text_clf] Install with: pip install sentence-transformers")
        return None


def train_transformer_lr(texts, labels, embeddings: np.ndarray):
    X_train, X_test, y_train, y_test = train_test_split(
        embeddings, labels, test_size=0.25, random_state=42
    )
    clf = LogisticRegression(C=0.5, max_iter=500, class_weight="balanced", random_state=42)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)

    acc  = accuracy_score(y_test, y_pred)
    mf1  = f1_score(y_test, y_pred, average="macro",    zero_division=0)
    wf1  = f1_score(y_test, y_pred, average="weighted", zero_division=0)
    print(f"[text_clf] DistilBERT+LR — accuracy={acc:.3f}  macro_f1={mf1:.3f}  weighted_f1={wf1:.3f}")
    return clf, {"accuracy": acc, "macro_f1": mf1, "weighted_f1": wf1}


def main():
    parser = argparse.ArgumentParser(description="Train text classifier")
    parser.add_argument("--use-transformer", action="store_true",
                        help="Attempt DistilBERT embeddings (requires sentence-transformers)")
    args = parser.parse_args()

    texts, labels = load_data()
    print(f"[text_clf] Dataset: {len(texts)} samples")

    # Always train TF-IDF baseline
    tfidf_model, tfidf_meta = train_tfidf_baseline(texts, labels)

    best_model = tfidf_model
    best_meta  = {**tfidf_meta, "model_type": "tfidf_lr", "use_transformer": False}

    # Optionally try transformer
    if args.use_transformer:
        emb = try_transformer_embeddings(texts)
        if emb is not None:
            tr_clf, tr_meta = train_transformer_lr(texts, labels, emb)
            if tr_meta["weighted_f1"] > tfidf_meta["weighted_f1"]:
                print("[text_clf] Transformer LR outperforms TF-IDF LR — using transformer.")
                best_model = tr_clf
                best_meta  = {**tr_meta, "model_type": "distilbert_lr", "use_transformer": True}
            else:
                print("[text_clf] TF-IDF LR is still best — keeping baseline.")

    # Save
    out_model = MODEL_DIR / "text_classifier.pkl"
    out_meta  = MODEL_DIR / "text_classifier_meta.json"
    joblib.dump(best_model, out_model)
    with open(out_meta, "w") as f:
        json.dump(best_meta, f, indent=2)

    print(f"[text_clf] Saved model → {out_model}")
    print(f"[text_clf] Saved meta  → {out_meta}")


if __name__ == "__main__":
    main()
