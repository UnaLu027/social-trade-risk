<?php
/**
 * POST /save_simulation.php
 * Body: {
 *   fanatic_ratio, influencer_power, short_interest, mention_growth,
 *   volume_spike, trading_restriction (bool), rational_investor_ratio,
 *   simulated_risk_score, simulated_risk_label, explanation
 * }
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError('Method not allowed', 405);

$body = getJsonBody();

try {
    $pdo  = getDbPdo();
    $stmt = $pdo->prepare(
        "INSERT INTO simulation_runs
         (fanatic_ratio, influencer_power, short_interest, mention_growth,
          volume_spike, trading_restriction, rational_investor_ratio,
          simulated_risk_score, simulated_risk_label, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([
        $body['fanatic_ratio']           ?? 0.0,
        $body['influencer_power']         ?? 0.0,
        $body['short_interest']           ?? 0.0,
        $body['mention_growth']           ?? 0.0,
        $body['volume_spike']             ?? 0.0,
        !empty($body['trading_restriction']) ? 1 : 0,
        $body['rational_investor_ratio']  ?? 0.0,
        $body['simulated_risk_score']     ?? 0.0,
        sanitize($body['simulated_risk_label'] ?? 'Unknown'),
        sanitize($body['explanation']          ?? ''),
    ]);
    jsonSuccess(['id' => (int) $pdo->lastInsertId()], 201);

} catch (Throwable $e) {
    jsonError('Database error: ' . $e->getMessage());
}
