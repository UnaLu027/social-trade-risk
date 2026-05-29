<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

/**
 * report_exports.php
 * GET  ?symbol=TSLA&limit=20  — recent export log
 * POST { symbol, export_type, signal_level, combined_score, exported_at }
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
        $sql  = "SELECT id, symbol, export_type, signal_level,
                        combined_score, exported_at, created_at
                 FROM report_export_logs
                 WHERE symbol = ?
                 ORDER BY exported_at DESC, id DESC
                 LIMIT $limit";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$symbol]);
        $rows = $stmt->fetchAll();

        jsonSuccess(['symbol' => $symbol, 'exports' => $rows, 'count' => count($rows)]);
    } catch (Throwable $e) {
        jsonError('Database error', 500);
    }
}

// ── POST ─────────────────────────────────────────────────────────────────────

if ($method === 'POST') {
    $body   = getJsonBody();
    $symbol = isset($body['symbol']) ? validateSymbol((string)$body['symbol']) : '';
    if ($symbol === '') jsonError('symbol is required', 400);

    $export_type = isset($body['export_type']) ? substr(trim((string)$body['export_type']), 0, 20) : '';
    if (!in_array($export_type, ['word', 'pdf', 'html'], true)) {
        jsonError('export_type must be word, pdf, or html', 400);
    }

    $signal_level  = isset($body['signal_level']) ? substr(trim((string)$body['signal_level']), 0, 30) : null;
    $combined_score = isset($body['combined_score']) && is_numeric($body['combined_score'])
        ? round((float)$body['combined_score'], 2) : null;

    $exported_at = date('Y-m-d H:i:s');
    if (!empty($body['exported_at'])) {
        try {
            $dt          = new DateTime($body['exported_at']);
            $exported_at = $dt->format('Y-m-d H:i:s');
        } catch (Exception $ex) { /* use current time */ }
    }

    try {
        $pdo = getDbPdo();
        $ins = $pdo->prepare(
            'INSERT INTO report_export_logs (symbol, export_type, signal_level, combined_score, exported_at)
             VALUES (?, ?, ?, ?, ?)'
        );
        $ins->execute([$symbol, $export_type, $signal_level, $combined_score, $exported_at]);

        jsonSuccess(['saved' => true]);
    } catch (Throwable $e) {
        jsonError('Database error', 500);
    }
}

jsonError('Method not allowed', 405);
