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
