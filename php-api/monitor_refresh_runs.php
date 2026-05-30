<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

/**
 * monitor_refresh_runs.php
 * GET  ?symbol=GME&limit=5  — return recent scheduled refresh run records
 *
 * Used by frontend to display last auto-update time and freshness status.
 * Read-only; writing is done only by the secure ingest_monitoring_batch.php endpoint.
 */

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonError('Method not allowed', 405);
}

$raw_symbol = $_GET['symbol'] ?? '';
$symbol = strtoupper(trim($raw_symbol));
if ($symbol === '' || !preg_match('/^[A-Z0-9.\-]{1,20}$/', $symbol)) {
    jsonError('Invalid or missing symbol', 400);
}

$limit = max(1, min(20, (int)($_GET['limit'] ?? 5)));

try {
    $pdo = getDbPdo();
    $stmt = $pdo->prepare(
        "SELECT id, symbol, refresh_status, fetched_at, news_item_count, error_message, created_at
         FROM monitor_refresh_runs
         WHERE symbol = ?
         ORDER BY fetched_at DESC, id DESC
         LIMIT $limit"
    );
    $stmt->execute([$symbol]);
    $rows = $stmt->fetchAll();

    jsonSuccess(['symbol' => $symbol, 'runs' => $rows, 'count' => count($rows)]);
} catch (Throwable $e) {
    jsonError('Database error', 500);
}
