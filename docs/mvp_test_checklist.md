# MVP Manual Test Checklist

> Run these checks after every `npm run build` or before a demo. All 5 pages have demo fallbacks — if the PHP API or FastAPI is unreachable the UI should still render with static data (no blank screens).

---

## Prerequisites

| Service | Expected Status | How to Verify |
|---|---|---|
| Apache (PHP API) | Running on port 80 | `http://localhost/social_trading_risk_starter/php-api/health.php` → `{"success":true}` |
| SQL Server Express | Running | SSMS → connect `UNA-ASUS-NB1\SQLEXPRESS` → DB `SocialTradingRisk` exists |
| FastAPI (copilot_minimal) | Running on port 8000 | `http://localhost:8000/docs` → Swagger UI loads |
| React Dev Server | Running on port 5173 | `http://localhost:5173/social-trade-risk/` → app loads |

---

## Page 1 — 風險監控中心 (`/risk-monitor`)

### Test Steps

1. Navigate to `http://localhost:5173/social-trade-risk/#/risk-monitor`
2. Observe the risk cards grid

### Expected Results

- [ ] At least 8 risk cards appear (GME, AMC, BB, KOSS, NOK, TSLA, PLTR, NVDA)
- [ ] Each card shows: symbol, risk label badge (Low / Medium / High / Critical), social hype score bar, manipulation score bar, FOMO score bar
- [ ] Risk label filter buttons at top (All / Low / Medium / High / Critical) are clickable and filter the card grid
- [ ] "Critical" and "High" cards appear first in the default sort order
- [ ] Clicking any card navigates to `/risk-report/:symbol`

### API-Off Fallback

- [ ] With Apache stopped: page still renders 8 demo cards (DEMO_SNAPSHOTS fallback)
- [ ] No blank screen, no unhandled error

### Common Errors

| Error | Fix |
|---|---|
| All cards blank / loading spinner stuck | PHP API unreachable — check Apache and `config.local.php` credentials |
| "CORS error" in browser console | Verify `cors.php` allows `localhost:5173` |
| Cards show but scores are 0 | Seed data may not be loaded — run `seed_product_demo_sqlserver.sql` |

---

## Page 2 — 貼文風險分析 (`/post-analyzer`)

### Test Steps

1. Navigate to `#/post-analyzer`
2. Paste a test post into the textarea, e.g.:
   > `GME is going to squeeze HARD tomorrow. FOMO is real, don't miss out! 🚀🚀🚀`
3. Click "分析貼文" (Analyze Post)
4. Observe results panel

### Expected Results

- [ ] Sentiment score appears (positive/negative bar)
- [ ] FOMO score (0–1) displayed
- [ ] Manipulation signal score displayed
- [ ] Hype language score displayed
- [ ] Urgency score displayed
- [ ] Short-squeeze narrative detected: `true` for the sample post above
- [ ] Risk label shown (e.g., "High" or "Critical")
- [ ] Explanation text present
- [ ] "Saved to database" confirmation appears (if PHP API online)

### API-Off Fallback

- [ ] With FastAPI stopped: heuristic fallback still returns a result (no blank/error)
- [ ] With PHP API stopped: analysis still works but save confirmation is skipped

### Common Errors

| Error | Fix |
|---|---|
| "分析失敗" / error toast | FastAPI not running — start `uvicorn copilot_minimal:app --port 8000` |
| Save fails silently | Check `save_prediction.php` and SQL Server connection |
| Empty textarea submit | Should show validation message — button should be disabled |

---

## Page 3 — 風險報告 (`/risk-report/GME`)

### Test Steps

1. Navigate to `#/risk-report/GME`
2. Observe the chart and event timeline

### Expected Results

- [ ] Page title shows "GME 風險報告" (or similar)
- [ ] Line chart renders with at least one data series (social hype score or risk trend over time)
- [ ] X-axis shows dates, Y-axis shows score range
- [ ] Event timeline section appears below the chart
- [ ] At least 3–5 event entries visible for GME (dates, event type, description)
- [ ] Events are color-coded by `risk_impact` (High = red, Medium = orange, Low = green)
- [ ] GME narrative text block visible
- [ ] Sidebar "風險報告" nav item is highlighted as active

