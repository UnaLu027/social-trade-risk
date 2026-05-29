-- ============================================================
-- Social Trading Risk Copilot — SQL Server Schema
-- Database: SocialTradingRisk (US meme-stock risk only)
-- Run in SSMS after: CREATE DATABASE SocialTradingRisk; USE SocialTradingRisk;
-- ============================================================

-- ============================================================
-- 1. watchlist
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'watchlist')
BEGIN
    CREATE TABLE watchlist (
        id         INT IDENTITY(1,1) PRIMARY KEY,
        symbol     NVARCHAR(20)  NOT NULL UNIQUE,
        name       NVARCHAR(120),
        market     NVARCHAR(20)  DEFAULT 'US',   -- US only in MVP
        is_active  BIT           DEFAULT 1,
        created_at DATETIME2     DEFAULT SYSDATETIME()
    );
END
GO

-- ============================================================
-- 2. social_posts
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'social_posts')
BEGIN
    CREATE TABLE social_posts (
        id                   INT IDENTITY(1,1) PRIMARY KEY,
        symbol               NVARCHAR(20),
        source               NVARCHAR(50),       -- 'Reddit' / 'Twitter' / 'StockTwits'
        content              NVARCHAR(MAX) NOT NULL,
        created_at           DATETIME2     DEFAULT SYSDATETIME(),
        sentiment_label      NVARCHAR(20),       -- 'bullish' / 'bearish' / 'neutral'
        hype_label           NVARCHAR(20),       -- 'high' / 'medium' / 'low'
        manipulation_label   NVARCHAR(20),       -- 'high' / 'medium' / 'low'
        risk_label           NVARCHAR(20),       -- 'Critical' / 'High' / 'Medium' / 'Low'
        weak_label_source    NVARCHAR(100)       -- 'demo_rule' / 'keyword_heuristic' / 'finbert' / 'manual'
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_social_posts_symbol_created')
    CREATE INDEX IX_social_posts_symbol_created ON social_posts (symbol, created_at DESC);
GO

-- ============================================================
-- 3. post_predictions
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'post_predictions')
BEGIN
    CREATE TABLE post_predictions (
        id                          INT IDENTITY(1,1) PRIMARY KEY,
        input_text                  NVARCHAR(MAX) NOT NULL,
        symbol_detected             NVARCHAR(20),
        sentiment_score             FLOAT,
        bullish_probability         FLOAT,
        bearish_probability         FLOAT,
        fomo_score                  FLOAT,
        hype_language_score         FLOAT,
        manipulation_signal_score   FLOAT,
        urgency_score               FLOAT,
        short_squeeze_narrative     BIT,
        predicted_risk_label        NVARCHAR(20),
        explanation                 NVARCHAR(MAX),
        model_version               NVARCHAR(100),
        created_at                  DATETIME2     DEFAULT SYSDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_post_predictions_created')
    CREATE INDEX IX_post_predictions_created ON post_predictions (created_at DESC);
GO

-- ============================================================
-- 4. risk_snapshots
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'risk_snapshots')
BEGIN
    CREATE TABLE risk_snapshots (
        id                          INT IDENTITY(1,1) PRIMARY KEY,
        symbol                      NVARCHAR(20)  NOT NULL,
        snapshot_date               DATE          NOT NULL,
        price                       FLOAT,
        volume                      BIGINT,
        mention_count               INT,
        bullish_ratio               FLOAT,
        avg_sentiment               FLOAT,
        social_hype_score           FLOAT,
        manipulation_signal_score   FLOAT,
        fomo_score                  FLOAT,
        short_squeeze_pressure      FLOAT,
        ai_risk_label               NVARCHAR(20),   -- 'Critical' / 'High' / 'Medium' / 'Low'
        data_quality                NVARCHAR(20),   -- 'demo' / 'good' / 'partial' / 'insufficient'
        created_at                  DATETIME2       DEFAULT SYSDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_risk_snapshots_symbol_date')
    CREATE INDEX IX_risk_snapshots_symbol_date ON risk_snapshots (symbol, snapshot_date DESC);
GO

-- ============================================================
-- 5. alerts
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'alerts')
BEGIN
    CREATE TABLE alerts (
        id              INT IDENTITY(1,1) PRIMARY KEY,
        symbol          NVARCHAR(20),
        severity        NVARCHAR(20),       -- 'Critical' / 'High' / 'Medium' / 'Low'
        title           NVARCHAR(200),
        message         NVARCHAR(MAX),
        trigger_reason  NVARCHAR(MAX),
        is_read         BIT           DEFAULT 0,
        created_at      DATETIME2     DEFAULT SYSDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_alerts_symbol_created')
    CREATE INDEX IX_alerts_symbol_created ON alerts (symbol, created_at DESC);
GO

-- ============================================================
-- 6. events
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'events')
BEGIN
    CREATE TABLE events (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        symbol      NVARCHAR(20),
        event_date  DATE,
        event_type  NVARCHAR(50),    -- 'social_surge' / 'price_spike' / 'influencer_signal' / 'restriction' / 'short_squeeze' / 'correction'
        title       NVARCHAR(200),
        description NVARCHAR(MAX),
        risk_impact NVARCHAR(20),    -- 'Critical' / 'High' / 'Medium' / 'Low'
        created_at  DATETIME2        DEFAULT SYSDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_events_symbol_date')
    CREATE INDEX IX_events_symbol_date ON events (symbol, event_date DESC);
GO

-- ============================================================
-- 7. simulation_runs
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'simulation_runs')
BEGIN
    CREATE TABLE simulation_runs (
        id                       INT IDENTITY(1,1) PRIMARY KEY,
        fanatic_ratio            FLOAT,
        influencer_power         FLOAT,
        short_interest           FLOAT,
        mention_growth           FLOAT,
        volume_spike             FLOAT,
        trading_restriction      BIT,
        rational_investor_ratio  FLOAT,
        simulated_risk_score     FLOAT,
        simulated_risk_label     NVARCHAR(20),
        explanation              NVARCHAR(MAX),
        created_at               DATETIME2     DEFAULT SYSDATETIME()
    );
