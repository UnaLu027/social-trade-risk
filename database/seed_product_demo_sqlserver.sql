-- ============================================================
-- Social Trading Risk Copilot — Demo Seed Data (US stocks only)
-- Run AFTER sqlserver_schema.sql in SSMS.
-- Database: SocialTradingRisk
-- ============================================================

USE SocialTradingRisk;
GO

-- ============================================================
-- 1. watchlist  (US tickers only — no .TW)
-- ============================================================
-- Use MERGE to avoid duplicates on re-run
MERGE watchlist AS target
USING (VALUES
    ('GME',  'GameStop Corp.',                'US'),
    ('AMC',  'AMC Entertainment Holdings',    'US'),
    ('BB',   'BlackBerry Ltd.',               'US'),
    ('KOSS', 'Koss Corporation',              'US'),
    ('NOK',  'Nokia Corporation',             'US'),
    ('TSLA', 'Tesla Inc.',                    'US'),
    ('PLTR', 'Palantir Technologies Inc.',    'US'),
    ('NVDA', 'NVIDIA Corporation',            'US')
) AS src (symbol, name, market)
ON target.symbol = src.symbol
WHEN NOT MATCHED THEN
    INSERT (symbol, name, market) VALUES (src.symbol, src.name, src.market);
GO

-- ============================================================
-- 2. risk_snapshots  (key historical dates)
-- ============================================================
INSERT INTO risk_snapshots
(symbol, snapshot_date, price, volume, mention_count, bullish_ratio, avg_sentiment,
 social_hype_score, manipulation_signal_score, fomo_score, short_squeeze_pressure,
 ai_risk_label, data_quality)
VALUES
-- GME peak squeeze
('GME', '2021-01-22', 65.01,  197000000, 8500,  0.88, 0.72, 92, 86, 91, 95, 'Critical', 'demo'),
('GME', '2021-01-25', 76.79,  177000000, 10500, 0.91, 0.78, 96, 90, 94, 98, 'Critical', 'demo'),
('GME', '2021-01-27', 347.51, 297000000, 18000, 0.95, 0.85, 99, 95, 98, 99, 'Critical', 'demo'),
('GME', '2021-01-28', 193.60, 580000000, 22000, 0.87, 0.65, 98, 97, 97, 97, 'Critical', 'demo'),
('GME', '2021-02-01', 135.00, 88000000,  9000,  0.71, 0.48, 82, 78, 80, 85, 'High',     'demo'),
('GME', '2021-02-05', 63.77,  72000000,  6500,  0.52, 0.31, 64, 55, 58, 60, 'High',     'demo'),
-- AMC
('AMC', '2021-01-27', 19.90,  120000000, 6200,  0.79, 0.61, 78, 66, 73, 82, 'High',     'demo'),
('AMC', '2021-01-28', 9.54,   90000000,  5500,  0.60, 0.35, 68, 60, 63, 70, 'High',     'demo'),
-- BB
('BB',  '2021-01-27', 25.10,  87000000,  4200,  0.74, 0.56, 70, 58, 66, 74, 'High',     'demo'),
-- KOSS
('KOSS','2021-01-27', 58.00,  32000000,  2600,  0.77, 0.60, 76, 62, 71, 80, 'High',     'demo'),
-- NOK
('NOK', '2021-01-27', 6.55,   240000000, 3500,  0.68, 0.43, 60, 44, 55, 52, 'Medium',   'demo'),
-- TSLA
('TSLA','2021-01-27', 864.16, 45000000,  3100,  0.64, 0.42, 52, 31, 44, 26, 'Medium',   'demo'),
-- PLTR
('PLTR','2021-01-27', 39.00,  76000000,  2900,  0.66, 0.40, 55, 36, 48, 34, 'Medium',   'demo'),
-- NVDA
('NVDA','2021-01-27', 133.20, 38000000,  1800,  0.59, 0.31, 42, 24, 31, 18, 'Low',      'demo');
GO

