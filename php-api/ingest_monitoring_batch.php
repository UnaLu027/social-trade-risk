<?php
/**
 * ingest_monitoring_batch.php
 *
 * Server-to-server ingestion endpoint called by the GitHub Actions refresh script.
 * NOT for public browser access — protected by X-INGEST-KEY secret token.
 *
 * POST only. Body:
 * {
 *   "symbol":    "GME",
 *   "fetched_at": "2026-05-30T06:00:00.000Z",
 *   "items":     [...],   // Finnhub news items
 *   "summary":   {...},   // caution summary
 *   "refresh_status": "success"|"partial"|"error",
 *   "error_message": null
 * }
 */

require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

header('Content-Type: application/json; charset=UTF-8');

// ── 1. Method guard ──────────────────────────────────────────────────────────

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError('Method not allowed', 405);
}

// ── 2. Token guard ───────────────────────────────────────────────────────────

$ingest_secret = '';
if (defined('INGEST_SECRET')) {
    $ingest_secret = INGEST_SECRET;
} else {
    $ingest_secret = getenv('INGEST_SECRET') ?: '';
}

if ($ingest_secret === '') {
    jsonError('Server configuration error: INGEST_SECRET not set', 500);
}

$provided_key = $_SERVER['HTTP_X_INGEST_KEY'] ?? '';

if ($provided_key === '' || !hash_equals($ingest_secret, $provided_key)) {
    jsonError('Unauthorized', 401);
}

// ── 3. Parse body ────────────────────────────────────────────────────────────

$body = getJsonBody();

$raw_symbol = $body['symbol'] ?? '';
$symbol = strtoupper(trim($raw_symbol));
if ($symbol === '' || !preg_match('/^[A-Z0-9.\-]{1,20}$/', $symbol)) {
    jsonError('Invalid or missing symbol', 400);
}

$refresh_status = isset($body['refresh_status']) ? substr(trim((string)$body['refresh_status']), 0, 20) : 'success';
if (!in_array($refresh_status, ['success', 'partial', 'error'], true)) {
    $refresh_status = 'success';
}

$fetched_at_raw = $body['fetched_at'] ?? '';
$fetched_at = date('Y-m-d H:i:s');
if (!empty($fetched_at_raw)) {
    try {
        $dt = new DateTime($fetched_at_raw);
        $fetched_at = $dt->format('Y-m-d H:i:s');
    } catch (Exception $ex) { /* keep current time */ }
}

$error_message = isset($body['error_message']) && $body['error_message'] !== null
    ? substr((string)$body['error_message'], 0, 2000) : null;

$items   = $body['items']   ?? [];
$summary = $body['summary'] ?? [];

if (!is_array($items))   $items = [];
if (!is_array($summary)) $summary = [];

// ── 4. DB writes ─────────────────────────────────────────────────────────────

