import { useEffect, useState, useRef } from 'react'

/**
 * Hook der den Status des lokalen Backends überwacht.
 *
 * Liefert ein Objekt mit dem Zustand der Verbindung:
 *
 *  state: 'unknown' | 'checking' | 'offline' | 'backend_only' | 'connected'
 *    - unknown:       initial, noch nicht gepingt
 *    - checking:      gerade beim ersten Ping
 *    - offline:       /health unerreichbar → Backend läuft nicht
 *    - backend_only:  /health ok, aber MT5 nicht verbunden
 *    - connected:     alles ok
 *
 *  version: { version, platform, python } | null
 *  account: aktuelle MT5-Account-Info (Balance, Equity etc.) | null
 *  error:   letzte Fehlermeldung
 *
 * Polling-Intervall:
 *  - offline:  alle 3s (schnell aufgreifen, wenn Backend startet)
 *  - sonst:    alle 8s (bei laufendem Backend reicht das)
 */
const API =
  (typeof window !== 'undefined' && window.TRADESTATS_API) ||
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000'

const PING_FAST = 3000   // ms — wenn offline
const PING_SLOW = 8000   // ms — wenn online

export function useBackendStatus() {
  const [state, setState]     = useState('unknown')
  const [version, setVersion] = useState(null)
  const [account, setAccount] = useState(null)
  const [error, setError]     = useState(null)
  const timerRef = useRef(null)
  const cancelRef = useRef(false)

  async function pingOnce() {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    try {
      const [health, status, ver] = await Promise.all([
        fetch(`${API}/health`,  { signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/status`,  { signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/version`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      clearTimeout(timer)
      if (cancelRef.current) return

      if (!health) {
        setState('offline')
        setVersion(null)
        setAccount(null)
        setError('Backend unter ' + API + ' nicht erreichbar.')
        return
      }
      if (ver) setVersion(ver)

      if (status?.connected && status?.account) {
        setState('connected')
        setAccount(status.account)
        setError(null)
      } else {
        setState('backend_only')
        setAccount(null)
        setError(status?.error || 'MetaTrader 5 nicht verbunden.')
      }
    } catch (err) {
      clearTimeout(timer)
      if (cancelRef.current) return
      setState('offline')
      setError(err.message || String(err))
    }
  }

  useEffect(() => {
    cancelRef.current = false
    setState('checking')
    pingOnce()

    function loop() {
      const delay = state === 'offline' ? PING_FAST : PING_SLOW
      timerRef.current = setTimeout(async () => {
        await pingOnce()
        if (!cancelRef.current) loop()
      }, delay)
    }
    loop()

    return () => {
      cancelRef.current = true
      clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { state, version, account, error, apiUrl: API, refresh: pingOnce }
}
