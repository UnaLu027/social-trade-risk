import { useState } from 'react'
import { US_TICKERS } from '../data/usTickers'
import type { TickerEntry } from '../data/usTickers'

export interface TickerAutocompleteProps {
  value: string
  onChange: (symbol: string) => void
  onSubmit?: (symbol: string) => void
  placeholder?: string
  className?: string
  maxSuggestions?: number
}

export function TickerAutocomplete({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search ticker…',
  className,
  maxSuggestions = 8,
}: TickerAutocompleteProps) {
  const [open, setOpen] = useState(false)

  const query = value.trim()

  const suggestions: TickerEntry[] = query.length === 0 ? [] : (() => {
    const q = query.toLowerCase()
    const symbolFirst = US_TICKERS.filter(t => t.symbol.toLowerCase().startsWith(q))
    const nameOnly    = US_TICKERS.filter(
      t => !t.symbol.toLowerCase().startsWith(q) && t.name.toLowerCase().includes(q)
    )
    return [...symbolFirst, ...nameOnly].slice(0, maxSuggestions)
  })()

  function handleChange(e: { target: { value: string } }) {
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, '')
    onChange(v)
    setOpen(true)
  }

  function handleKeyDown(e: { key: string }) {
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Enter') {
      setOpen(false)
      if (onSubmit) {
        const val = value.trim()
        if (val) onSubmit(val)
      }
    }
  }

  function handleSuggestionClick(symbol: string) {
    onChange(symbol)
    setOpen(false)
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (value) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        maxLength={10}
        autoComplete="off"
        spellCheck={false}
        className="px-3 py-2 rounded-md text-sm outline-none w-full font-mono"
        style={{ background: '#0d0f1a', border: '1px solid #2d3148', color: '#f1f5f9' }}
      />

      {open && suggestions.length > 0 && (
        <ul
          className="absolute left-0 right-0 mt-1 rounded-md overflow-hidden"
          style={{
            background: '#0d0f1a',
            border: '1px solid #2d3148',
            zIndex: 50,
            top: '100%',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((t) => (
            <li
              key={t.symbol}
              onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(t.symbol) }}
              className="flex flex-col px-3 py-2 cursor-pointer hover:opacity-80"
              style={{ borderBottom: '1px solid #1a1d27' }}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold font-mono text-white">{t.symbol}</span>
                <span className="text-xs truncate" style={{ color: '#94a3b8' }}>{t.name}</span>
              </div>
              {(t.exchange || t.type) && (
                <span className="text-[10px]" style={{ color: '#475569' }}>
                  {[t.exchange, t.type].filter(Boolean).join(' · ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
