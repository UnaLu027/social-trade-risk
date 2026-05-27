<?php
/**
 * SQL Server connection via sqlsrv / PDO_SQLSRV
 * Copy config.example.php → config.local.php and fill in credentials.
 * Never commit real credentials.
 */

$localConfig = __DIR__ . '/config.local.php';
if (file_exists($localConfig)) {
    require_once $localConfig;
} else {
    // Fall back to environment variables (Railway / Docker)
    define('DB_SERVER',   getenv('DB_SERVER')   ?: 'localhost');
    define('DB_PORT',     getenv('DB_PORT')      ?: '1433');
    define('DB_NAME',     getenv('DB_NAME')      ?: 'SocialTradingRisk');
    define('DB_USER',     getenv('DB_USER')      ?: '');
    define('DB_PASSWORD', getenv('DB_PASSWORD')  ?: '');
}

/**
 * Returns a PDO connection to SQL Server.
 * Throws PDOException on failure.
 */
function getDbPdo(): PDO {
    $dsn = 'sqlsrv:Server=' . DB_SERVER . ',' . DB_PORT . ';Database=' . DB_NAME . ';TrustServerCertificate=1';
    $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::SQLSRV_ATTR_ENCODING    => PDO::SQLSRV_ENCODING_UTF8,
    ]);
    return $pdo;
}

/**
 * Returns a sqlsrv resource connection.
 * Returns false on failure (check sqlsrv_errors()).
 */
function getDbSqlsrv() {
    $connectionInfo = [
        'Database'               => DB_NAME,
        'UID'                    => DB_USER,
        'PWD'                    => DB_PASSWORD,
        'CharacterSet'           => 'UTF-8',
        'TrustServerCertificate' => true,
    ];
    return sqlsrv_connect(DB_SERVER . ',' . DB_PORT, $connectionInfo);
}
