<?php
/**
 * POST /save_prediction.php
 * Body: {
 *   input_text, symbol_detected?, sentiment_score, bullish_probability, bearish_probability,
 *   fomo_score, hype_language_score, manipulation_signal_score, urgency_score,
 *   short_squeeze_narrative (bool), predicted_risk_label, explanation, model_version
 * }
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('Method not allowed', 405);

$body = getJsonBody();

$inputText = sanitize($body['input_text'] ?? '');
if (!$inputText) jsonError('input_text is required', 400);

$symbol = isset($body['symbol_detected']) ? strtoupper(sanitize($body['symbol_detected'])) : null;
if ($symbol) assertUsSymbol($symbol);

try {
    $pdo = getDbPdo();
    $stmt = $pdo->prepare(
        "INSERT INTO post_predictions
         (input_text, symbol_detected, sentiment_score, bullish_probability, bearish_probability,
          fomo_score, hype_language_score, manipulation_signal_score, urgency_score,
          short_squeeze_narrative, predicted_risk_label, explanation, model_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        $inputText,
        $symbol,
        $body['sentiment_score']          ?? null,
        $body['bullish_probability']       ?? null,
        $body['bearish_probability']       ?? null,
        $body['fomo_score']               ?? null,
        $body['hype_language_score']       ?? null,
        $body['manipulation_signal_score'] ?? null,
        $body['urgency_score']            ?? null,
        !empty($body['short_squeeze_narrative']) ? 1 : 0,
        sanitize($body['predicted_risk_label'] ?? 'Unknown'),
        sanitize($body['explanation']          ?? ''),
        sanitize($body['model_version']        ?? 'v0.1-baseline'),
    ]);
    jsonSuccess(['id' => (int) $pdo->lastInsertId()], 201);

} catch (Throwable $e) {
    jsonError('Database error: ' . $e->getMessage());
}
