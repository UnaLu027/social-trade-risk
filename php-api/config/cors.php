<?php
/**
 * CORS headers — call at the very top of every endpoint file.
 * Adjust ALLOWED_ORIGINS for production.
 */

$allowedOrigins = [
    'http://localhost:5173',   // Vite dev server
    'http://localhost:3000',
    'http://localhost',
    'https://unalu027.github.io', // GitHub Pages
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    // Allow all during local dev; tighten for production
    header('Access-Control-Allow-Origin: *');
}

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Max-Age: 86400');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=UTF-8');
