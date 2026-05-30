import { Link } from 'react-router-dom'
import { TrendingUp, ShieldCheck, ArrowLeft, LayoutDashboard } from 'lucide-react'

interface Section {
  heading: string
  body: string
}

const sections: Section[] = [
  {
    heading: '網站性質',
    body: '本網站為國立中正大學課程專題展示系統，用於示範社群交易風險分析與個人化觀察清單功能。本站不提供正式投資服務，所有資料均為教育與研究目的使用。',
  },
  {
    heading: '本站保存的資料',
    body: '本站僅保存：註冊電子郵件、以 Argon2id 密碼雜湊演算法處理後的本站專用密碼，以及使用者建立的股票觀察清單。系統不保存可讀取的原始密碼，亦不保存任何金融帳戶資訊、交易紀錄或個人財務資料。',
  },
  {
    heading: '帳戶隔離聲明',
    body: '本站不會連結或存取銀行、券商、Google、學校或其他第三方帳戶。本站帳號與任何外部服務完全獨立，登入本站不需要也不應使用任何第三方服務的密碼。',
  },
  {
    heading: '金融操作聲明',
    body: '本站不要求使用者輸入任何金融帳戶密碼，也不執行任何實際交易或投資委託。所有顯示的分析資料均為資訊參考，不構成投資建議。',
  },
  {
    heading: '密碼安全建議',
    body: '請僅為本網站建立一組全新的專用密碼，勿重複使用 Google 帳號、學校信箱、銀行、券商或其他服務的密碼。本站使用 Argon2id 密碼雜湊演算法處理密碼，管理員無法從系統中讀取或還原您的原始密碼。',
  },
]

export function SecurityNotice() {
  return (
    <div
      className="flex flex-col items-center min-h-screen p-6"
      style={{ background: '#0f1117' }}
    >
      <div className="w-full max-w-lg py-8">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div
            className="w-8 h-8 rounded flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)' }}
          >
            <TrendingUp size={16} color="white" />
          </div>
          <span className="text-sm font-semibold text-white">Social Trading Risk Copilot</span>
        </div>

        {/* Main card */}
        <div className="rounded-xl p-6" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          {/* Title */}
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck size={18} color="#10b981" />
            <h1 className="text-lg font-semibold text-white">資料使用與安全說明</h1>
          </div>

          {/* Sections */}
          <div className="flex flex-col gap-5">
            {sections.map((s) => (
              <div key={s.heading}>
                <h2 className="text-xs font-semibold mb-1.5" style={{ color: '#38bdf8' }}>
                  {s.heading}
                </h2>
                <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="my-5" style={{ borderTop: '1px solid #2d3148' }} />

          {/* Navigation buttons */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-80 flex-1"
              style={{ background: '#2d3148', color: '#94a3b8', border: '1px solid #3d4163' }}
            >
              <ArrowLeft size={13} />
              返回登入
            </Link>
            <Link
              to="/risk-monitor"
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-80 flex-1"
              style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
            >
              <LayoutDashboard size={13} />
              前往公開看板
            </Link>
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: '#3d4163' }}>
          National Chung Cheng University · Course Project · For Educational Use Only
        </p>
      </div>
    </div>
  )
}
