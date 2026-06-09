# Social Trading Risk Copilot

A full-stack social trading risk monitoring platform for US meme-stock and social-trading risk scenarios, including symbols such as GME, AMC, BB, KOSS, NOK, TSLA, PLTR, and NVDA. The system helps users monitor social-trading risk signals, analyze FOMO language, detect manipulation-related wording, review news signals, and explain short-squeeze narratives through an AI-assisted risk scoring interface.

**Live Demo:** `https://unalu027.github.io/social-trade-risk/`

> ⚠️ This project is an academic MVP prototype for social-risk monitoring and information-system demonstration. Analysis results are for educational and risk-awareness purposes only. They are not financial advice, investment recommendations, or trading signals.

---

## Project Overview

Social Trading Risk Copilot was inspired by the GameStop short-squeeze event and the broader rise of social-media-driven investing. The project explores how management information systems can transform unstructured social discussion, news signals, market snapshots, and risk indicators into a decision-support dashboard.

The MVP focuses on three main ideas:

1. **Social trading risk monitoring** — identifying abnormal discussion patterns, FOMO language, hype wording, and short-squeeze narratives.
2. **Decision-support visualization** — presenting risk levels, score bars, watchlist cards, trend views, and event context in a dashboard format.
3. **Resilient MVP deployment** — keeping the frontend usable through demo/static fallback data when external APIs are unavailable or restricted.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Routing | React Router with HashRouter for GitHub Pages |
| Data Fetching | Axios + TanStack React Query |
| State / UI Logic | React state, Zustand, reusable components |
| Charts | Recharts, lightweight-charts |
| Icons / UI | Lucide React, Framer Motion |
| Backend API | Python FastAPI deployed on Railway |
| Optional PHP Layer | PHP API for legacy/local data persistence |
| Database / Storage | SQL Server for local MVP data; GitHub JSON / static fallback for public monitoring data |
| ML / Risk Scoring | Text-based risk scoring, heuristic fallback, model experiment comparison |
| Deployment | GitHub Pages frontend + Railway backend |

---

## Core Pages

| Page | Route | Description |
|---|---|---|
| 風險監控中心 | `/risk-monitor` | Watchlist-based risk cards for supported US stock symbols, with FastAPI / PHP / demo fallback priority |
| 貼文風險分析 | `/post-analyzer` | Paste a social post, article text, or supported URL to score FOMO, hype language, manipulation signals, and short-squeeze narratives |
| 風險報告 | `/risk-report/:symbol` | Per-symbol risk summary, trend chart, event timeline, monitoring context, and risk interpretation |
| 模型實驗室 | `/model-lab` | Model comparison and experiment summary for explaining the ML / risk-scoring process |

> The previous stress-test page has been removed from the main navigation so the MVP can focus on social-trading risk monitoring, post analysis, risk reporting, and model explanation.

---

## Key Features

### 1. Risk Monitor

The risk monitor displays a watchlist-based dashboard for supported US symbols. Each card summarizes available market and social-risk indicators, including:

- social hype score
- manipulation signal score
- FOMO score
- short-squeeze pressure
- AI risk label
- data quality status
- demo / fallback indicators when live data is unavailable

The data priority is designed as:

```text
FastAPI market snapshots → PHP / legacy API snapshots → demo fallback snapshots
```

This allows the MVP to remain usable even when live APIs or database services are temporarily unavailable.

### 2. Post Analyzer

The post analyzer allows users to paste investment-related social posts or article text and receive a text-risk analysis. It estimates:

- FOMO language strength
- hype language strength
- manipulation signal strength
- urgency strength
- directional sentiment estimate
- short-squeeze narrative detection
- predicted risk label
- explanation and monitoring suggestion

If the production AI API is unavailable, the frontend can fall back to a local heuristic analysis so the page remains demonstrable.

### 3. URL / News Analysis

