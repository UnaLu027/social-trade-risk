<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

/**
 * caution_summaries.php
 * GET  ?symbol=TSLA&limit=30  — recent summaries newest-first
 * POST { symbol, signal_level, combined_score, ... } — save one summary
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

    $limit = max(1, min(100, (int)($_GET['limit'] ?? 30)));

    try {
        $pdo = getDbPdo();
        $sql = "SELECT TOP $limit id, symbol, signal_level, combined_score,
                        external_news_score, latest_snapshot_score, market_history_score,
                        data_coverage, interpretation_status, coverage_note,
                        source_count, generated_at, created_at
                 FROM caution_summary_records
                 WHERE symbol = ?
                 ORDER BY created_at DESC, id DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$symbol]);
        $rows = $stmt->fetchAll();

        jsonSuccess(['symbol' => $symbol, 'summaries' => $rows, 'count' => count($rows)]);
    } catch (Throwable $e) {
        jsonError('Database error', 500);
    }
}

// ── POST ─────────────────────────────────────────────────────────────────────

if ($method === 'POST') {
    $body   = getJsonBody();
    $symbol = isset($body['symbol']) ? validateSymbol((string)$body['symbol']) : '';
    if ($symbol === '') jsonError('symbol is required', 400);

    $signal_level = isset($body['signal_level']) ? substr(trim((string)$body['signal_level']), 0, 30) : '';
    if ($signal_level === '') jsonError('signal_level is required', 400);

    $combined_score = isset($body['combined_score']) && is_numeric($body['combined_score'])
        ? round((float)$body['combined_score'], 2) : 0.0;

    $external_news_score   = isset($body['external_news_score']) && is_numeric($body['external_news_score'])
        ? round((float)$body['external_news_score'], 2) : null;
    $latest_snapshot_score = isset($body['latest_snapshot_score']) && is_numeric($body['latest_snapshot_score'])
        ? round((float)$body['latest_snapshot_score'], 2) : null;
    $market_history_score  = isset($body['market_history_score']) && is_numeric($body['market_history_score'])
        ? round((float)$body['market_history_score'], 2) : null;

    $data_coverage         = isset($body['data_coverage']) ? substr(trim((string)$body['data_coverage']), 0, 20) : 'NONE';
    $interpretation_status = isset($body['interpretation_status']) ? substr(trim((string)$body['interpretation_status']), 0, 30) : 'insufficient_data';
    $coverage_note         = isset($body['coverage_note']) ? (string)$body['coverage_note'] : null;
    $source_count          = isset($body['source_count']) && is_int($body['source_count']) ? (int)$body['source_count'] : 0;
    $generated_at          = isset($body['generated_at']) ? substr(trim((string)$body['generated_at']), 0, 50) : '';
    if ($generated_at === '') $generated_at = date('c');

    try {
        $pdo = getDbPdo();

        // Soft dedup: skip if same symbol + generated_at already exists
        $chk = $pdo->prepare('SELECT 1 FROM caution_summary_records WHERE symbol = ? AND generated_at = ?');
        $chk->execute([$symbol, $generated_at]);
        if ($chk->fetch()) {
            jsonSuccess(['saved' => false, 'reason' => 'duplicate_generated_at']);
        }

        $ins = $pdo->prepare(
            'INSERT INTO caution_summary_records
             (symbol, signal_level, combined_score, external_news_score, latest_snapshot_score,
              market_history_score, data_coverage, interpretation_status, coverage_note,
              source_count, generated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $symbol, $signal_level, $combined_score,
            $external_news_score, $latest_snapshot_score, $market_history_score,
            $data_coverage, $interpretation_status, $coverage_note,
            $source_count, $generated_at,
        ]);

        jsonSuccess(['saved' => true]);
    } catch (Throwable $e) {
        jsonError('Database error', 500);
    }
}

jsonError('Method not allowed', 405);
