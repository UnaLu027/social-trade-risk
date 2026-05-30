-- ============================================================
-- Social Trading Risk Copilot — Phase I2-C MySQL Schema
-- Run after mysql_schema_i2b.sql
-- ============================================================

-- 12. monitor_refresh_runs  (scheduled ingestion run log)
CREATE TABLE IF NOT EXISTS monitor_refresh_runs (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    symbol           VARCHAR(20)   NOT NULL,
    refresh_status   VARCHAR(20)   NOT NULL,
    fetched_at       DATETIME      NOT NULL,
    news_item_count  INT           DEFAULT 0,
    error_message    TEXT          NULL,
    created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    INDEX IX_monitor_refresh_symbol (symbol, fetched_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
