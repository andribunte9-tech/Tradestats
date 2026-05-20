import { useState, useRef, useEffect } from 'react'
import { Eye, EyeOff, DollarSign, Wifi, Globe } from 'lucide-react'
import Sidebar from './Sidebar'
import { usePrivacyMode } from '../hooks/usePrivacyMode'
import { useLanguage } from '../hooks/useLanguage'

/* ─── Language Switcher ──────────────────────────────────────── */
function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()
  return (
    <div className="flex items-center bg-[#0d1117] border border-[#1f2937] rounded-lg p-0.5">
      <Globe size={11} className="text-slate-600 mx-1.5" />
      {['de', 'en'].map(lang => (
        <button
          key={lang}
          onClick={() => setLanguage(lang)}
          className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors
            ${language === lang
              ? 'bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
        >
          {lang}
        </button>
      ))}
    </div>
  )
}

/* ─── Privacy Toggle (Top-Right) ─────────────────────────────── */
function PrivacyToggle() {
  const { privacyMode, toggle, accountBalance, setAccountBalance, usingLiveEquity } = usePrivacyMode()
  const { t } = useLanguage()
  const [showBal, setShowBal]   = useState(false)
  const [inputVal, setInputVal] = useState(String(accountBalance))
  const inputRef  = useRef(null)
  const popoverRef = useRef(null)

  // Schließe Popover bei Außen-Klick
  useEffect(() => {
    const h = e => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setShowBal(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Balance-Eingabe fokussieren
  useEffect(() => {
    if (showBal) {
      setInputVal(String(accountBalance))
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [showBal, accountBalance])

  function handleSubmit(e) {
    e.preventDefault()
    setAccountBalance(inputVal)
    setShowBal(false)
  }

  return (
    <div className="flex items-center gap-1.5">

      {/* Balance-Badge (nur sichtbar wenn Privacy Mode aktiv) */}
      {privacyMode && (
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setShowBal(p => !p)}
            title={usingLiveEquity
              ? t('app.live_mt5_equity')
              : t('app.starting_capital')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono border transition-all duration-150
              ${showBal
                ? 'bg-[#1f2937] border-[#374151] text-slate-200'
                : usingLiveEquity
                  ? 'bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/15'
                  : 'bg-[#0d1117] border-[#1f2937] text-slate-500 hover:text-slate-300 hover:border-[#374151]'
              }`}
          >
            {usingLiveEquity ? <Wifi size={10} /> : <DollarSign size={10} />}
            {/* Im Privacy-Mode wird der Betrag versteckt (• • •) — Klick auf das Badge öffnet das
                Popover und zeigt dort den vollen Wert; so muss man den Privacy-Toggle nicht
                deaktivieren, um die Equity kurz zu prüfen. */}
            {privacyMode
              ? '• • •'
              : accountBalance >= 1000
                ? `${(accountBalance / 1000).toFixed(accountBalance % 1000 === 0 ? 0 : 1)}K`
                : accountBalance.toFixed(0)}
          </button>

          {showBal && (
            usingLiveEquity ? (
              <div
                ref={popoverRef}
                className="absolute right-0 top-full mt-2 z-50 bg-[#131c2e] border border-[#2d3748]
                  rounded-xl shadow-2xl p-3 w-60"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                  <p className="text-[10px] text-[#10b981] uppercase tracking-wider font-bold">
                    {t('app.live_mt5_equity')}
                  </p>
                </div>
                <p className="text-lg font-mono font-bold text-slate-200">
                  ${accountBalance.toFixed(2)}
                </p>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  {t('app.starting_capital.live_hint')}
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="absolute right-0 top-full mt-2 z-50 bg-[#131c2e] border border-[#2d3748]
                  rounded-xl shadow-2xl p-3 w-52"
              >
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-medium">
                  {t('app.starting_capital')} (MT5 offline)
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                    <input
                      ref={inputRef}
                      type="number"
                      value={inputVal}
                      onChange={e => setInputVal(e.target.value)}
                      onKeyDown={e => e.key === 'Escape' && setShowBal(false)}
                      className="input w-full pl-6 text-xs font-mono"
                      placeholder="10000"
                      min="1"
                      step="any"
                    />
                  </div>
                  <button type="submit" className="btn-primary text-xs px-3 py-1.5">OK</button>
                </div>
                <p className="text-[10px] text-slate-600 mt-2">
                  {t('app.starting_capital.hint')}
                </p>
              </form>
            )
          )}
        </div>
      )}

      {/* Eye-Button */}
      <button
        onClick={toggle}
        title={t('app.privacy')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
          transition-all duration-200 border select-none
          ${privacyMode
            ? 'bg-[#3b82f6]/15 text-[#3b82f6] border-[#3b82f6]/30 shadow-sm shadow-[#3b82f6]/10'
            : 'text-slate-600 border-transparent hover:text-slate-300 hover:bg-[#1a2233] hover:border-[#2d3748]'
          }`}
      >
        {privacyMode
          ? <EyeOff size={13} />
          : <Eye size={13} />
        }
        <span>{t('app.privacy')}</span>
      </button>
    </div>
  )
}

/* ─── Layout ─────────────────────────────────────────────────── */
export default function Layout({ activePage, setActivePage, children }) {
  return (
    <div className="flex h-screen bg-[#080c14] overflow-hidden">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      <main className="flex-1 overflow-hidden flex flex-col min-h-0">
        {/* Top Bar */}
        <div className="flex items-center justify-end gap-2 px-5 h-10 border-b border-[#0f1724] shrink-0">
          <LanguageSwitcher />
          <PrivacyToggle />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto h-full">
          {children}
        </div>
      </main>
    </div>
  )
}
