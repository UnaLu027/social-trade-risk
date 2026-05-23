# Social Trading Intelligence Platform

A full-stack financial analytics dashboard for analyzing GameStop-style social-driven trading risk.

**Live Demo:** `https://<your-github-username>.github.io/social-trade-risk/`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Charts | Recharts (area, bar, composed) + custom SVG gauge |
| State | Zustand + TanStack Query (30s polling) |
| Backend | Python FastAPI (async, OpenAPI docs) |
| Database | PostgreSQL (Railway hosted) |
| ML | scikit-learn StackingClassifier — F1-weighted: **0.9975** |
| Sentiment | VADER (nltk) |
| Data | yfinance (stock prices) + Reddit public JSON |
| Scheduler | APScheduler (in-process background jobs) |
| Deploy | GitHub Pages (frontend) + Railway (backend) |

---

## Dashboard Pages

1. **Market Pulse** — Real-time ticker view with price, hype score (0–100), sentiment distribution, ML risk probability, top community posts
2. **Event Replay** — Historical timeline of GME 2021 squeeze: price + mentions + hype score with event markers
3. **Alert Center** — Rule-based alert feed (5 rules: hype_spike, volume_bomb, model_warning, etc.) + watchlist management
4. **Scenario Lab** — Interactive sliders simulate squeeze conditions → StackingClassifier predicts risk outcome

---

## ML Model

- **Architecture:** `StackingClassifier(RandomForest + LogisticRegression → GradientBoosting)`
- **Training data:** 8,000 synthetic rows augmented from real GME/AMC 2021 yfinance data
- **Features (13):** mention_count_1h/24h, mention_growth_ratio, bullish_ratio, avg_sentiment, influencer_score, price_change_pct_1h/24h, volume_spike_ratio, short_interest_ratio, option_volume_spike, hype_score_raw, hour_of_day
- **Accuracy:** 99.75% | **F1-weighted:** 0.9975

---

## Quick Start (Local)

### Backend
```bash
cd backend
pip install -r requirements.txt
python -m app.ml.generate_dataset   # generate training data
python -m app.ml.train               # train model (~1-2 min)
python scripts/seed_data.py          # seed GME 2021 event data
uvicorn app.main:app --reload        # start dev server at :8000
```

Open `http://localhost:8000/docs` for auto-generated Swagger API docs.

### Frontend
```bash
cd frontend
npm install
# Create .env.local with: VITE_API_BASE_URL=http://localhost:8000
npm run dev     # start at http://localhost:5173/social-trade-risk/
```

---

## Deployment

### Backend → Railway
1. Push to GitHub
2. Railway → New Project → Deploy from GitHub → root dir: `backend/`
3. Add PostgreSQL plugin
4. Set env vars: `SECRET_KEY`, `ENVIRONMENT=production`, `ALLOWED_ORIGINS=https://<user>.github.io`

### Frontend → GitHub Pages
1. Add `VITE_API_BASE_URL` to GitHub repo secrets (= Railway backend URL)
2. Push to `main` → GitHub Actions auto-deploys to `gh-pages` branch
3. Repo Settings → Pages → source: `gh-pages` branch

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/market-pulse/{ticker}` | Real-time market + social + ML data |
| GET | `/api/v1/event-replay/{ticker}` | Historical timeline |
| GET | `/api/v1/alerts` | Alert feed |
| POST | `/api/v1/scenario/simulate` | ML risk simulation |
| GET | `/health` | Server + model status |
| GET | `/docs` | Swagger UI |
