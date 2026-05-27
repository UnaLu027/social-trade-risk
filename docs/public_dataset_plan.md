# Public Dataset Acquisition Plan

## Current Status

No public dataset has been downloaded or integrated yet.

Current training data is **demo/weak-label synthetic data** from `database/seed_product_demo_sqlserver.sql`.
The baseline ML pipeline works with this data; it is clearly marked as `data_source: demo_weak_label`.

---

## Recommended Acquisition Sequence

### Phase 1 — Demo / Weak-Label Pipeline (Current)

Use SQL Server demo data to validate the full product pipeline.

Goals:
- Frontend pages render with data
- PHP API reads SQL Server correctly
- FastAPI inference endpoints return sensible results
- Baseline models train without errors

Status: ✅ Complete

---

### Phase 2 — Financial Sentiment Datasets

Improve the text model with finance-domain sentiment data.

**Recommended sources:**

1. **Financial PhraseBank** (Malo et al., 2014)
   - 4,840 sentences from financial news
   - Labels: positive / negative / neutral
   - Available on HuggingFace: `datasets` library
   - `from datasets import load_dataset; ds = load_dataset("financial_phrasebank", "sentences_allagree")`

2. **FiQA Sentiment** (WWW'18 challenge)
   - Opinion target extraction from financial microblogs + news
   - Score range: -1 to +1

3. **FinSentS / SemEval financial sentiment**
   - Aspect-level sentiment on financial texts

**Purpose:**
- Better sentiment_score calibration
- Finance-domain validation for fomo_score and manipulation_signal_score

**Script location:** `backend/app/ml/data_acquisition/download_phrasebank.py`

---

### Phase 3 — Reddit / WallStreetBets Datasets

Add meme-stock social data to capture short squeeze narratives.

**Recommended sources:**

1. **WallStreetBets Historical Posts** (Kaggle)
   - Dataset: `gpreda/reddit-wallstreetsbets-posts`
   - Contains: title, body, score, num_comments, upvote_ratio, created_utc
   - Requires: Kaggle account + `kaggle.json` (never commit credentials)

2. **Reddit GME/AMC Thread Dumps** (various)
   - Search Kaggle for: `gamestop reddit`, `wsb comments 2021`
   - May require additional annotation for risk labels

3. **StockTwits Sentiment API** (live, requires API key)
   - `https://api.stocktwits.com/api/2/streams/symbol/{symbol}.json`
   - Labels: bullish / bearish

**Purpose:**
- Meme language training examples
- FOMO and short squeeze narrative ground truth
- Mention growth signal training data

**Script location:** `backend/app/ml/data_acquisition/download_wsb.py`

---

### Phase 4 — Transformer / FinBERT Integration

After baseline pipeline is stable with real data:

1. Use `ProsusAI/finbert` (HuggingFace) for sentiment scores
2. Use `sentence-transformers/all-MiniLM-L6-v2` for post embeddings
3. Add transformer features to fusion model (Phase 2 of train_fusion_model.py)
4. **Fine-tune only if** dataset is ≥ 5,000 labelled examples with High/Critical coverage

**Constraints:**
- No GPU required for inference (CPU is acceptable for FinBERT encoding)
- Do NOT train large Transformers at Railway startup
- Do NOT commit `.bin` or `.safetensors` weight files to Git
- Use HuggingFace model hub caching (`~/.cache/huggingface/`)

---

## Data Acquisition Scripts

Scripts will be placed in `backend/app/ml/data_acquisition/`:

```
download_phrasebank.py    — Financial PhraseBank via HuggingFace datasets
download_wsb.py           — WallStreetBets Kaggle dataset
annotate_risk_labels.py   — Map sentiment labels to Low/Medium/High/Critical
merge_datasets.py         — Merge all sources into training_data.csv
```

---

## Label Definition

| Label    | Int | Social signal criteria |
|----------|-----|------------------------|
| Low      | 0   | Normal news discussion, low hype, no squeeze signal |
| Medium   | 1   | Elevated retail interest, some FOMO language |
| High     | 2   | Strong short squeeze narrative, manipulation signals, elevated volume |
| Critical | 3   | Extreme FOMO, coordinated buy signals, trading restrictions, viral spread |

---

## Kaggle Credential Setup

1. Go to https://www.kaggle.com/account
2. Create API token → downloads `kaggle.json`
3. Place at `~/.kaggle/kaggle.json` (Unix) or `C:\Users\<user>\.kaggle\kaggle.json` (Windows)
4. **Never commit `kaggle.json` to Git**

```bash
# Install kaggle CLI
pip install kaggle

# Download dataset (example)
kaggle datasets download -d gpreda/reddit-wallstreetsbets-posts -p data/raw/
```

If Kaggle download fails (no account, rate limit, or API changes), the demo seed data remains the fallback. The model pipeline should always work regardless of Kaggle availability.

---

## Notes

- All public dataset use must comply with the respective licenses (CC BY-SA, MIT, etc.)
- Label any model trained on weak-label / demo data clearly in `model_metadata.json`
- Re-run `evaluate_models.py` after each dataset update to track metric improvement
