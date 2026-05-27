<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

$result = [
    'status'              => 'ok',
    'database'            => DB_NAME,
    'connected'           => false,
    'php_sqlsrv_loaded'   => extension_loaded('sqlsrv'),
    'php_pdo_sqlsrv_loaded' => extension_loaded('pdo_sqlsrv'),
    'timestamp'           => date('c'),
];

try {
    $pdo = getDbPdo();
    $stmt = $pdo->query("SELECT COUNT(*) AS cnt FROM watchlist WHERE is_active = 1");
    $row = $stmt->fetch();
    $result['connected']      = true;
    $result['watchlist_count'] = (int) $row['cnt'];
} catch (Throwable $e) {
    $result['connected'] = false;
    $result['error']     = $e->getMessage();
}

jsonSuccess($result);
