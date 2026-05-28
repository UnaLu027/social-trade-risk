// US Ticker Universe — curated list of ~130 common US stocks and ETFs.
// Full ticker universe can later be generated from Nasdaq Trader Symbol Directory files
// nasdaqlisted.txt and otherlisted.txt (https://www.nasdaqtrader.com/dynamic/symdir/).

export interface TickerEntry {
  symbol: string
  name: string
  exchange?: string
  type?: 'stock' | 'etf' | 'adr' | 'other'
}

export const US_TICKERS: TickerEntry[] = [
  // ── Meme / high-volatility ───────────────────────────────────────────────
  { symbol: 'GME',   name: 'GameStop Corp.',                      exchange: 'NYSE',   type: 'stock' },
  { symbol: 'AMC',   name: 'AMC Entertainment Holdings',          exchange: 'NYSE',   type: 'stock' },
  { symbol: 'BB',    name: 'BlackBerry Ltd.',                      exchange: 'NYSE',   type: 'stock' },
  { symbol: 'KOSS',  name: 'Koss Corporation',                    exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'NOK',   name: 'Nokia Corporation',                   exchange: 'NYSE',   type: 'adr'   },
  { symbol: 'PLTR',  name: 'Palantir Technologies Inc.',          exchange: 'NYSE',   type: 'stock' },
  { symbol: 'SOFI',  name: 'SoFi Technologies Inc.',              exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'COIN',  name: 'Coinbase Global Inc.',                exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'HOOD',  name: 'Robinhood Markets Inc.',              exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'RIVN',  name: 'Rivian Automotive Inc.',              exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'LCID',  name: 'Lucid Group Inc.',                    exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'PTON',  name: 'Peloton Interactive Inc.',            exchange: 'NASDAQ', type: 'stock' },

  // ── Major tech ───────────────────────────────────────────────────────────
  { symbol: 'AAPL',  name: 'Apple Inc.',                          exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'MSFT',  name: 'Microsoft Corporation',               exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)',             exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'GOOG',  name: 'Alphabet Inc. (Class C)',             exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'META',  name: 'Meta Platforms Inc.',                 exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'AMZN',  name: 'Amazon.com Inc.',                     exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'NVDA',  name: 'NVIDIA Corporation',                  exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'TSLA',  name: 'Tesla Inc.',                          exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'AMD',   name: 'Advanced Micro Devices Inc.',         exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'INTC',  name: 'Intel Corporation',                   exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'AVGO',  name: 'Broadcom Inc.',                       exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'QCOM',  name: 'Qualcomm Incorporated',               exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'TSM',   name: 'Taiwan Semiconductor Mfg. Co. Ltd.', exchange: 'NYSE',   type: 'adr'   },
  { symbol: 'ASML',  name: 'ASML Holding N.V.',                   exchange: 'NASDAQ', type: 'adr'   },
  { symbol: 'TXN',   name: 'Texas Instruments Incorporated',      exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'MU',    name: 'Micron Technology Inc.',              exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'AMAT',  name: 'Applied Materials Inc.',              exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'LRCX',  name: 'Lam Research Corporation',           exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'SMCI',  name: 'Super Micro Computer Inc.',           exchange: 'NASDAQ', type: 'stock' },

  // ── Software / Cloud ─────────────────────────────────────────────────────
  { symbol: 'ORCL',  name: 'Oracle Corporation',                  exchange: 'NYSE',   type: 'stock' },
  { symbol: 'CRM',   name: 'Salesforce Inc.',                     exchange: 'NYSE',   type: 'stock' },
  { symbol: 'NOW',   name: 'ServiceNow Inc.',                     exchange: 'NYSE',   type: 'stock' },
  { symbol: 'SNOW',  name: 'Snowflake Inc.',                      exchange: 'NYSE',   type: 'stock' },
  { symbol: 'DDOG',  name: 'Datadog Inc.',                        exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'CRWD',  name: 'CrowdStrike Holdings Inc.',           exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'PANW',  name: 'Palo Alto Networks Inc.',             exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'NET',   name: 'Cloudflare Inc.',                     exchange: 'NYSE',   type: 'stock' },
  { symbol: 'SHOP',  name: 'Shopify Inc.',                        exchange: 'NYSE',   type: 'adr'   },
  { symbol: 'ROKU',  name: 'Roku Inc.',                           exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'ZM',    name: 'Zoom Video Communications Inc.',      exchange: 'NASDAQ', type: 'stock' },

  // ── Finance ──────────────────────────────────────────────────────────────
  { symbol: 'JPM',   name: 'JPMorgan Chase & Co.',                exchange: 'NYSE',   type: 'stock' },
  { symbol: 'BAC',   name: 'Bank of America Corp.',               exchange: 'NYSE',   type: 'stock' },
  { symbol: 'WFC',   name: 'Wells Fargo & Co.',                   exchange: 'NYSE',   type: 'stock' },
  { symbol: 'GS',    name: 'Goldman Sachs Group Inc.',            exchange: 'NYSE',   type: 'stock' },
  { symbol: 'MS',    name: 'Morgan Stanley',                      exchange: 'NYSE',   type: 'stock' },
  { symbol: 'C',     name: 'Citigroup Inc.',                      exchange: 'NYSE',   type: 'stock' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. (Class B)',   exchange: 'NYSE',   type: 'stock' },
  { symbol: 'BX',    name: 'Blackstone Inc.',                     exchange: 'NYSE',   type: 'stock' },
  { symbol: 'AXP',   name: 'American Express Co.',                exchange: 'NYSE',   type: 'stock' },
  { symbol: 'V',     name: 'Visa Inc.',                           exchange: 'NYSE',   type: 'stock' },
  { symbol: 'MA',    name: 'Mastercard Incorporated',             exchange: 'NYSE',   type: 'stock' },
  { symbol: 'PYPL',  name: 'PayPal Holdings Inc.',                exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'SQ',    name: 'Block Inc.',                          exchange: 'NYSE',   type: 'stock' },
  { symbol: 'AFRM',  name: 'Affirm Holdings Inc.',                exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'UPST',  name: 'Upstart Holdings Inc.',               exchange: 'NASDAQ', type: 'stock' },

  // ── Consumer / Retail ────────────────────────────────────────────────────
  { symbol: 'WMT',   name: 'Walmart Inc.',                        exchange: 'NYSE',   type: 'stock' },
  { symbol: 'COST',  name: 'Costco Wholesale Corporation',        exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'TGT',   name: 'Target Corporation',                  exchange: 'NYSE',   type: 'stock' },
  { symbol: 'HD',    name: 'The Home Depot Inc.',                 exchange: 'NYSE',   type: 'stock' },
  { symbol: 'LOW',   name: "Lowe's Companies Inc.",               exchange: 'NYSE',   type: 'stock' },
  { symbol: 'MCD',   name: "McDonald's Corporation",              exchange: 'NYSE',   type: 'stock' },
  { symbol: 'SBUX',  name: 'Starbucks Corporation',               exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'KO',    name: 'The Coca-Cola Company',               exchange: 'NYSE',   type: 'stock' },
  { symbol: 'PEP',   name: 'PepsiCo Inc.',                        exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'NKE',   name: 'Nike Inc.',                           exchange: 'NYSE',   type: 'stock' },

  // ── Media / Entertainment / Social ───────────────────────────────────────
  { symbol: 'DIS',   name: 'The Walt Disney Company',             exchange: 'NYSE',   type: 'stock' },
  { symbol: 'NFLX',  name: 'Netflix Inc.',                        exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'SPOT',  name: 'Spotify Technology S.A.',             exchange: 'NYSE',   type: 'adr'   },
  { symbol: 'SNAP',  name: 'Snap Inc.',                           exchange: 'NYSE',   type: 'stock' },
  { symbol: 'PINS',  name: 'Pinterest Inc.',                      exchange: 'NYSE',   type: 'stock' },
  { symbol: 'ABNB',  name: 'Airbnb Inc.',                         exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'UBER',  name: 'Uber Technologies Inc.',              exchange: 'NYSE',   type: 'stock' },
  { symbol: 'LYFT',  name: 'Lyft Inc.',                           exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'RBLX',  name: 'Roblox Corporation',                  exchange: 'NYSE',   type: 'stock' },

  // ── Healthcare / Biotech ─────────────────────────────────────────────────
  { symbol: 'JNJ',   name: 'Johnson & Johnson',                   exchange: 'NYSE',   type: 'stock' },
  { symbol: 'UNH',   name: 'UnitedHealth Group Inc.',             exchange: 'NYSE',   type: 'stock' },
  { symbol: 'LLY',   name: 'Eli Lilly and Company',               exchange: 'NYSE',   type: 'stock' },
  { symbol: 'PFE',   name: 'Pfizer Inc.',                         exchange: 'NYSE',   type: 'stock' },
  { symbol: 'MRNA',  name: 'Moderna Inc.',                        exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'BNTX',  name: 'BioNTech SE',                         exchange: 'NASDAQ', type: 'adr'   },
  { symbol: 'ABBV',  name: 'AbbVie Inc.',                         exchange: 'NYSE',   type: 'stock' },
  { symbol: 'AMGN',  name: 'Amgen Inc.',                          exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'GILD',  name: 'Gilead Sciences Inc.',                exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'BMY',   name: 'Bristol-Myers Squibb Company',        exchange: 'NYSE',   type: 'stock' },
  { symbol: 'ISRG',  name: 'Intuitive Surgical Inc.',             exchange: 'NASDAQ', type: 'stock' },

  // ── Energy ───────────────────────────────────────────────────────────────
  { symbol: 'XOM',   name: 'Exxon Mobil Corporation',             exchange: 'NYSE',   type: 'stock' },
  { symbol: 'CVX',   name: 'Chevron Corporation',                 exchange: 'NYSE',   type: 'stock' },
  { symbol: 'COP',   name: 'ConocoPhillips',                      exchange: 'NYSE',   type: 'stock' },
  { symbol: 'SLB',   name: 'SLB (Schlumberger)',                  exchange: 'NYSE',   type: 'stock' },

  // ── Industrial / Aerospace ───────────────────────────────────────────────
  { symbol: 'BA',    name: 'Boeing Company',                      exchange: 'NYSE',   type: 'stock' },
  { symbol: 'CAT',   name: 'Caterpillar Inc.',                    exchange: 'NYSE',   type: 'stock' },
  { symbol: 'GE',    name: 'GE Aerospace',                        exchange: 'NYSE',   type: 'stock' },
  { symbol: 'HON',   name: 'Honeywell International Inc.',        exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'LMT',   name: 'Lockheed Martin Corporation',         exchange: 'NYSE',   type: 'stock' },
  { symbol: 'RTX',   name: 'RTX Corporation',                     exchange: 'NYSE',   type: 'stock' },
  { symbol: 'MMM',   name: '3M Company',                          exchange: 'NYSE',   type: 'stock' },

  // ── Communication ────────────────────────────────────────────────────────
  { symbol: 'T',     name: 'AT&T Inc.',                           exchange: 'NYSE',   type: 'stock' },
  { symbol: 'VZ',    name: 'Verizon Communications Inc.',         exchange: 'NYSE',   type: 'stock' },
  { symbol: 'TMUS',  name: 'T-Mobile US Inc.',                    exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'CMCSA', name: 'Comcast Corporation',                 exchange: 'NASDAQ', type: 'stock' },

  // ── Gaming / Sports Betting ──────────────────────────────────────────────
  { symbol: 'DKNG',  name: 'DraftKings Inc.',                     exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'PENN',  name: 'PENN Entertainment Inc.',             exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'TTWO',  name: 'Take-Two Interactive Software Inc.',  exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'EA',    name: 'Electronic Arts Inc.',                exchange: 'NASDAQ', type: 'stock' },

  // ── China ADRs (US-listed) ────────────────────────────────────────────────
  { symbol: 'BABA',  name: 'Alibaba Group Holding Ltd.',          exchange: 'NYSE',   type: 'adr'   },
  { symbol: 'JD',    name: 'JD.com Inc.',                         exchange: 'NASDAQ', type: 'adr'   },
  { symbol: 'PDD',   name: 'PDD Holdings Inc. (Temu/Pinduoduo)',  exchange: 'NASDAQ', type: 'adr'   },

  // ── Crypto-related ───────────────────────────────────────────────────────
  { symbol: 'MSTR',  name: 'MicroStrategy Incorporated',          exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'MARA',  name: 'Marathon Digital Holdings Inc.',      exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'RIOT',  name: 'Riot Platforms Inc.',                 exchange: 'NASDAQ', type: 'stock' },
  { symbol: 'CLSK',  name: 'CleanSpark Inc.',                     exchange: 'NASDAQ', type: 'stock' },

  // ── ETFs ─────────────────────────────────────────────────────────────────
  { symbol: 'SPY',   name: 'SPDR S&P 500 ETF Trust',              exchange: 'NYSE',   type: 'etf'   },
  { symbol: 'QQQ',   name: 'Invesco QQQ Trust (Nasdaq-100)',       exchange: 'NASDAQ', type: 'etf'   },
  { symbol: 'IWM',   name: 'iShares Russell 2000 ETF',            exchange: 'NYSE',   type: 'etf'   },
  { symbol: 'DIA',   name: 'SPDR Dow Jones Industrial Average ETF', exchange: 'NYSE', type: 'etf'   },
  { symbol: 'VTI',   name: 'Vanguard Total Stock Market ETF',     exchange: 'NYSE',   type: 'etf'   },
  { symbol: 'VOO',   name: 'Vanguard S&P 500 ETF',                exchange: 'NYSE',   type: 'etf'   },
  { symbol: 'ARKK',  name: 'ARK Innovation ETF',                  exchange: 'NYSE',   type: 'etf'   },
  { symbol: 'TQQQ',  name: 'ProShares UltraPro QQQ (3x Long)',    exchange: 'NASDAQ', type: 'etf'   },
  { symbol: 'SQQQ',  name: 'ProShares UltraPro Short QQQ (3x)',   exchange: 'NASDAQ', type: 'etf'   },
  { symbol: 'SOXL',  name: 'Direxion Daily Semiconductors Bull 3x ETF', exchange: 'NYSE', type: 'etf' },
  { symbol: 'SOXS',  name: 'Direxion Daily Semiconductors Bear 3x ETF', exchange: 'NYSE', type: 'etf' },
  { symbol: 'GLD',   name: 'SPDR Gold Shares ETF',                exchange: 'NYSE',   type: 'etf'   },
  { symbol: 'SLV',   name: 'iShares Silver Trust ETF',            exchange: 'NYSE',   type: 'etf'   },
  { symbol: 'TLT',   name: 'iShares 20+ Year Treasury Bond ETF',  exchange: 'NASDAQ', type: 'etf'   },
  { symbol: 'HYG',   name: 'iShares iBoxx High Yield Corp Bond ETF', exchange: 'NYSE', type: 'etf'  },
  { symbol: 'USO',   name: 'United States Oil Fund LP',           exchange: 'NYSE',   type: 'etf'   },
  { symbol: 'VIXY',  name: 'ProShares VIX Short-Term Futures ETF', exchange: 'NYSE',  type: 'etf'   },
]
