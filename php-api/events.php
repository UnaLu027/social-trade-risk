<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';

function jsonResponse($payload, int $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function normalizeSymbol($symbol) {
    $symbol = strtoupper(trim((string)$symbol));

    if ($symbol === '') {
        return '';
    }

    if (str_contains($symbol, '.TW')) {
        jsonResponse([
            'success' => false,
            'error' => 'Only US stocks are supported in this MVP.'
        ], 400);
    }

    return preg_replace('/[^A-Z0-9.\-]/', '', $symbol);
}

try {
    $pdo = getDbPdo();

    $symbol = isset($_GET['symbol']) ? normalizeSymbol($_GET['symbol']) : '';

    if ($symbol !== '') {
        $sql = "
            SELECT
                id,
                symbol,
                event_date,
                event_type,
                title,
                description,
                risk_impact,
                created_at
            FROM events
            WHERE symbol = ?
            ORDER BY event_date ASC, id ASC
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$symbol]);
        $events = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $sql = "
            SELECT
                id,
                symbol,
                event_date,
                event_type,
                title,
                description,
                risk_impact,
                created_at
            FROM events
            ORDER BY event_date DESC, id DESC
        ";

        $stmt = $pdo->query($sql);
        $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 用 PHP 限制筆數，避免 SQL Server TOP / FETCH 參數化問題
        $events = array_slice($events, 0, 100);
    }

    jsonResponse([
        'success' => true,
        'data' => [
            'count' => count($events),
            'events' => $events
        ]
    ]);

} catch (Throwable $e) {
    jsonResponse([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ], 500);
}