END
GO

-- ============================================================
-- 8. model_experiments
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'model_experiments')
BEGIN
    CREATE TABLE model_experiments (
        id                       INT IDENTITY(1,1) PRIMARY KEY,
        experiment_id            NVARCHAR(100),
        model_name               NVARCHAR(100),
        feature_set              NVARCHAR(100),
        accuracy                 FLOAT,
        macro_f1                 FLOAT,
        weighted_f1              FLOAT,
        high_risk_recall         FLOAT,
        confusion_matrix_json    NVARCHAR(MAX),
        feature_importance_json  NVARCHAR(MAX),
        model_path               NVARCHAR(255),
        trained_at               DATETIME2,
        created_at               DATETIME2     DEFAULT SYSDATETIME()
    );
END
GO

-- ============================================================
-- 9. external_signal_records  (Finnhub news text signals)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'external_signal_records')
BEGIN
    CREATE TABLE external_signal_records (
        id            INT IDENTITY(1,1) PRIMARY KEY,
        symbol        NVARCHAR(20)   NOT NULL,
        source        NVARCHAR(30)   NOT NULL DEFAULT 'finnhub',
        external_id   NVARCHAR(255)  NULL,       -- Finnhub article id
        url           NVARCHAR(1000) NULL,
        headline      NVARCHAR(1000) NOT NULL,
        summary       NVARCHAR(MAX)  NULL,
        published_at  DATETIME2      NULL,
        ai_risk_label NVARCHAR(30)   NULL,
        ai_risk_score DECIMAL(6,2)   NULL,
        fetched_at    DATETIME2      NOT NULL,
        created_at    DATETIME2      DEFAULT SYSDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_ext_signal_symbol_extid')
    CREATE UNIQUE INDEX UQ_ext_signal_symbol_extid
        ON external_signal_records (symbol, external_id)
        WHERE external_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ext_signal_symbol')
    CREATE INDEX IX_ext_signal_symbol ON external_signal_records (symbol, published_at DESC, id DESC);
GO

-- ============================================================
-- 10. caution_summary_records  (computed caution summaries)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'caution_summary_records')
BEGIN
    CREATE TABLE caution_summary_records (
        id                     INT IDENTITY(1,1) PRIMARY KEY,
        symbol                 NVARCHAR(20)  NOT NULL,
        signal_level           NVARCHAR(30)  NOT NULL,
        combined_score         DECIMAL(6,2)  NOT NULL,
        external_news_score    DECIMAL(6,2)  NULL,
        latest_snapshot_score  DECIMAL(6,2)  NULL,
        market_history_score   DECIMAL(6,2)  NULL,
        data_coverage          NVARCHAR(20)  NOT NULL,
        interpretation_status  NVARCHAR(30)  NOT NULL,
        coverage_note          NVARCHAR(MAX) NULL,
        source_count           INT           NOT NULL DEFAULT 0,
        generated_at           NVARCHAR(50)  NOT NULL,  -- ISO-8601 string for exact dedup
        created_at             DATETIME2     DEFAULT SYSDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_caution_summary_symbol')
    CREATE INDEX IX_caution_summary_symbol ON caution_summary_records (symbol, created_at DESC);
GO

-- ============================================================
-- 11. report_export_logs  (user export actions)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'report_export_logs')
BEGIN
    CREATE TABLE report_export_logs (
        id             INT IDENTITY(1,1) PRIMARY KEY,
        symbol         NVARCHAR(20)  NOT NULL,
        export_type    NVARCHAR(20)  NOT NULL,   -- 'word' | 'pdf' | 'html'
        signal_level   NVARCHAR(30)  NULL,
        combined_score DECIMAL(6,2)  NULL,
        exported_at    DATETIME2     NOT NULL,
        created_at     DATETIME2     DEFAULT SYSDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_report_export_symbol')
    CREATE INDEX IX_report_export_symbol ON report_export_logs (symbol, exported_at DESC);
GO
