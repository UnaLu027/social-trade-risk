<?php
require_once __DIR__ . '/config/cors.php';

/**
 * monitoring-data.php
 *
 * GET-only endpoint that serves the pre-generated monitoring-latest.json file
 * with the standard { success, data } envelope and CORS headers.
 *
 * The JSON file is uploaded by GitHub Actions via FTP to:
 *   /htdocs/data/monitoring-latest.json
 *
 * Returns { success: true, data: null } when the file does not exist yet
 * (e.g. before the first scheduled run), so the frontend can show a
 * friendly "first run pending" message instead of an error.
 */

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$jsonPath = __DIR__ . '/../data/monitoring-latest.json';

if (!file_exists($jsonPath)) {
    // First run not yet completed — return null data, not an error
    echo json_encode(['success' => true, 'data' => null], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents($jsonPath);
if ($raw === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to read monitoring data'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode($raw, true);
if ($data === null) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Monitoring data is not valid JSON'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
