"""
Unified ticker universe: US stocks + Taiwan Exchange (.TW) stocks.
Used by the trending scanner and market screener.
"""

# ── US Listed Stocks ──────────────────────────────────────────────────────────
US_TICKERS = [
    # Mega cap tech
    "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AVGO", "ORCL",
    # Semiconductors
    "AMD", "INTC", "QCOM", "TXN", "MU", "AMAT", "LRCX", "KLAC", "MRVL", "ON",
    # Taiwan ADRs (also listed on US exchanges)
    "TSM", "UMC", "ASX", "HIMX", "CHT", "SPIL",
    # Finance
    "JPM", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "C", "AXP", "V", "MA", "PYPL",
    # Healthcare
    "LLY", "JNJ", "UNH", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "AMGN",
    # Energy
    "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO",
    # Consumer
    "HD", "NKE", "MCD", "SBUX", "TGT", "WMT", "COST", "LULU", "DIS",
    # Meme / retail favorites
    "GME", "AMC", "PLTR", "MSTR", "HOOD", "COIN", "SOFI", "RIVN", "LCID", "NIO",
    "BB", "NOK", "CLOV", "WKHS",
    # Crypto miners / high vol
    "MARA", "RIOT", "HUT", "CLSK", "BITF",
    # ETFs
    "SPY", "QQQ", "IWM", "ARKK", "ARKG", "SQQQ", "TQQQ", "GLD", "SLV", "USO",
    # Cloud / SaaS
    "NFLX", "SHOP", "SNOW", "CRWD", "ZM", "UBER", "LYFT", "DASH", "RBLX", "SNAP",
    "TWLO", "DDOG", "NET", "MDB", "OKTA", "ZS", "PANW", "FTNT",
    # Chinese ADRs
    "BABA", "JD", "PDD", "BIDU", "XPEV", "LI", "TME",
]

# ── Taiwan Exchange Stocks (.TW suffix) ───────────────────────────────────────
# yfinance supports these directly; prices are in TWD
TW_TICKERS = [
    # 半導體 / 電子
    "2330.TW",   # 台積電 TSMC
    "2454.TW",   # 聯發科 MediaTek
    "2303.TW",   # 聯電 UMC
    "2379.TW",   # 瑞昱 Realtek
    "2382.TW",   # 廣達 Quanta
    "2317.TW",   # 鴻海 Hon Hai / Foxconn
    "2308.TW",   # 台達電 Delta Electronics
    "3711.TW",   # 日月光投控 ASE Technology
    "2301.TW",   # 光寶科 Lite-On
    "2356.TW",   # 英業達 Inventec
    "2353.TW",   # 宏碁 Acer
    "2357.TW",   # 華碩 ASUS
    "2412.TW",   # 中華電信 Chunghwa Telecom
    "3045.TW",   # 台灣大哥大 Taiwan Mobile
    "4938.TW",   # 和碩 Pegatron
    # 金融
    "2881.TW",   # 富邦金 Fubon Financial
    "2882.TW",   # 國泰金 Cathay Financial
    "2884.TW",   # 玉山金 E.Sun Financial
    "2885.TW",   # 元大金 Yuanta Financial
    "2886.TW",   # 兆豐金 Mega Financial
    "2891.TW",   # 中信金 CTBC Financial
    "2892.TW",   # 第一金 First Financial
    "5880.TW",   # 合庫金 Taiwan Cooperative Financial
    # 傳產 / 其他
    "1301.TW",   # 台塑 Formosa Plastics
    "1303.TW",   # 南亞 Nan Ya Plastics
    "2002.TW",   # 中鋼 China Steel
    "2603.TW",   # 長榮海運 Evergreen Marine
    "2609.TW",   # 陽明海運 Yang Ming Marine
    "2615.TW",   # 萬海航運 Wan Hai Lines
    "1216.TW",   # 統一企業 Uni-President
]

# Combined universe
TICKER_UNIVERSE = US_TICKERS + TW_TICKERS
