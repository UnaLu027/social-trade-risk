export interface SamplePost {
  id: string
  symbol: string
  source: 'reddit' | 'news' | 'synthetic'
  title: string
  text: string
  expectedRisk: 'Critical' | 'High' | 'Medium' | 'Low'
  notes: string
}

export const SAMPLE_POSTS: SamplePost[] = [
  // ── Critical ────────────────────────────────────────────────────────────────
  {
    id: 'c1', symbol: 'GME', source: 'synthetic',
    title: 'GME 軋空警報：立刻上車！',
    text: 'GME to the moon!! Shorts are totally trapped. Buy NOW before it explodes to $500. Diamond hands HODL! Apes together strong. Short squeeze incoming, don\'t miss this once-in-a-lifetime chance!',
    expectedRisk: 'Critical',
    notes: '包含多個 FOMO 詞彙、buy now、short squeeze 敘事及極端炒作語言。',
  },
  {
    id: 'c2', symbol: 'AMC', source: 'synthetic',
    title: 'AMC 最後機會！不買後悔！',
    text: 'AMC last chance to get in! Hedge funds are naked shorting us. This is guaranteed to squeeze. Buy now or regret forever. Apes don\'t sell. 100% going to $100.',
    expectedRisk: 'Critical',
    notes: '包含 guaranteed、100%、manipulation 敘事與 FOMO 急迫性語言。',
  },
  {
    id: 'c3', symbol: 'KOSS', source: 'synthetic',
    title: 'KOSS 即將大爆發，現在不買就太晚了',
    text: 'KOSS is the next GME. Short interest over 130%. Buy now before the squeeze starts. This will go 10x guaranteed. Act fast, citadel is scared. Diamond hands only.',
    expectedRisk: 'Critical',
    notes: '結合短期壓力、保證獲利與集體對抗敘事。',
  },
  {
    id: 'c4', symbol: 'BB', source: 'synthetic',
    title: '立刻買 BB！空頭要被消滅了',
    text: 'BB squeeze is happening RIGHT NOW. Shorts can\'t cover. Buy buy buy, this is the moment we\'ve been waiting for. To the moon!! Don\'t miss the rocket. YOLO everything in.',
    expectedRisk: 'Critical',
    notes: '極端買入鼓吹、YOLO、rocket 等高風險語言組合。',
  },

  // ── High ─────────────────────────────────────────────────────────────────────
  {
    id: 'h1', symbol: 'GME', source: 'synthetic',
    title: 'GME 有短期上漲潛力',
    text: 'GME is heavily shorted and the momentum is building. Lots of retail interest, diamond hands are holding. Price action looks bullish. Could see a big move soon.',
    expectedRisk: 'High',
    notes: '含炒作語言但較少明顯操縱訊號，缺少 buy now 等極端敘事。',
  },
  {
    id: 'h2', symbol: 'AMC', source: 'synthetic',
    title: 'AMC 散戶力量大，值得關注',
    text: 'AMC apes are holding strong. Short interest still high and institutions are watching. The squeeze narrative is not dead. Moon mission continues.',
    expectedRisk: 'High',
    notes: '含 moon、squeeze 語言，但沒有急迫購買指令。',
  },
  {
    id: 'h3', symbol: 'PLTR', source: 'synthetic',
    title: 'PLTR 爆量吸引散戶注意',
    text: 'PLTR volume is insane today. Lots of hype on social media, retail investors piling in. Moon or bust. This feels like the next meme stock.',
    expectedRisk: 'High',
    notes: '高炒作語言，但無明顯操縱指令。',
  },
  {
    id: 'h4', symbol: 'RIVN', source: 'synthetic',
    title: 'RIVN 新能源概念，散戶搶進',
    text: 'RIVN is going to be the next Tesla. Reddit is going crazy, everyone is buying. The stock is going to squeeze. Hold your bags and diamond hands to the moon.',
    expectedRisk: 'High',
    notes: '含 Tesla 類比、散戶炒作語言，有部分 squeeze 暗示。',
  },

  // ── Medium ───────────────────────────────────────────────────────────────────
  {
    id: 'm1', symbol: 'TSLA', source: 'synthetic',
    title: 'Tesla 財報超預期，市場情緒熱絡',
    text: 'Tesla beat earnings expectations significantly this quarter. EV demand remains strong and Elon Musk\'s comments drove social media buzz. Some optimism on Reddit but mostly fundamental discussion.',
    expectedRisk: 'Medium',
    notes: '基本面討論為主，但包含一些社群熱度。',
  },
  {
    id: 'm2', symbol: 'NVDA', source: 'synthetic',
    title: 'NVDA AI 需求強，散戶看好',
    text: 'NVDA is benefiting from the AI wave. Lots of people talking about it on WSB and Twitter. Some say it\'s overvalued but bulls are still excited. Could pull back or continue up.',
    expectedRisk: 'Medium',
    notes: '有社群討論但語氣較為中性，未出現急迫性語言。',
  },
  {
    id: 'm3', symbol: 'COIN', source: 'synthetic',
    title: 'COIN 加密市場回溫受益',
    text: 'Coinbase stock is recovering with the crypto market. Mentions on social media are picking up. Some retail interest. Worth watching but nothing extreme yet.',
    expectedRisk: 'Medium',
    notes: '中度社群關注，無極端語言或操縱訊號。',
  },
  {
    id: 'm4', symbol: 'AMD', source: 'synthetic',
    title: 'AMD 與 NVDA 競爭，散戶分析',
    text: 'AMD is still a solid competitor to NVIDIA in the GPU space. Discussion on Reddit is balanced, some bulls some bears. No extreme sentiment detected.',
    expectedRisk: 'Medium',
    notes: '社群討論均衡，情緒適中。',
  },

  // ── Low ──────────────────────────────────────────────────────────────────────
  {
    id: 'l1', symbol: 'AAPL', source: 'news',
    title: 'Apple 發布新款 iPhone，分析師普遍正面',
    text: 'Apple announced its new iPhone lineup with incremental improvements. Analysts expect moderate demand. The product cycle looks steady. Long-term holders remain comfortable.',
    expectedRisk: 'Low',
    notes: '一般財經新聞，無炒作或操縱語言。',
  },
  {
    id: 'l2', symbol: 'MSFT', source: 'news',
    title: 'Microsoft 雲端業務持續成長',
    text: 'Microsoft Azure continues to show strong growth in cloud services. Institutional investors remain bullish on long-term fundamentals. Earnings guidance was in line with expectations.',
    expectedRisk: 'Low',
    notes: '機構分析語氣，無情緒性語言。',
  },
  {
    id: 'l3', symbol: 'JPM', source: 'news',
    title: 'JPMorgan 季度財報符合預期',
    text: 'JPMorgan Chase reported quarterly earnings that met analyst estimates. Net interest income remained stable. CEO commented on cautious but stable economic outlook.',
    expectedRisk: 'Low',
    notes: '財務報告語氣，極低社群炒作可能性。',
  },
  {
    id: 'l4', symbol: 'WMT', source: 'news',
    title: 'Walmart 消費趨勢穩健',
    text: 'Walmart reported steady consumer spending trends. Same-store sales grew modestly. The stock remains a defensive hold for long-term investors with low volatility.',
    expectedRisk: 'Low',
    notes: '防禦性股票分析，無社群操縱訊號。',
  },
]