try {
    $pdo = getDbPdo();

    // 4a. Insert news items with dedup
    $inserted_news = 0;
    $skipped_news  = 0;

    foreach ($items as $item) {
        if (!is_array($item)) continue;

        $headline = isset($item['headline']) ? substr(trim((string)$item['headline']), 0, 1000) : '';
        if ($headline === '') continue;

        $external_id   = isset($item['id'])     ? substr(trim((string)$item['id']),     0, 255)  : null;
        $url           = isset($item['url'])     ? substr(trim((string)$item['url']),    0, 1000) : null;
        $source        = isset($item['source'])  ? substr(trim((string)$item['source']), 0, 30)   : 'finnhub';
        $summary_text  = isset($item['summary']) ? (string)$item['summary'] : null;

        $item_published_at = null;
        if (!empty($item['published_at'])) {
            try {
                $dt2 = new DateTime($item['published_at']);
                $item_published_at = $dt2->format('Y-m-d H:i:s');
            } catch (Exception $ex) { /* ignore */ }
        }

        $ai_risk_label = isset($item['ai_risk_label']) && $item['ai_risk_label'] !== null
            ? substr(trim((string)$item['ai_risk_label']), 0, 30) : null;
        $ai_risk_score = isset($item['ai_risk_score']) && is_numeric($item['ai_risk_score'])
            ? round((float)$item['ai_risk_score'], 2) : null;

        // Dedup by external_id, then url
        $exists = false;
        if ($external_id !== null && $external_id !== '') {
            $chk = $pdo->prepare('SELECT 1 FROM external_signal_records WHERE symbol = ? AND external_id = ?');
            $chk->execute([$symbol, $external_id]);
            $exists = (bool)$chk->fetch();
        }
        if (!$exists && $url !== null && $url !== '') {
            $chk = $pdo->prepare('SELECT 1 FROM external_signal_records WHERE symbol = ? AND url = ?');
            $chk->execute([$symbol, $url]);
            $exists = (bool)$chk->fetch();
        }

        if ($exists) {
            $skipped_news++;
            continue;
        }

        $ins = $pdo->prepare(
            'INSERT INTO external_signal_records
             (symbol, source, external_id, url, headline, summary, published_at,
              ai_risk_label, ai_risk_score, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $symbol, $source, $external_id ?: null, $url ?: null,
            $headline, $summary_text, $item_published_at,
            $ai_risk_label, $ai_risk_score, $fetched_at,
        ]);
        $inserted_news++;
    }

    // 4b. Insert caution summary with dedup
    $summary_saved = false;
    if (!empty($summary)) {
        $signal_level = isset($summary['signal_level'])
            ? substr(trim((string)$summary['signal_level']), 0, 30) : '';

        if ($signal_level !== '') {
            $combined_score        = isset($summary['combined_score']) && is_numeric($summary['combined_score'])
                ? round((float)$summary['combined_score'], 2) : 0.0;
            $external_news_score   = isset($summary['external_news_score']) && is_numeric($summary['external_news_score'])
                ? round((float)$summary['external_news_score'], 2) : null;
            $latest_snapshot_score = isset($summary['latest_snapshot_score']) && is_numeric($summary['latest_snapshot_score'])
                ? round((float)$summary['latest_snapshot_score'], 2) : null;
            $market_history_score  = isset($summary['market_history_score']) && is_numeric($summary['market_history_score'])
                ? round((float)$summary['market_history_score'], 2) : null;
            $data_coverage         = isset($summary['data_coverage'])
                ? substr(trim((string)$summary['data_coverage']), 0, 20) : 'NONE';
            $interpretation_status = isset($summary['interpretation_status'])
                ? substr(trim((string)$summary['interpretation_status']), 0, 30) : 'insufficient_data';
            $coverage_note         = isset($summary['coverage_note']) ? (string)$summary['coverage_note'] : null;
            $source_count          = isset($summary['source_count']) ? (int)$summary['source_count'] : 0;
            $generated_at          = isset($summary['generated_at'])
                ? substr(trim((string)$summary['generated_at']), 0, 50) : $fetched_at;

            // Dedup: same symbol + generated_at
            $chk = $pdo->prepare('SELECT 1 FROM caution_summary_records WHERE symbol = ? AND generated_at = ?');
            $chk->execute([$symbol, $generated_at]);
            if (!$chk->fetch()) {
                $ins2 = $pdo->prepare(
                    'INSERT INTO caution_summary_records
                     (symbol, signal_level, combined_score, external_news_score, latest_snapshot_score,
                      market_history_score, data_coverage, interpretation_status, coverage_note,
                      source_count, generated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $ins2->execute([
                    $symbol, $signal_level, $combined_score,
                    $external_news_score, $latest_snapshot_score, $market_history_score,
                    $data_coverage, $interpretation_status, $coverage_note,
                    $source_count, $generated_at,
                ]);
                $summary_saved = true;
            }
        }
    }

    // 4c. Log the refresh run
    $ins3 = $pdo->prepare(
        'INSERT INTO monitor_refresh_runs
         (symbol, refresh_status, fetched_at, news_item_count, error_message)
         VALUES (?, ?, ?, ?, ?)'
    );
    $ins3->execute([
        $symbol, $refresh_status, $fetched_at,
        $inserted_news, $error_message,
    ]);

    jsonSuccess([
        'symbol'         => $symbol,
        'news_inserted'  => $inserted_news,
        'news_skipped'   => $skipped_news,
        'summary_saved'  => $summary_saved,
        'refresh_status' => $refresh_status,
    ]);

} catch (Throwable $e) {
    jsonError('Database error: ' . $e->getMessage(), 500);
}
