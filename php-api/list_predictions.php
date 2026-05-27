<?php
/**
 * GET /list_predictions.php              → latest 20 predictions
 * GET /list_predictions.php?symbol=GME   → predictions for symbol
 * GET /list_predictions.php?limit=50
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonError('Method not allowed', 405);

try {
    $pdo    = getDbPdo();
    $symbol = isset($_GET['symbol']) ? strtoupper(sanitize($_GET['symbol'])) : null;
    $limit  = min((int) ($_GET['limit'] ?? 20), 100);

    if ($symbol) {
        assertUsSymbol($symbol);
        $stmt = $pdo->prepare(
            "SELECT TOP 50 id, input_text, symbol_detected, sentiment_score, bullish_probability,
                    bearish_probability, fomo_score, hype_language_score, manipulation_signal_score,
                    urgency_score, short_squeeze_narrative, predicted_risk_label, explanation,
                    model_version, created_at
             FROM post_predictions
             WHERE symbol_detected = ?
             ORDER BY created_at DESC"
        );
        $stmt->execute([$limit, $symbol]);
    } else {
        $stmt = $pdo->prepare(
            "SELECT TOP 50 id, input_text, symbol_detected, sentiment_score, bullish_probability,
                    bearish_probability, fomo_score, hype_language_score, manipulation_signal_score,
                    urgency_score, short_squeeze_narrative, predicted_risk_label, explanation,
                    model_version, created_at
             FROM post_predictions
             ORDER BY created_at DESC"
        );
        $stmt->execute([$limit]);
    }

    $rows = $stmt->fetchAll();
    // Cast BIT field to bool
    foreach ($rows as &$r) {
        $r['short_squeeze_narrative'] = (bool) $r['short_squeeze_narrative'];
    }
    jsonSuccess(['count' => count($rows), 'predictions' => $rows]);

} catch (Throwable $e) {
    jsonError('Database error: ' . $e->getMessage());
}