### Try Other Symbols

- [ ] Navigate to `#/risk-report/AMC` — chart and events load (or show empty state gracefully)
- [ ] Navigate to `#/risk-report/TSLA` — no crash

### Common Errors

| Error | Fix |
|---|---|
| Chart empty / no data points | `risk_snapshots` table missing data for GME — re-run seed SQL |
| Events section empty | `events` table empty — re-run seed SQL |
| 400 error for `.TW` symbols | Expected behavior — `assertUsSymbol` rejects Taiwan stocks |

---

## Page 4 — 情境壓力測試 (`/stress-test`)

### Test Steps

1. Navigate to `#/stress-test`
2. Adjust the sliders:
   - Set `social_hype_score` to 85
   - Set `short_interest_ratio` to 0.45
   - Toggle `trading_restriction` ON
3. Click "執行壓力測試" (Run Stress Test)
4. Observe the output charts

### Expected Results

- [ ] 7 sliders are present and draggable: `social_hype_score`, `mention_surge_ratio`, `bullish_ratio`, `short_interest_ratio`, `volume_spike_ratio`, `fomo_score`, `manipulation_signal_score`
- [ ] `trading_restriction` toggle present
- [ ] After submit: two line charts render — `belief_curve` and `price_curve`
- [ ] Risk outcome label shown (e.g., "High Squeeze Risk")
- [ ] "Saved to database" confirmation (if PHP API online)

### API-Off Fallback

- [ ] With FastAPI stopped: local `localSimulate()` fallback runs — charts still render
- [ ] No crash or blank page

### Common Errors

| Error | Fix |
|---|---|
| Charts don't render after submit | FastAPI returned unexpected shape — check browser network tab for response |
| Sliders show NaN | Default value initialization issue — refresh page |
| Save error | Check `save_simulation.php` |

---

## Page 5 — 模型實驗室 (`/model-lab`)

### Test Steps

1. Navigate to `#/model-lab`
2. Observe the model comparison table and charts

### Expected Results

- [ ] Table lists at least 3–5 model experiments with: model name, accuracy, F1 score, training date
- [ ] Bar chart shows accuracy/F1 comparison across models
- [ ] Clicking a row expands detail (or shows confusion matrix panel)
- [ ] "Best model" or highlighted row for top performer
- [ ] Data source label indicates "demo" or "live" experiments

### API-Off Fallback

- [ ] With PHP API stopped: DEMO_EXPERIMENTS data renders — no blank screen

### Common Errors

| Error | Fix |
|---|---|
| Table empty | `model_experiments` table has no rows — re-run seed SQL |
| Chart fails to render | Check browser console for Recharts data shape errors |

---

## Cross-Page Checks

- [ ] **Sidebar navigation**: clicking each of the 5 nav items navigates correctly, active item highlights in green
- [ ] **Legacy routes redirect**: `/#/market-pulse`, `/#/overview`, `/#/screener`, `/#/event-replay`, `/#/alerts`, `/#/scenario`, `/#/fake-news`, `/#/model-insights` all redirect to `/#/risk-monitor`
- [ ] **No Taiwan stocks**: no `.TW`, TWSE, TWD, NT$ references anywhere in the UI
- [ ] **No blank screens**: every page renders something even when all APIs are offline
- [ ] **Mobile layout**: sidebar is visible and pages don't overflow horizontally at 768px width (basic check)

---

## Build Verification

Run locally before any deploy:

```bash
cd frontend
npm run build
# Expected: no TypeScript errors, dist/ folder created
# Then optionally preview:
npm run preview
```

Common build errors:

| Error | Fix |
|---|---|
| `Cannot find module './pages/...'` | Check import paths in `App.tsx` match actual file names |
| TypeScript type error in legacy page | Legacy pages are imported but suppressed with `void` — type errors inside those files may still surface; fix or add `// @ts-ignore` |
| Tailwind classes not found | Run `npm install` to ensure `@tailwindcss/vite` is present |

---

*Last updated: 2026-05-28 — MVP v1.0*
