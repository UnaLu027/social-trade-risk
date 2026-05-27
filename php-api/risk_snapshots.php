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
                rs.id,
                rs.symbol,
                w.name,
                w.market,
                rs.snapshot_date,
                rs.price,
                rs.volume,
                rs.mention_count,
                rs.bullish_ratio,
                rs.avg_sentiment,
                rs.social_hype_score,
                rs.manipulation_signal_score,
                rs.fomo_score,
                rs.short_squeeze_pressure,
                rs.ai_risk_label,
                rs.data_quality,
                rs.created_at
            FROM risk_snapshots rs
            LEFT JOIN watchlist w ON w.symbol = rs.symbol
            WHERE rs.symbol = ?
            ORDER BY rs.snapshot_date ASC, rs.id ASC
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([$symbol]);
        $snapshots = $stmt->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse([
            'success' => true,
            'data' => [
                'count' => count($snapshots),
                'symbol' => $symbol,
                'snapshots' => $snapshots
            ]
        ]);
    }

    $sql = "
        WITH ranked AS (
            SELECT
                rs.*,
                ROW_NUMBER() OVER (
                    PARTITION BY rs.symbol
                    ORDER BY rs.snapshot_date DESC, rs.id DESC
                ) AS rn
            FROM risk_snapshots rs
        )
        SELECT
            r.symbol,
            w.name,
            w.market,
            r.snapshot_date,
            r.price,
            r.volume,
            r.mention_count,
            r.bullish_ratio,
            r.avg_sentiment,
            r.social_hype_score,
            r.manipulation_signal_score,
            r.fomo_score,
            r.short_squeeze_pressure,
            r.ai_risk_label,
            r.data_quality
        FROM ranked r
        LEFT JOIN watchlist w ON w.symbol = r.symbol
        WHERE r.rn = 1
        ORDER BY
            CASE r.ai_risk_label
                WHEN 'Critical' THEN 4
                WHEN 'High' THEN 3
                WHEN 'Medium' THEN 2
                WHEN 'Low' THEN 1
                ELSE 0
            END DESC,
            r.social_hype_score DESC
    ";

    $stmt = $pdo->query($sql);
    $snapshots = $stmt->fetchAll(PDO::FETCH_ASSOC);

    jsonResponse([
        'success' => true,
        'data' => [
            'count' => count($snapshots),
            'snapshots' => $snapshots
        ]
    ]);

} catch (Throwable $e) {
    jsonResponse([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ], 500);
}