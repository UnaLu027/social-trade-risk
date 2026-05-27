<?php
/**
 * Shared helper functions for all PHP API endpoints.
 */

/** Emit a JSON success response and exit. */
function jsonSuccess($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Emit a JSON error response and exit. */
function jsonError(string $message, int $code = 500): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Read and decode the raw JSON request body. */
function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/** Validate that $symbol is a supported US ticker (no .TW). */
function assertUsSymbol(string $symbol): void {
    if (stripos($symbol, '.TW') !== false) {
        jsonError('Only US stocks are supported in this MVP.', 400);
    }
}

/** Sanitise a string to prevent basic injection. */
function sanitize(string $value): string {
    return htmlspecialchars(strip_tags(trim($value)), ENT_QUOTES, 'UTF-8');
}
