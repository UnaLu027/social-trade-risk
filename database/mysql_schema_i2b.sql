-- ============================================================
-- Social Trading Risk Copilot — Phase I2-B MySQL Schema
-- For InfinityFree / MySQL production deployment
-- Run in phpMyAdmin or MySQL CLI after selecting your database
-- ============================================================

-- 9. external_signal_records  (Finnhub news text signals)
CREATE TABLE IF NOT EXISTS external_signal_records (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    symbol        VARCHAR(20)    NOT NULL,
    source        VARCHAR(30)    NOT NULL DEFAULT 'finnhub',
    external_id   VARCHAR(255)   NULL,
    url           VARCHAR(1000)  NULL,
    headline      VARCHAR(1000)  NOT NULL,
    summary       TEXT           NULL,
    published_at  DATETIME       NULL,
    ai_risk_label VARCHAR(30)    NULL,
    ai_risk_score DECIMAL(6,2)   NULL,
    fetched_at    DATETIME       NOT NULL,
    created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    INDEX IX_ext_signal_symbol (symbol, published_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unique index for dedup by (symbol, external_id) — application also checks before insert
ALTER TABLE external_signal_records
    ADD CONSTRAINT UQ_ext_signal_symbol_extid UNIQUE (symbol, external_id);

-- 10. caution_summary_records  (computed caution summaries)
CREATE TABLE IF NOT EXISTS caution_summary_records (
    id                     INT AUTO_INCREMENT PRIMARY KEY,
    symbol                 VARCHAR(20)   NOT NULL,
    signal_level           VARCHAR(30)   NOT NULL,
    combined_score         DECIMAL(6,2)  NOT NULL,
    external_news_score    DECIMAL(6,2)  NULL,
    latest_snapshot_score  DECIMAL(6,2)  NULL,
    market_history_score   DECIMAL(6,2)  NULL,
    data_coverage          VARCHAR(20)   NOT NULL,
    interpretation_status  VARCHAR(30)   NOT NULL,
    coverage_note          TEXT          NULL,
    source_count           INT           NOT NULL DEFAULT 0,
    generated_at           VARCHAR(50)   NOT NULL,
    created_at             TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    INDEX IX_caution_summary_symbol (symbol, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. report_export_logs  (user export actions)
CREATE TABLE IF NOT EXISTS report_export_logs (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    symbol         VARCHAR(20)   NOT NULL,
    export_type    VARCHAR(20)   NOT NULL,
    signal_level   VARCHAR(30)   NULL,
    combined_score DECIMAL(6,2)  NULL,
    exported_at    DATETIME      NOT NULL,
    created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    INDEX IX_report_export_symbol (symbol, exported_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