The system supports article URL analysis when the target website allows server-side access. It also uses available external news signals, such as Finnhub news, to provide recent context for selected symbols.

Some platforms, especially Reddit, may restrict server-side access. When a Reddit link cannot be accessed, users should paste the post or comment text directly into text analysis mode.

### 4. Risk Report

The risk report page provides per-symbol context, including risk summary, trend visualization, event timeline, and explanatory notes. It is designed to help users understand why a symbol may be considered low, medium, high, or critical risk from a social-trading perspective.

### 5. Model Lab

The model lab explains model experiment results and supports the educational goal of the MVP. It helps show how different model approaches can be compared using classification metrics, confusion matrices, and experiment summaries.

---

## External Data Source Notes

This MVP uses available external sources such as Finnhub news and API-based market signals. Some social sentiment endpoints may require specific API permissions. When an endpoint is not available for the current API key, the frontend hides unavailable social-summary cards or displays a small note rather than showing misleading empty data.

Important limitations:

- The system currently focuses on **US stock symbols**.
- Taiwan stock symbols such as `.TW` are intentionally not supported in this MVP version.
- Reddit server-side access may be restricted; text paste mode is the recommended fallback.
- External APIs may be unavailable, rate-limited, or permission-restricted.
- Demo/static data is used when live data cannot be retrieved.

---

## ML / Risk-Scoring Pipeline

The MVP uses a combination of model-based and fallback logic depending on the available environment.

### Current MVP Logic

- Text-based social-risk scoring for posts and article text
- Heuristic fallback when the production AI endpoint is unavailable
- Risk labels such as `Low`, `Medium`, `High`, and `Critical`
- Feature-style indicators such as FOMO, hype language, manipulation signals, and short-squeeze narrative detection
- Model experiment display in the Model Lab page

### Training / Experimentation Direction

The project has explored or planned the following approaches:

- TF-IDF + Logistic Regression baseline
- GridSearchCV model comparison
- Random Forest, Gradient Boosting, MLP, and other classical ML experiments
- Social numeric features combined with text-derived features
- Weak-label and demo-labeled training data for MVP development
- Future dataset expansion using public finance / social sentiment datasets

See related documentation under `docs/` for model mapping, public dataset planning, and MVP test notes.

---

## Local Development

This project can be run with separate frontend and backend services during development.

### 1. React Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend uses Vite and HashRouter so it can be deployed to GitHub Pages.

For local API testing, create `.env.local` in `frontend/` when needed:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_PHP_API_BASE_URL=http://localhost/social_trading_risk_starter/php-api
VITE_PERSONAL_API_BASE_URL=http://localhost:8000
```

### 2. FastAPI Backend

```bash
cd backend
pip install -r requirements-copilot-minimal.txt
uvicorn copilot_minimal:app --reload --port 8000
```

Open:

```text
http://localhost:8000/docs
```

for Swagger UI when the local backend is running.

### 3. Optional PHP / SQL Server Layer

The PHP API and SQL Server layer are mainly used for local or legacy MVP persistence.

Typical local setup:

```text
C:\Apache24\htdocs\social_trading_risk_starter\php-api\
```

Copy:

```text
php-api/config/config.example.php
```

to:

```text
php-api/config/config.local.php
```

and fill in local SQL Server credentials. Do not commit local credentials.

### 4. SQL Server Express

For local database testing, run the schema and seed files against the `SocialTradingRisk` database:

```text
database/sqlserver_schema.sql
database/seed_product_demo_sqlserver.sql
```

---

## Deployment

### Frontend → GitHub Pages

The frontend is deployed through GitHub Pages.

General deployment flow:

1. Push changes to GitHub.
2. Build the Vite frontend.
3. Deploy the generated `dist/` folder to the `gh-pages` branch.
4. GitHub Pages serves the static frontend.

The frontend is designed to fall back to demo/static data if the API is unavailable.

### Backend → Railway

The FastAPI backend can be deployed on Railway.

Recommended environment variables include:

```text
SECRET_KEY
ENVIRONMENT=production
ALLOWED_ORIGINS=https://unalu027.github.io
```

The public frontend can call the Railway backend through the configured API base URL.

---

## FastAPI Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/post-analyze` | Score a social post or text input for FOMO, manipulation, sentiment, and short-squeeze signals |
| POST | `/api/v1/analyze-url` | Extract and analyze article text when the target site allows server-side access |
| GET | `/api/v1/social-signals` | Return available Finnhub news signals and optional social-summary data when API access permits |
| GET | `/api/v1/market-snapshots` | Return market / risk snapshot data for watchlist symbols |
| GET | `/api/v1/model-lab/experiments` | Return model experiment summaries |
| GET | `/api/v1/health/product` | Product health check |
| GET | `/docs` | Swagger UI |

