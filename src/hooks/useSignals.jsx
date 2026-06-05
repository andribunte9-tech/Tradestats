import { useState, useEffect, useRef } from 'react'

// Gleiche Backend-URL-Logik wie useLiveSync
const API =
  (typeof window !== 'undefined' && window.TRADESTATS_API) ||
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000'

const POLL_MS = 20_000

/**
 * Lädt die geparsten Telegram-Signale vom Backend (/signals).
 * Liefert { messages, lastSeenId, loading, error, available }.
 * available = false, wenn der Endpoint fehlt (alte .exe ohne Telegram-Code).
 */
export function useSignals() {
  const [data, setData] = useState({ messages: [], last_seen_id: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [available, setAvailable] = useState(true)
  const timer = useRef(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const ctrl = new AbortController()
        const to = setTimeout(() => ctrl.abort(), 6000)
        const res = await fetch(`${API}/signals`, { signal: ctrl.signal })
        clearTimeout(to)
        if (res.status === 404) { if (alive) { setAvailable(false); setLoading(false) } ; return }
        const json = await res.json()
        if (alive) {
          setData(json && Array.isArray(json.messages) ? json : { messages: [], last_seen_id: 0 })
          setAvailable(true)
          setError(null)
          setLoading(false)
        }
      } catch (e) {
        if (alive) { setError(String(e?.message || e)); setLoading(false) }
      }
    }
    load()
    timer.current = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(timer.current) }
  }, [])

  return {
    messages: data.messages || [],
    lastSeenId: data.last_seen_id || 0,
    loading, error, available,
  }
}
