# Social Trading Risk Copilot

A full-stack social trading risk monitoring platform for US meme stocks (GME, AMC, BB, KOSS, NOK, TSLA, PLTR, NVDA). Analyzes social sentiment, manipulation signals, and short-squeeze pressure via AI risk scoring.

**Live Demo:** `https://unalu027.github.io/social-trade-risk/`

> ⚠️ All data is synthetic/demo-labeled for MVP purposes. Not financial advice.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Charts | Recharts (area, bar, composed) |
| Routing | React Router v6 (HashRouter for GitHub Pages) |
| PHP API | PHP 8 + sqlsrv / PDO_SQLSRV (Apache) |
| Database | SQL Server Express (local) |
| ML Inference | Python FastAPI minimal (`copilot_minimal.py`) |
| ML Training | scikit-learn — TF-IDF + LR baseline, GridSearchCV comparison |
| Deploy | GitHub Pages (frontend) + Railway (FastAPI backend) |

---

## Core Pages

| Page | Route | Description |
|---|---|---|
| 風險監控中心 | `/risk-monitor` | Live risk cards for all watchlist symbols, sortable by risk level |
| 貼文風險分析 | `/post-analyzer` | Paste any social post → AI scores FOMO, manipulation, short-squeeze signals |
| 風險報告 | `/risk-report/:symbol` | Per-symbol risk trend chart + event timeline |
| 情境壓力測試 | `/stress-test` | 7 sliders simulate squeeze conditions → risk outcome curves |
| 模型實驗室 | `/model-lab` | Compare 5 ML models: accuracy, F1, confusion matrix |

---

## ML Pipeline

- **Phase 1 (baseline):** TF-IDF (5,000 features) + Logistic Regression
- **Phase 2 (fusion):** GridSearchCV across LR / Random Forest / Gradient Boosting / MLP / XGBoost with social numeric features
- **Training data:** synthetic weak-label data from `build_training_dataset.py` + SQL Server
- See `docs/ml_pipeline_mapping.md` and `docs/public_dataset_plan.md` for details

---

## Local Development (MVP Stack)

This project uses **three separate local services** in development:

### 1. SQL Server Express
Ensure `UNA-ASUS-NB1\SQLEXPRESS` is running. Run schema + seed:
```sql
-- In SSMS or sqlcmd, against SocialTradingRisk DB:
-- database/sqlserver_schema.sql   (create tables)
-- database/seed_product_demo_sqlserver.sql  (insert demo data)
```

### 2. PHP API (Apache)
Copy or symlink `php-api/` into Apache htdocs:
```
C:\Apache24\htdocs\social_trading_risk_starter\php-api\
```
Copy `php-api/config/config.example.php` → `php-api/config/config.local.php` and fill in your SQL Server credentials (never commit this file).

Start Apache, then verify:
```
http://localhost/social_trading_risk_starter/php-api/health.php
```

### 3. FastAPI ML Inference
```bash
cd backend
pip install -r requirements-copilot-minimal.txt
uvicorn copilot_minimal:app --reload --port 8000
```
> Use `requirements-copilot-minimal.txt`, **not** `uvicorn[standard]` or the heavy `requirements.txt`.

Open `http://localhost:8000/docs` for Swagger UI.

### 4. React Frontend
```bash
cd frontend
npm install
# Copy .env.example → .env.local and set:
# VITE_PHP_API_BASE_URL=http://localhost/social_trading_risk_starter/php-api
# VITE_API_BASE_URL=http://localhost:8000
npm run dev     # → http://localhost:5173/social-trade-risk/
```

---

## Deployment

### FastAPI Backend → Railway
1. Push to GitHub
2. Railway → New Project → Deploy from GitHub → root dir: `backend/`
3. Set env vars: `SECRET_KEY`, `ENVIRONMENT=production`, `ALLOWED_ORIGINS=https://unalu027.github.io`
4. Use `copilot_minimal.py` as the entry point (not `app.main`)

### Frontend → GitHub Pages
1. Add `VITE_API_BASE_URL` to GitHub repo secrets (= Railway backend URL)
2. Add `VITE_PHP_API_BASE_URL` to secrets (= deployed PHP API URL, if applicable)
3. Push to `main` → GitHub Actions auto-deploys to `gh-pages` branch
4. Repo Settings → Pages → source: `gh-pages` branch

> The frontend gracefully falls back to demo/static data if either API is unreachable.

---

## PHP API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/risk_snapshots.php` | All symbols' latest risk snapshot |
| GET | `/risk_snapshots.php?symbol=GME` | Historical snapshots for one symbol |
| GET | `/events.php?symbol=GME` | Events timeline for a symbol |
| GET | `/list_predictions.php` | Latest 50 post predictions |
| GET | `/watchlist.php` | Watchlist symbols |
| POST | `/save_prediction.php` | Save a post analysis result |
| POST | `/save_simulation.php` | Save a stress-test run |
| GET | `/model_experiments.php` | Model comparison data |
| GET | `/health.php` | API + DB health check |

## FastAPI Endpoints (copilot_minimal.py)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/post-analyze` | Score a social post (FOMO, manipulation, sentiment) |
| POST | `/api/v1/stress-test` | Simulate squeeze conditions |
| GET | `/api/v1/model-lab/experiments` | Model experiment summaries |
| GET | `/api/v1/health/product` | Product health check |
| GET | `/docs` | Swagger UI |

---

## Project Structure

```
social-trade-risk/
├── frontend/          # React + Vite app
│   └── src/pages/     # RiskMonitor, PostAnalyzer, RiskReport, StressTest, ModelLab
├── php-api/           # PHP data layer (Apache + SQL Server)
│   └── config/        # db.php, cors.php, helpers.php, config.example.php
├── backend/           # FastAPI ML inference
│   ├── copilot_minimal.py
│   ├── requirements-copilot-minimal.txt
│   └── app/ml/training/   # build_training_dataset.py, train_*.py, evaluate_models.py
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
- `docs/local_development.md` — Full local dev environment walkthrough
- `docs/ml_pipeline_mapping.md` — ML feature → DB column mapping
- `docs/public_dataset_plan.md` — Plan for replacing synthetic data with public datasets
- `docs/mvp_test_checklist.md` — Manual test checklist for all 5 core pages
