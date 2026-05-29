<?php
/**
 * Dual-mode DB connection: MySQL (InfinityFree production) or SQL Server (local dev).
 *
 * Set DB_TYPE='mysql' in config.local.php to use MySQL.
 * InfinityFree config.local.php example:
 *   define('DB_TYPE',     'mysql');
 *   define('DB_HOST',     'sqlXXX.epizy.com');   // from InfinityFree dashboard
 *   define('DB_PORT',     '3306');
 *   define('DB_NAME',     'epiz_XXXXXX_dbname');
 *   define('DB_USER',     'epiz_XXXXXX');
 *   define('DB_PASSWORD', 'YourPassword');
 *
 * Local SQL Server Express config.local.php example:
 *   define('DB_TYPE',     'sqlserver');
 *   define('DB_SERVER',   'UNA-ASUS-NB1\\SQLEXPRESS');
 *   define('DB_PORT',     '1433');
 *   define('DB_NAME',     'SocialTradingRisk');
 *   define('DB_USER',     'your_sql_user');
 *   define('DB_PASSWORD', 'YourPassword');
 *
 * Never commit real credentials.
 */

$localConfig = __DIR__ . '/config.local.php';
if (file_exists($localConfig)) {
    require_once $localConfig;
} else {
    // Fall back to environment variables (Railway / Docker / hosting env vars)
    $dbType = getenv('DB_TYPE') ?: 'sqlserver';
    define('DB_TYPE',     $dbType);
    define('DB_HOST',     getenv('DB_HOST')     ?: 'localhost');
    define('DB_SERVER',   getenv('DB_SERVER')   ?: 'localhost');
    define('DB_PORT',     getenv('DB_PORT')      ?: ($dbType === 'mysql' ? '3306' : '1433'));
    define('DB_NAME',     getenv('DB_NAME')      ?: 'SocialTradingRisk');
    define('DB_USER',     getenv('DB_USER')      ?: '');
    define('DB_PASSWORD', getenv('DB_PASSWORD')  ?: '');
}

/**
 * Returns a PDO connection.
 * Detects MySQL vs SQL Server based on DB_TYPE constant.
 * Throws PDOException on failure.
 */
function getDbPdo(): PDO {
    $type = defined('DB_TYPE') ? strtolower(DB_TYPE) : 'sqlserver';

    if ($type === 'mysql') {
        $host = defined('DB_HOST') ? DB_HOST : (defined('DB_SERVER') ? DB_SERVER : 'localhost');
        $port = defined('DB_PORT') ? DB_PORT : '3306';
        $name = defined('DB_NAME') ? DB_NAME : '';
        $dsn  = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
        return new PDO($dsn, DB_USER, DB_PASSWORD, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
        ]);
    }

    // Default: SQL Server (local dev)
    $server = defined('DB_SERVER') ? DB_SERVER : 'localhost';
    $port   = defined('DB_PORT')   ? DB_PORT   : '1433';
    $name   = defined('DB_NAME')   ? DB_NAME   : 'SocialTradingRisk';
    $dsn    = "sqlsrv:Server={$server},{$port};Database={$name};TrustServerCertificate=1";
    return new PDO($dsn, DB_USER, DB_PASSWORD, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::SQLSRV_ATTR_ENCODING    => PDO::SQLSRV_ENCODING_UTF8,
    ]);
}

/**
 * Returns a sqlsrv resource connection (SQL Server only, local dev).
 * Returns false on failure.
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
