<?php
/**
 * GET  /alerts.php              → all unread alerts (newest first, max 50)
 * GET  /alerts.php?symbol=GME   → alerts for one symbol
 * POST /alerts.php              → mark alert as read { id }
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = getDbPdo();

    if ($method === 'GET') {
        $symbol = isset($_GET['symbol']) ? strtoupper(sanitize($_GET['symbol'])) : null;

        if ($symbol) {
            assertUsSymbol($symbol);
            $stmt = $pdo->prepare(
                "SELECT TOP 50 id, symbol, severity, title, message, trigger_reason, is_read, created_at
                 FROM alerts WHERE symbol = ? ORDER BY created_at DESC"
            );
            $stmt->execute([$symbol]);
        } else {
            $stmt = $pdo->query(
                "SELECT TOP 50 id, symbol, severity, title, message, trigger_reason, is_read, created_at
                 FROM alerts ORDER BY created_at DESC"
            );
        }
        jsonSuccess($stmt->fetchAll());

    } elseif ($method === 'POST') {
        $body = getJsonBody();
        $id   = (int) ($body['id'] ?? 0);
        if (!$id) jsonError('id is required', 400);
        $pdo->prepare("UPDATE alerts SET is_read=1 WHERE id=?")->execute([$id]);
        jsonSuccess(['id' => $id, 'action' => 'marked_read']);

    } else {
        jsonError('Method not allowed', 405);
    }

} catch (Throwable $e) {
    jsonError('Database error: ' . $e->getMessage());
}
