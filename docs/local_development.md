# Local Development Guide

## Architecture Overview

```
[React Frontend]  ←→  [FastAPI on Railway]   (inference only)
       ↕
[PHP API + Apache]  ←→  [SQL Server Express]  (data layer)
```

- **React** (`frontend/`) — Vite + TypeScript, served locally on port 5173
- **FastAPI** (`backend/`) — ML inference only, deployed on Railway; can run locally on port 8000
- **PHP API** (`php-api/`) — SQL Server CRUD, served by Apache locally
- **SQL Server** (`SocialTradingRisk`) — persistent data store, managed with SSMS

---

## Source of Truth

| Purpose | Path |
|---|---|
| Main Git repo | `C:\Users\samue\social-trade-risk` (GitHub: UnaLu027/social-trade-risk) |
| Apache PHP runtime | `C:\Apache24\htdocs\social_trading_risk_starter\php-api\` |
| Workflow | Edit in repo → copy `php-api/` to htdocs for testing → commit to repo |

**Never** treat the htdocs folder as the primary source of truth.

---

## 1. Start SQL Server

Open SSMS → verify `UNA-ASUS-NB1\SQLEXPRESS` is running.

```sql
USE SocialTradingRisk;
SELECT COUNT(*) FROM watchlist;  -- should be 8
```

---

## 2. Start Apache (PHP)

```
C:\Apache24\bin\httpd.exe
```

Or start from Windows Services / XAMPP panel.

Test: `http://localhost/social_trading_risk_starter/php-api/health.php`

---

## 3. Start FastAPI (optional, for ML inference)

```bash
cd C:\Users\samue\social-trade-risk\backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Test: `http://localhost:8000/health`

---

## 4. Start React Frontend

```bash
cd C:\Users\samue\social-trade-risk\frontend
npm run dev
```

Create `.env.local` if not present:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_PHP_API_BASE_URL=http://localhost/social_trading_risk_starter/php-api
```

Open: `http://localhost:5173`

The app should open directly at `/risk-monitor` (the new homepage).

---

## 5. Copy php-api to htdocs

After modifying `php-api/` in the repo:

```cmd
xcopy /E /Y "C:\Users\samue\social-trade-risk\php-api" "C:\Apache24\htdocs\social_trading_risk_starter\php-api\"
```

Make sure `config.local.php` exists under `htdocs/.../php-api/config/` (it is git-ignored, so copy manually after setup).

---

## 6. Run ML Training (local only)

```bash
cd C:\Users\samue\social-trade-risk\backend
.venv\Scripts\activate

# 1. Build training dataset
python -m app.ml.training.build_training_dataset

# 2. Train text classifier (TF-IDF baseline)
python -m app.ml.training.train_text_classifier

# 3. Train fusion model (all 4-5 models)
python -m app.ml.training.train_fusion_model

# 4. Evaluate
python -m app.ml.training.evaluate_models
```

Training output goes to `backend/app/ml/models/`.

---

## 7. GitHub Pages Deployment

The React app is deployed to GitHub Pages via GitHub Actions.

URL: `https://unalu027.github.io/social-trade-risk/`

**GitHub Pages limitation:** it cannot call `localhost` PHP APIs.

For a public demo that shows live PHP data:
- Use **ngrok** to expose Apache: `ngrok http 80`
- Or use **Cloudflare Tunnel**: `cloudflared tunnel`
- Set the public URL in `VITE_PHP_API_BASE_URL` during the build

The app falls back to demo static data if the PHP API is unreachable, so the GitHub Pages site will always render.

---

## 8. Notes on Railway Deployment

Railway only hosts the **FastAPI inference layer**. It does NOT:
- Connect to your local SQL Server
- Run PHP
- Run ML training

Railway only needs environment variables:
- `ALLOWED_ORIGINS` — include GitHub Pages URL
- `FINNHUB_API_KEY` — optional
- `SCHEDULER_ENABLED` — set to false if not needed
