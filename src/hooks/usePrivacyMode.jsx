import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useLiveSync } from './useLiveSync'

const PrivacyCtx = createContext(null)

const PM_KEY  = 'tradestats_privacy_mode'
const BAL_KEY = 'tradestats_account_balance'

/* ─── Provider ───────────────────────────────────────────────── */
export function PrivacyModeProvider({ children }) {
  const [privacyMode, setPrivacyMode] = useState(() => {
    try { return localStorage.getItem(PM_KEY) === 'true' } catch { return false }
  })

  // Fallback balance when MT5 is offline — also persists as a "last-known good" value.
  const [manualBalance, setManualBalance] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem(BAL_KEY))
      return isNaN(v) || v <= 0 ? 10000 : v
    } catch { return 10000 }
  })

  // Read live MT5 equity (nested inside LiveSyncProvider per App.jsx)
  const { status } = useLiveSync()
  const liveEquity = status?.connected ? status.account?.equity : null
  const usingLiveEquity = liveEquity != null && liveEquity > 0

  // Whenever MT5 reports a new equity, mirror it into manualBalance (so it persists
  // as fallback after backend restart / disconnect).
  useEffect(() => {
    if (usingLiveEquity) {
      try { localStorage.setItem(BAL_KEY, String(liveEquity)) } catch {}
      setManualBalance(liveEquity)
    }
  }, [usingLiveEquity, liveEquity])

  const accountBalance = usingLiveEquity ? liveEquity : manualBalance

  const toggle = useCallback(() => {
    setPrivacyMode(prev => {
      const next = !prev
      localStorage.setItem(PM_KEY, String(next))
      return next
    })
  }, [])

  const setAccountBalance = useCallback((v) => {
    const n = parseFloat(v)
    if (!isNaN(n) && n > 0) {
      setManualBalance(n)
      localStorage.setItem(BAL_KEY, String(n))
    }
  }, [])

  return (
    <PrivacyCtx.Provider value={{
      privacyMode, toggle,
      accountBalance, setAccountBalance,
      usingLiveEquity,
    }}>
      {children}
    </PrivacyCtx.Provider>
  )
}

/* ─── Hook ───────────────────────────────────────────────────── */
export function usePrivacyMode() {
  const ctx = useContext(PrivacyCtx)
  if (!ctx) throw new Error('usePrivacyMode must be inside PrivacyModeProvider')
  return ctx
}

/* ─── Interne Format-Funktion ─────────────────────────────────── */
function computeStr(value, pm, refBalance, opts = {}) {
  const { decimals = 2, sign = true, compact = false } = opts
  const v    = value ?? 0
  const absV = Math.abs(v)

  // Vorzeichen
  const signPfx = v > 0 ? (sign ? '+' : '') : v < 0 ? '-' : ''

  if (!pm) {
    // Dollar-Anzeige
    if (compact && absV >= 1000) return `${signPfx}$${(absV / 1000).toFixed(2)}K`
    return `${signPfx}$${absV.toFixed(decimals)}`
  }

  // ROI %-Anzeige (gegen übergebene oder globale Balance)
  const pct    = refBalance > 0 ? (absV / refBalance) * 100 : 0
  return `${signPfx}${pct.toFixed(2)}%`
}

/**
 * <Pvt value={1234.56} />
 *
 * Zeigt entweder "$1,234.56" oder "+12.35%" — je nach Privacy Mode.
 * Wechsel wird mit Blur-Scale-Transition animiert (160 ms).
 *
 * Props:
 *   value    – Zahl (pos oder neg)
 *   balance  – optionale Referenz-Balance für ROI-% (überschreibt accountBalance aus Context)
 *   decimals – Dezimalstellen (default 2)
 *   sign     – '+' Präfix bei positiven Werten (default true)
 *   compact  – $1.23K ab 1000 (default false)
 *   className – zusätzliche CSS-Klassen
 */
export function Pvt({ value, balance, decimals = 2, sign = true, compact = false, className = '' }) {
  const { privacyMode, accountBalance } = usePrivacyMode()
  const refBalance = balance ?? accountBalance

  const opts        = { decimals, sign, compact }
  const [blurring,  setBlurring]  = useState(false)
  const [displayed, setDisplayed] = useState(() => computeStr(value, privacyMode, refBalance, opts))
  const prevMode    = useRef(privacyMode)
  const timer       = useRef(null)

  // Privacy-Mode-Toggle → Blur-Animation
  useEffect(() => {
    if (prevMode.current === privacyMode) return
    prevMode.current = privacyMode
    clearTimeout(timer.current)
    setBlurring(true)
    timer.current = setTimeout(() => {
      setDisplayed(computeStr(value, privacyMode, refBalance, { decimals, sign, compact }))
      setBlurring(false)
    }, 160)
  }, [privacyMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wert-, Balance- oder refBalance-Änderung → sofortiges Update (kein Animate)
  useEffect(() => {
    if (!blurring) {
      setDisplayed(computeStr(value, privacyMode, refBalance, { decimals, sign, compact }))
    }
  }, [value, refBalance, decimals, sign, compact]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup Timer bei Unmount
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <span
      className={`inline-block transition-[opacity,filter,transform] duration-[160ms] ease-in-out ${className}`}
      style={{
        opacity:   blurring ? 0   : 1,
        filter:    blurring ? 'blur(8px)' : 'none',
        transform: blurring ? 'scale(0.88)' : 'scale(1)',
      }}
    >
      {displayed}
    </span>
  )
}
