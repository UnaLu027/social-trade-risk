<?php
/**
 * Example local config — copy to config.local.php and fill in real values.
 * config.local.php is git-ignored; NEVER commit real credentials.
 *
 * InfinityFree MySQL example:
 *   define('DB_TYPE',     'mysql');
 *   define('DB_HOST',     'sqlXXX.epizy.com');
 *   define('DB_PORT',     '3306');
 *   define('DB_NAME',     'epiz_XXXXXX_dbname');
 *   define('DB_USER',     'epiz_XXXXXX');
 *   define('DB_PASSWORD', 'YourPassword');
 *   define('INGEST_SECRET', 'replace-with-a-long-random-string-min-32-chars');
 *
 * Local SQL Server Express example:
 *   Server:   UNA-ASUS-NB1\SQLEXPRESS   (or 127.0.0.1\SQLEXPRESS)
 *   Database: SocialTradingRisk
 */

define('DB_SERVER',   'UNA-ASUS-NB1\\SQLEXPRESS');  // e.g. 127.0.0.1\SQLEXPRESS
define('DB_PORT',     '1433');
define('DB_NAME',     'SocialTradingRisk');
define('DB_USER',     'your_sql_user');
define('DB_PASSWORD', 'YourStrongPassword123!');

// Required for the secure ingestion endpoint (ingest_monitoring_batch.php)
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
define('INGEST_SECRET', 'replace-with-a-long-random-string-min-32-chars');