-- ============================================================
-- 3. social_posts
-- ============================================================
INSERT INTO social_posts
(symbol, source, content, sentiment_label, hype_label, manipulation_label, risk_label, weak_label_source)
VALUES
-- GME — Critical / High posts
('GME','Reddit',     'GME to the moon! Shorts are trapped. Buy now before it explodes.',        'bullish','high',  'high',  'Critical','demo_rule'),
('GME','Reddit',     'Diamond hands. Hold the line. This is THE squeeze.',                       'bullish','high',  'medium','High',    'demo_rule'),
('GME','Reddit',     'The short interest is insane. Retail is not leaving. Citadel is scared.',  'bullish','high',  'high',  'Critical','demo_rule'),
('GME','Twitter',    'Every hedge fund short on GME is about to get destroyed. HODL.',           'bullish','high',  'high',  'Critical','demo_rule'),
('GME','StockTwits', 'GME squeeze in progress. If you sell you are the reason they win.',        'bullish','high',  'high',  'Critical','demo_rule'),
('GME','Reddit',     'Short interest above 140%, this is mathematically impossible to sustain.', 'bullish','high',  'medium','High',    'demo_rule'),
('GME','Reddit',     'Loading more GME shares. This is a once in a generation event.',           'bullish','high',  'medium','High',    'demo_rule'),
('GME','Twitter',    'Robinhood just restricted GME buying. This is the final proof shorts own the brokers.', 'bullish','high','high','Critical','demo_rule'),
('GME','Reddit',     'GME fair value is $0 according to hedgies. Reality: it''s a short squeeze play.','bullish','high','medium','High','demo_rule'),
('GME','Reddit',     'Never selling. They have to buy shares back eventually. Math doesn''t lie.','bullish','high','medium','High','demo_rule'),

-- AMC — High posts
('AMC','Reddit',     'AMC has huge retail momentum and could squeeze next.',                     'bullish','medium','medium','High',   'demo_rule'),
('AMC','Reddit',     'AMC to the moon after GME. Retail army never sleeps.',                     'bullish','high',  'medium','High',   'demo_rule'),
('AMC','Twitter',    'Buying AMC calls. Short interest is rising and retail is watching.',        'bullish','medium','medium','High',   'demo_rule'),
('AMC','StockTwits', 'AMC squeeze is inevitable. The same pattern as GME.',                      'bullish','high',  'high',  'High',   'demo_rule'),

-- BB — Medium posts
('BB','Reddit',      'BB is getting meme-stock attention but the thesis is mixed.',               'bullish','medium','low',  'Medium', 'demo_rule'),
('BB','Reddit',      'BlackBerry still has patents. Not a pure squeeze but retail is watching.', 'neutral','medium','low',  'Medium', 'demo_rule'),
('BB','Twitter',     'BB volume spike today. Following GME and AMC pattern?',                    'bullish','medium','medium','Medium', 'demo_rule'),

-- KOSS — High posts
('KOSS','Reddit',    'KOSS volume is exploding and everyone is watching it.',                     'bullish','medium','medium','High',  'demo_rule'),
('KOSS','Reddit',    'KOSS has insane short float, tiny company, huge leverage for squeeze.',     'bullish','high',  'high',  'High',  'demo_rule'),

-- NOK — Medium posts
('NOK','Reddit',     'NOK is being mentioned more but the setup is not as extreme.',              'neutral','medium','low',  'Medium','demo_rule'),
('NOK','Twitter',    'Nokia has real business unlike meme stocks but the hype is real.',          'neutral','low',   'low',  'Medium','demo_rule'),

-- TSLA — Medium/Low posts
('TSLA','Twitter',   'Tesla discussion is bullish but mostly based on earnings expectations.',    'bullish','low',   'low',  'Medium','demo_rule'),
('TSLA','Reddit',    'TSLA holders are retail too but it''s more about product story.',           'bullish','low',   'low',  'Low',   'demo_rule'),

