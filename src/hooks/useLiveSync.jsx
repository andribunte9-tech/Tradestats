/**
 * useLiveSync
 * Polls the local FastAPI backend (sync.py) for live MT5 data:
 *  - /status  every 5s  → connection status + account info
 *  - /positions every 5s → open positions with live P&L
 *  - /history  every 15s → closed trades; auto-imports new ones
 */

import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from 'react'
import { useTrades } from './useTrades'

// Backend-URL ist parametrisierbar:
//   - Default: lokales Backend (127.0.0.1:8000) — funktioniert für die gebündelte App
//   - Build-time override via VITE_API_URL (z.B. für Cloud-Hosting)
//   - Runtime override via window.TRADESTATS_API (z.B. via Bookmarklet)
const API =
  (typeof window !== 'undefined' && window.TRADESTATS_API) ||
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000'
const TIMEOUT_MS        = 3500
const STATUS_INTERVAL   = 1_000   // ms — Account-Info (Balance/Equity/Margin)
const POSITION_INTERVAL = 1_000   // ms — offene Positionen + Live-P&L
const HISTORY_INTERVAL  = 15_000  // ms — geschlossene Trades (selten)
const MFE_INTERVAL      = 1_000   // ms — MFE/MAE-Watermarks (live tracking)
const POST_CLOSE_DELAY  = 800     // ms — MT5 needs a beat to finalize the deal
const MFE_STORAGE_KEY   = 'tradestats_mfe_mae'

const LiveSyncContext = createContext(null)

