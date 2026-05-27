# PHP + SQL Server Setup Guide

This guide covers local development setup for the PHP data layer.

## Prerequisites

- Windows with SQL Server Express (e.g. `UNA-ASUS-NB1\SQLEXPRESS`)
- SSMS (SQL Server Management Studio)
- PHP 8.x with `sqlsrv` and `pdo_sqlsrv` extensions
- Apache (e.g. Apache 2.4 via XAMPP or standalone)

---

## 1. SSMS — Create Database and Import Schema

Open SSMS and connect to your SQL Server instance (e.g. `UNA-ASUS-NB1\SQLEXPRESS`).

**Create the database:**

```sql
CREATE DATABASE SocialTradingRisk;
```

**Run schema script:**

Open `database/sqlserver_schema.sql` in SSMS, switch to the `SocialTradingRisk` database, and execute.

**Import demo data:**

Open `database/seed_product_demo_sqlserver.sql` and execute. This inserts 8 US tickers (GME, AMC, BB, KOSS, NOK, TSLA, PLTR, NVDA), social posts, risk snapshots, events, alerts, and model experiments.

**Verify:**

```sql
USE SocialTradingRisk;
SELECT COUNT(*) FROM watchlist;         -- should be 8
SELECT COUNT(*) FROM risk_snapshots;    -- should be 14+
SELECT COUNT(*) FROM social_posts;      -- should be 27+
```

---

## 2. PHP Extension Configuration

### Verify extensions are loaded

In `php.ini` (find with `php --ini`), ensure these lines are uncommented:

```ini
extension=sqlsrv
extension=pdo_sqlsrv
```

Download the Microsoft SQLSRV PHP drivers if not already installed:
[https://learn.microsoft.com/en-us/sql/connect/php/download-drivers-php-sql-server](https://learn.microsoft.com/en-us/sql/connect/php/download-drivers-php-sql-server)

Restart Apache after changes.

### Verify

```bash
php -m | grep -i sqlsrv
# Expected: sqlsrv, pdo_sqlsrv
```

---

## 3. PHP DB Config

Copy the example config:

```bash
cp php-api/config/config.example.php php-api/config/config.local.php
```

Edit `config.local.php` with your actual credentials:

```php
define('DB_SERVER',   'UNA-ASUS-NB1\\SQLEXPRESS');
define('DB_PORT',     '1433');
define('DB_NAME',     'SocialTradingRisk');
define('DB_USER',     'your_sql_user');
define('DB_PASSWORD', 'YourPassword123!');
```

**Important:** `config.local.php` is git-ignored. Never commit real credentials.

---

## 4. Copy PHP API to Apache htdocs

The `php-api/` folder in the repo is the source of truth. After making changes, copy it to Apache for testing:

```
xcopy /E /Y C:\Users\samue\social-trade-risk\php-api C:\Apache24\htdocs\social_trading_risk_starter\php-api\
```

Or configure a symbolic link if preferred.

---

## 5. Test the PHP Endpoints

With Apache running, open a browser or use curl:

```bash
# Health check
curl http://localhost/social_trading_risk_starter/php-api/health.php

# Expected response:
# {"success":true,"data":{"status":"ok","database":"SocialTradingRisk","connected":true,...}}

# Risk snapshots (all)
curl http://localhost/social_trading_risk_starter/php-api/risk_snapshots.php

# Risk snapshots for GME
curl "http://localhost/social_trading_risk_starter/php-api/risk_snapshots.php?symbol=GME&limit=5"

# Events for GME
curl "http://localhost/social_trading_risk_starter/php-api/events.php?symbol=GME"

# Alerts
curl http://localhost/social_trading_risk_starter/php-api/alerts.php

# Model experiments
curl http://localhost/social_trading_risk_starter/php-api/model_experiments.php
```

---

## 6. Frontend .env Configuration

In `frontend/.env.local` (create if not exists, git-ignored):

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_PHP_API_BASE_URL=http://localhost/social_trading_risk_starter/php-api
```

The React app uses `VITE_PHP_API_BASE_URL` for all PHP API calls. During `npm run dev`, these env vars are picked up automatically by Vite.

---

## 7. .gitignore Check

Ensure the following are in `.gitignore`:

```
php-api/config/config.local.php
php-api/config/db.php.local
frontend/.env.local
frontend/.env
*.pkl
*.bin
*.safetensors
```

---

## 8. Common Errors

| Error | Cause | Fix |
|---|---|---|
| `connected: false` in health.php | Wrong credentials or SQL Server not running | Check SSMS + credentials in config.local.php |
| `Call to undefined function sqlsrv_connect()` | sqlsrv extension not loaded | Install SQLSRV drivers, enable in php.ini, restart Apache |
| CORS error in browser | PHP CORS headers not matching frontend origin | Check `cors.php` allowed origins |
| `Only US stocks are supported` | Symbol contains `.TW` | This is by design — MVP is US-only |