---

## PHP API Endpoints

The PHP API is retained for local / legacy data persistence and compatibility with earlier MVP versions.

| Method | Path | Description |
|---|---|---|
| GET | `/risk_snapshots.php` | All symbols' latest risk snapshot |
| GET | `/risk_snapshots.php?symbol=GME` | Historical snapshots for one symbol |
| GET | `/events.php?symbol=GME` | Events timeline for a symbol |
| GET | `/list_predictions.php` | Latest post predictions |
| GET | `/watchlist.php` | Watchlist symbols |
| POST | `/save_prediction.php` | Save a post analysis result |
| GET | `/model_experiments.php` | Model comparison data |
| GET | `/health.php` | API + DB health check |

---

## Project Structure

```text
social-trade-risk/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── api/
│       ├── components/
│       ├── context/
│       ├── data/
│       ├── lib/
│       └── pages/
│           ├── RiskMonitor.tsx
│           ├── PostAnalyzer.tsx
│           ├── RiskReport.tsx
│           └── ModelLab.tsx
├── php-api/
│   ├── config/
│   └── *.php
├── backend/
│   ├── copilot_minimal.py
│   ├── requirements-copilot-minimal.txt
│   └── app/
├── database/
│   ├── sqlserver_schema.sql
│   └── seed_product_demo_sqlserver.sql
└── docs/
    ├── setup_php_sqlserver.md
    ├── local_development.md
    ├── ml_pipeline_mapping.md
    ├── public_dataset_plan.md
    └── mvp_test_checklist.md
```

---

## Docs

- `docs/setup_php_sqlserver.md` — PHP + SQL Server setup guide
- `docs/local_development.md` — Full local development environment walkthrough
- `docs/ml_pipeline_mapping.md` — ML feature to database column mapping
- `docs/public_dataset_plan.md` — Plan for replacing synthetic or weak-label data with public datasets
- `docs/mvp_test_checklist.md` — Manual test checklist for MVP pages

---

## Current Limitations

This project is an MVP and has several known limitations:

- It is not a real investment advisory system.
- Risk scores should be interpreted as social-risk signals, not price predictions.
- Some external APIs may be unavailable, rate-limited, or permission-restricted.
- Finnhub social sentiment data may not be available for all API keys.
- Reddit links may be blocked by server-side access restrictions.
- Demo and weak-label data may be used for presentation and fallback purposes.
- Current scope focuses on US-listed stocks and meme-stock style risk scenarios.

---

## Future Improvements

Planned or possible improvements include:

- abnormal return calculation for event-based risk reports
- more complete public-dataset training pipeline
- scheduled annotation and batch retraining workflow
- improved model evaluation and comparison
- richer social-source integration through compliant public APIs
- clearer separation between live API mode and demo presentation mode
- more robust alerting for unusual social-volume spikes

---

## Disclaimer

This repository is for academic demonstration, MIS project development, and social-risk monitoring research. It does not provide financial advice, investment advice, trading advice, or portfolio recommendations. Users should not make investment decisions based solely on this system.
