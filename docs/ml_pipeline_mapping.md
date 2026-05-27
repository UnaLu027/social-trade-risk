# ML Pipeline Mapping

Maps the social trading risk ML pipeline to standard data science course topics.

---

## Pipeline Script → Course Topic Mapping

| Script | Course Topic |
|---|---|
| `build_training_dataset.py` | Data Preprocessing, Feature Engineering |
| `train_text_classifier.py` | Classification (text), Dimensionality Reduction (TF-IDF), Transformer features |
| `train_fusion_model.py` | Classification, Ensemble Learning, Model Evaluation, Feature Selection, Neural Network |
| `evaluate_models.py` | Model Evaluation, ROC/AUC, Confusion Matrix |

---

## Detailed Mapping

### Data Preprocessing → `build_training_dataset.py`

- Read raw social posts and risk snapshots from SQL Server / CSV
- Clean and standardise text content
- Extract keyword features (bag-of-words baseline)
- Merge social posts with market/snapshot features
- Label assignment (Low/Medium/High/Critical)
- Output: `training_data.csv`, `feature_names.json`, `label_mapping.json`
- Mark all synthetic data as `data_source: demo_weak_label`

---

### Classification → `train_text_classifier.py`

- **TF-IDF + Logistic Regression baseline** (no GPU required)
  - `TfidfVectorizer(ngram_range=(1,2), max_features=5000)`
  - `LogisticRegression(class_weight="balanced")`
- **Optional Transformer features** (Phase 2)
  - DistilBERT sentence embeddings via `sentence-transformers`
  - FinBERT sentiment embeddings via `ProsusAI/finbert`
- Graceful fallback if transformers not installed

---

### Ensemble Learning → `train_fusion_model.py`

- **Random Forest**: bagging over decision trees, feature importance
- **Gradient Boosting**: sequential correction, high High/Critical recall
- Both use `class_weight="balanced"` or sample weighting

---

### Model Evaluation → `evaluate_models.py`

- Accuracy, Macro F1, Weighted F1
- **High/Critical Recall** — primary metric (false negatives in high-risk detection are costly)
- Confusion matrix
- ROC-AUC (One-vs-Rest, macro)
- Per-class classification report
- Feature importance (RandomForest, GradientBoosting, LR coefficients)

---

### ROC / AUC

- Computed in `evaluate_models.py`
- Uses `roc_auc_score(y_bin, y_proba, multi_class="ovr", average="macro")`
- Binarizes labels with `label_binarize` for 4-class problem

---

### Feature Selection

- Keyword-based feature importance from tree models
- TF-IDF vocabulary acts as implicit feature selection
- Optional: add Sequential Feature Selection (SFS) in Phase 2

---

### Dimensionality Reduction

- TF-IDF naturally reduces vocabulary space
- Optional: PCA on TF-IDF features for visualisation
- Optional: UMAP on FinBERT embeddings for cluster visualisation

---

### Neural Network → `train_fusion_model.py`

- **MLPClassifier**: `(128, 64)` hidden layers, early stopping
- Future: PyTorch MLP with attention over feature groups (text / social / market / network)

---

### Transformer Text Features

- Phase 2: `sentence-transformers/distilbert-base-nli-mean-tokens`
- Phase 2: `ProsusAI/finbert` for financial sentiment
- Phase 3: Fine-tune FinBERT on WallStreetBets risk labels (requires ≥ 5,000 examples)
- Always use HuggingFace model hub caching; never commit weight files to Git

---

## Feature Groups

| Group | Features |
|---|---|
| Text features | `hype_term_count`, `fomo_term_count`, `squeeze_term_count`, `manip_term_count`, `urgency_term_count`, `text_length`, `caps_ratio`, `exclamation_count` |
| Social features | `avg_bullish_ratio`, `avg_hype_score`, `avg_fomo_score` |
| Market features | `avg_manip_score`, `avg_squeeze_pressure` |
| Network features | Mention growth, influencer signal (Phase 2) |

---

## Model Selection Criterion

Primary: **Weighted F1** (handles class imbalance)
Secondary: **High/Critical Recall** (minimise missed high-risk events)

A model with lower accuracy but higher High/Critical recall is preferred over a higher-accuracy model that misses dangerous signals.
