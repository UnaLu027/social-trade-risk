<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

/**
 * external_signals.php
 * GET  ?symbol=TSLA&limit=20  — return recent stored Finnhub items
 * POST { symbol, items[] }    — batch-save with dedup by external_id / url
 */

function validateSymbol(string $raw): string {
    $sym = strtoupper(trim($raw));
    if ($sym === '' || !preg_match('/^[A-Z0-9.\-]{1,20}$/', $sym)) {
        jsonError('Invalid symbol: must be 1–20 chars, A-Z 0-9 . -', 400);
    }
    return $sym;
}

$method = $_SERVER['REQUEST_METHOD'];

// ── GET ──────────────────────────────────────────────────────────────────────

if ($method === 'GET') {
    $symbol = isset($_GET['symbol']) ? validateSymbol($_GET['symbol']) : '';
    if ($symbol === '') jsonError('symbol is required', 400);

    $limit = max(1, min(50, (int)($_GET['limit'] ?? 20)));

    try {
        $pdo  = getDbPdo();
        $sql  = "SELECT TOP $limit id, symbol, source, external_id, url, headline,
                        summary, published_at, ai_risk_label, ai_risk_score, fetched_at, created_at
                 FROM external_signal_records
                 WHERE symbol = ?
                 ORDER BY published_at DESC, id DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$symbol]);
        $rows = $stmt->fetchAll();

        jsonSuccess(['symbol' => $symbol, 'items' => $rows, 'count' => count($rows)]);
    } catch (Throwable $e) {
        jsonError('Database error', 500);
    }
}

// ── POST ─────────────────────────────────────────────────────────────────────

if ($method === 'POST') {
    $body   = getJsonBody();
    $symbol = isset($body['symbol']) ? validateSymbol((string)$body['symbol']) : '';
    if ($symbol === '') jsonError('symbol is required', 400);

    $items = $body['items'] ?? [];
    if (!is_array($items)) jsonError('items must be an array', 400);

    try {
        $pdo      = getDbPdo();
        $inserted = 0;
        $skipped  = 0;

        foreach ($items as $item) {
            if (!is_array($item)) continue;

            $headline = isset($item['headline']) ? substr(trim((string)$item['headline']), 0, 1000) : '';
            if ($headline === '') continue;

            $external_id = isset($item['id'])  ? substr(trim((string)$item['id']),  0, 255)  : null;
            $url         = isset($item['url'])  ? substr(trim((string)$item['url']), 0, 1000) : null;
            $source      = isset($item['source']) ? substr(trim((string)$item['source']), 0, 30) : 'finnhub';
            $summary     = isset($item['summary']) && $item['summary'] !== null ? (string)$item['summary'] : null;

            // published_at: parse ISO string → SQL Server datetime string
            $published_at = null;
            if (!empty($item['published_at'])) {
                try {
                    $dt           = new DateTime($item['published_at']);
                    $published_at = $dt->format('Y-m-d H:i:s');
                } catch (Exception $ex) { /* ignore bad dates */ }
            }

            $ai_risk_label = isset($item['ai_risk_label']) && $item['ai_risk_label'] !== null
                ? substr(trim((string)$item['ai_risk_label']), 0, 30) : null;
            $ai_risk_score = isset($item['ai_risk_score']) && is_numeric($item['ai_risk_score'])
                ? round((float)$item['ai_risk_score'], 2) : null;

            // Dedup: check external_id first, then url
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
                $skipped++;
                continue;
            }

            $fetched_at = date('Y-m-d H:i:s');
            $ins = $pdo->prepare(
                'INSERT INTO external_signal_records
                 (symbol, source, external_id, url, headline, summary, published_at,
                  ai_risk_label, ai_risk_score, fetched_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $symbol, $source, $external_id ?: null, $url ?: null,
                $headline, $summary, $published_at,
                $ai_risk_label, $ai_risk_score, $fetched_at,
            ]);
            $inserted++;
        }

        jsonSuccess(['inserted_count' => $inserted, 'skipped_count' => $skipped]);
    } catch (Throwable $e) {
        jsonError('Database error', 500);
    }
}

jsonError('Method not allowed', 405);