/* ─── Provider ───────────────────────────────────────────── */
export function LiveSyncProvider({ children }) {
  const { importIfNew, syncFromBackend } = useTrades()

  const [status, setStatus]       = useState({
    connected: false,
    account:   null,
    error:     null,
    lastUpdate: null,
    posCount:  0,
    histCount: 0,
    apiReachable: false,  // is the Python backend up at all?
  })
  const [positions, setPositions] = useState([])
  const [toast, setToast]         = useState(null) // { count }
  const [mfeMae, setMfeMae]       = useState(() => {
    try {
      const stored = localStorage.getItem(MFE_STORAGE_KEY)
      return stored ? JSON.parse(stored) : { archive: {}, live: {} }
    } catch { return { archive: {}, live: {} } }
  })
  const mountedRef                = useRef(true)
  const toastTimerRef             = useRef(null)
  const prevPosIdsRef             = useRef(new Set())
  const prevHistCountRef          = useRef(null)
  const historyPendingRef         = useRef(false)

  useEffect(() => {
    // Persist only the archive (live data is volatile per session)
    try {
      localStorage.setItem(MFE_STORAGE_KEY, JSON.stringify({ archive: mfeMae.archive || {}, live: {} }))
    } catch {}
  }, [mfeMae.archive])

  // ── Show toast for auto-imports ───────────────────────────
  const showToast = useCallback((count) => {
    setToast({ count })
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setToast(null)
    }, 4000)
  }, [])

  // ── Fetch helpers ─────────────────────────────────────────
  async function apiFetch(path, timeoutMs = TIMEOUT_MS) {
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${API}${path}`, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      clearTimeout(timer)
      throw err
    }
  }

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/status')
      if (!mountedRef.current) return
      // If histCount grew since last poll, a new closed trade is available → fetch it now
      if (prevHistCountRef.current != null && data.histCount > prevHistCountRef.current) {
        scheduleHistoryFetch()
      }
      prevHistCountRef.current = data.histCount
      setStatus({
        connected:    data.connected,
        account:      data.account,
        error:        data.error,
        lastUpdate:   data.lastUpdate,
        posCount:     data.posCount,
        histCount:    data.histCount,
        apiReachable: true,
      })
    } catch {
      if (!mountedRef.current) return
      setStatus(prev => ({
        ...prev,
        connected:    false,
        apiReachable: false,
        error:        'Python Backend nicht erreichbar',
      }))
    }
  }, [])

  const fetchPositions = useCallback(async () => {
    try {
      const data = await apiFetch('/positions')
      if (!mountedRef.current) return
      const newPositions = data.positions || []
      const newIds = new Set(newPositions.map(p => p.id))
      // Any positions that disappeared since last poll? → likely just closed.
      // Trigger a history fetch shortly after so they show up in the journal immediately.
      const closedNow = [...prevPosIdsRef.current].filter(id => !newIds.has(id))
      if (closedNow.length > 0) scheduleHistoryFetch()
      prevPosIdsRef.current = newIds
      setPositions(newPositions)
    } catch {
      // silent — status fetch will report the disconnect
    }
  }, [])

  const fetchMfeMae = useCallback(async () => {
    try {
      const data = await apiFetch('/mfe-mae')
      if (!mountedRef.current) return
      setMfeMae(prev => ({
        // merge incoming archive with what we already have (server is authoritative)
        archive: { ...(prev.archive || {}), ...(data.archive || {}) },
        live:    data.live || {},
      }))
    } catch {
      // silent — endpoint may not exist on old backends
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const data = await apiFetch('/history', 6000)
      if (!mountedRef.current) return
      const imported = importIfNew(data.trades || [])
      if (imported > 0) showToast(imported)
      return imported
    } catch {
      return 0
    }
  }, [importIfNew, showToast])

  /**
   * Force an immediate MT5 refresh (bypasses backend's 10s poll interval).
   * Calls /sync on the backend which runs history_select + history_deals_get
   * synchronously, then pulls /history into the local store.
   * Returns: { ok, imported, histCount }
   */
  const forceSync = useCallback(async () => {
    try {
      const r = await fetch(`${API}/sync`, { method: 'POST' })
      const data = await r.json()
      if (!data.ok) return { ok: false, error: data.error || 'Sync fehlgeschlagen', added: 0, updated: 0 }
      // Pull fresh history and reconcile (adds new + refreshes existing fields like closeTime)
      try {
        const hist = await apiFetch('/history', 6000)
        const { added, updated } = syncFromBackend(hist.trades || [])
        if (added > 0) showToast(added)
        return { ok: true, added, updated, histCount: data.histCount }
      } catch {
        return { ok: true, added: 0, updated: 0, histCount: data.histCount }
      }
    } catch (err) {
      return { ok: false, error: err.message || 'Backend nicht erreichbar', added: 0, updated: 0 }
    }
  }, [syncFromBackend, showToast])

  // Debounced one-off history fetch — used after position-close or histCount bump.
  function scheduleHistoryFetch() {
    if (historyPendingRef.current) return
    historyPendingRef.current = true
    setTimeout(() => {
      historyPendingRef.current = false
      if (mountedRef.current) fetchHistory()
    }, POST_CLOSE_DELAY)
  }

  // ── Polling loops ─────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true

    // Initial burst
    fetchStatus()
    fetchPositions()
    fetchHistory()
    fetchMfeMae()

    const ids = [
      setInterval(fetchStatus,    STATUS_INTERVAL),
      setInterval(fetchPositions, POSITION_INTERVAL),
      setInterval(fetchHistory,   HISTORY_INTERVAL),
      setInterval(fetchMfeMae,    MFE_INTERVAL),
    ]

    return () => {
      mountedRef.current = false
      ids.forEach(clearInterval)
      clearTimeout(toastTimerRef.current)
    }
  }, [fetchStatus, fetchPositions, fetchHistory, fetchMfeMae])

  return (
    <LiveSyncContext.Provider value={{ status, positions, toast, mfeMae, forceSync, fetchHistory, fetchMfeMae }}>
      {children}
    </LiveSyncContext.Provider>
  )
}

/* ─── Hook ───────────────────────────────────────────────── */
const LIVE_SYNC_DEFAULTS = {
  status:    { connected: false, apiReachable: false, account: null, error: null, lastUpdate: null, posCount: 0, histCount: 0 },
  positions: [],
  toast:     null,
  mfeMae:    { archive: {}, live: {} },
  forceSync:    async () => ({ ok: false, error: 'LiveSync nicht initialisiert' }),
  fetchHistory: async () => 0,
  fetchMfeMae:  async () => {},
}

export function useLiveSync() {
  const ctx = useContext(LiveSyncContext)
  // Graceful fallback: outside-provider callers (e.g. share view) get safe defaults
  // instead of an exception.
  return ctx || LIVE_SYNC_DEFAULTS
}