-- PLTR — Medium posts
('PLTR','Reddit',    'PLTR has loyal retail holders but today discussion looks normal.',          'neutral','low',   'low',  'Medium','demo_rule'),
('PLTR','Reddit',    'Palantir retail army is strong but no squeeze narrative today.',            'neutral','medium','low',  'Medium','demo_rule'),

-- NVDA — Low posts
('NVDA','Twitter',   'NVDA is trending due to AI news, not a short squeeze narrative.',          'bullish','low',   'low',  'Low',   'demo_rule'),
('NVDA','Reddit',    'NVIDIA earnings beat. Institutional and retail both love it. No hype risk.','bullish','low',  'low',  'Low',   'demo_rule');
GO

-- ============================================================
-- 4. events  (GME historical timeline + others)
-- ============================================================
INSERT INTO events
(symbol, event_date, event_type, title, description, risk_impact)
VALUES
('GME', '2021-01-13', 'info',              'Ryan Cohen joins board',               'Ryan Cohen joined the GameStop board, increasing retail investor attention and hopes for a turnaround.', 'Medium'),
('GME', '2021-01-19', 'social_surge',      'WallStreetBets post goes viral',       'A detailed post on r/WallStreetBets outlining the GME short squeeze thesis gained hundreds of thousands of upvotes.','High'),
('GME', '2021-01-22', 'social_surge',      'Reddit discussion surge',              'WallStreetBets discussion around GME increased rapidly with mention count spiking.', 'High'),
('GME', '2021-01-25', 'short_squeeze',     'Short squeeze narrative intensifies',  'Short squeeze language and coordinated buy pressure became dominant across Reddit, Twitter, and StockTwits.', 'Critical'),
('GME', '2021-01-26', 'influencer_signal', 'High-profile public mention',          'A high-profile public mention by a prominent figure amplified retail attention to extreme levels.', 'Critical'),
('GME', '2021-01-27', 'price_spike',       'GME price reaches $347',               'GME reached extreme intraday price levels amid retail trading frenzy. Short sellers faced billions in losses.', 'Critical'),
('GME', '2021-01-28', 'restriction',       'Robinhood restricts buying',           'Retail brokerages including Robinhood restricted GME buying, increasing controversy and fueling manipulation narratives.', 'Critical'),
('GME', '2021-01-29', 'restriction',       'Trading restrictions continue',        'Buy limits remained at multiple brokers. Retail community outrage at its peak.', 'Critical'),
('GME', '2021-02-01', 'correction',        'Correction begins',                    'GME price began to correct after extreme volatility as initial squeeze pressure faded.', 'High'),
('GME', '2021-02-05', 'correction',        'Price falls below $65',                'GME declined sharply. Many late retail entrants faced significant losses.', 'High'),

('AMC', '2021-01-27', 'social_surge',      'AMC retail interest surge',            'AMC became a secondary meme-stock target following GME. Reddit discussions surged.', 'High'),
('AMC', '2021-05-24', 'short_squeeze',     'AMC second squeeze attempt',           'AMC experienced a second wave of retail attention and significant price action.', 'High'),

('BB',  '2021-01-27', 'meme_attention',    'BB gains meme-stock attention',        'BlackBerry became part of broader retail trading discussions alongside GME and AMC.', 'Medium'),

('KOSS','2021-01-27', 'volume_spike',      'KOSS abnormal volume spike',           'KOSS experienced abnormal volume and retail attention, fitting the meme-stock pattern.', 'High'),

('TSLA','2021-01-27', 'normal_news',       'Tesla normal market discussion',       'Tesla discussion was mostly related to business performance and earnings expectations, no squeeze signal.', 'Low');
GO

