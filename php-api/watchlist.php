<?php
/**
 * GET  /watchlist.php          → list all active US watchlist items
 * POST /watchlist.php          → add a symbol  { symbol, name }
 * DELETE /watchlist.php?id=N   → soft-delete (set is_active=0)
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $pdo = getDbPdo();

    if ($method === 'GET') {
        $stmt = $pdo->query(
            "SELECT id, symbol, name, market, is_active, created_at
             FROM watchlist
             WHERE is_active = 1 AND market = 'US'
             ORDER BY symbol"
        );
        jsonSuccess($stmt->fetchAll());

    } elseif ($method === 'POST') {
        $body   = getJsonBody();
        $symbol = strtoupper(sanitize($body['symbol'] ?? ''));
        $name   = sanitize($body['name'] ?? $symbol);

        if (!$symbol) jsonError('symbol is required', 400);
        assertUsSymbol($symbol);

        // Upsert: reactivate if exists, else insert
        $check = $pdo->prepare("SELECT id FROM watchlist WHERE symbol = ?");
        $check->execute([$symbol]);
        if ($row = $check->fetch()) {
            $pdo->prepare("UPDATE watchlist SET is_active=1, name=? WHERE id=?")
                ->execute([$name, $row['id']]);
            jsonSuccess(['id' => $row['id'], 'symbol' => $symbol, 'action' => 'reactivated']);
        } else {
            $pdo->prepare(
                "INSERT INTO watchlist (symbol, name, market) VALUES (?, ?, 'US')"
            )->execute([$symbol, $name]);
            jsonSuccess(['id' => $pdo->lastInsertId(), 'symbol' => $symbol, 'action' => 'created'], 201);
        }

    } elseif ($method === 'DELETE') {
        $id = (int) ($_GET['id'] ?? 0);
        if (!$id) jsonError('id is required', 400);
        $pdo->prepare("UPDATE watchlist SET is_active=0 WHERE id=?")->execute([$id]);
        jsonSuccess(['id' => $id, 'action' => 'deactivated']);

    } else {
        jsonError('Method not allowed', 405);
    }

} catch (Throwable $e) {
    jsonError('Database error: ' . $e->getMessage());
}