-- ============================================================
-- 5. alerts
-- ============================================================
INSERT INTO alerts
(symbol, severity, title, message, trigger_reason)
VALUES
('GME', 'Critical', 'Critical social trading risk detected',
    'GME shows extreme social hype, FOMO language, and short squeeze pressure. Retail frenzy at maximum.',
    'social_hype_score >= 90, manipulation_signal_score >= 85, short_squeeze_pressure >= 95'),
('GME', 'Critical', 'Trading restriction event detected',
    'Retail broker buy restrictions active for GME. Manipulation signal score at peak.',
    'event_type = restriction, manipulation_signal_score >= 95'),
('AMC', 'High', 'High retail frenzy signal',
    'AMC shows rising social momentum and meme-stock association risk.',
    'social_hype_score >= 70, bullish_ratio >= 0.75'),
('BB',  'Medium', 'Meme-stock attention detected',
    'BB is receiving increased social attention though manipulation signal is moderate.',
    'mention_count surge, hype_label = medium'),
('KOSS','High', 'Abnormal volume and hype detected',
    'KOSS shows abnormal volume spike and rising hype language scores.',
    'volume_spike, social_hype_score >= 70'),
('NOK', 'Medium', 'Elevated mention activity',
    'NOK mention count elevated above baseline. No strong squeeze signal yet.',
    'mention_count above 7-day average'),
('TSLA','Medium', 'Moderate social attention',
    'TSLA discussion is elevated but shows lower manipulation signal than meme stocks.',
    'bullish_ratio moderate, hype_label = low'),
('NVDA','Low', 'AI-news-driven attention',
    'NVDA attention appears news-driven rather than squeeze-driven. Risk level low.',
    'AI earnings news, manipulation_signal_score low, short_squeeze_pressure low');
GO

-- ============================================================
-- 6. model_experiments
-- ============================================================
INSERT INTO model_experiments
(experiment_id, model_name, feature_set, accuracy, macro_f1, weighted_f1, high_risk_recall,
 confusion_matrix_json, feature_importance_json, model_path, trained_at)
VALUES
('exp_baseline_001', 'Logistic Regression', 'market_features',
    0.84, 0.79, 0.83, 0.76,
    '[[80,10,5],[12,70,8],[6,9,85]]',
    '{"mention_growth":0.22,"volume_spike":0.18,"short_interest":0.15,"bullish_ratio":0.12}',
    'models/logistic_baseline.pkl', SYSDATETIME()),

('exp_rf_001', 'Random Forest', 'market_social_features',
    0.90, 0.87, 0.90, 0.88,
    '[[86,7,2],[8,76,6],[3,7,90]]',
    '{"mention_growth":0.25,"fomo_score":0.21,"short_squeeze_pressure":0.19,"volume_spike":0.14}',
    'models/random_forest.pkl', SYSDATETIME()),

('exp_gb_001', 'Gradient Boosting', 'text_social_market_features',
    0.94, 0.93, 0.94, 0.95,
    '[[91,4,0],[5,82,3],[1,4,95]]',
    '{"manipulation_signal_score":0.27,"fomo_score":0.24,"mention_growth":0.18,"social_hype_score":0.15}',
    'models/gradient_boosting.pkl', SYSDATETIME()),

('exp_mlp_001', 'MLP Neural Network', 'neural_fusion_features',
    0.92, 0.90, 0.92, 0.91,
    '[[88,6,1],[6,80,4],[2,6,92]]',
    '{"text_embedding":0.31,"short_interest":0.22,"social_hype_score":0.20,"fomo_score":0.17}',
    'models/mlp_fusion.pkl', SYSDATETIME()),

('exp_tfidf_lr_001', 'TF-IDF + Logistic Regression', 'tfidf_text_features',
    0.81, 0.77, 0.80, 0.74,
    '[[78,12,5],[14,68,8],[7,10,82]]',
    '{"hype_term_count":0.29,"urgency_term_count":0.24,"squeeze_keyword_count":0.20}',
    'models/tfidf_lr.pkl', SYSDATETIME());
GO
