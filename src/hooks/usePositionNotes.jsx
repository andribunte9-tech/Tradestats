import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'tradestats_position_notes'
const Ctx = createContext(null)

/**
 * Per-open-position notes & tags, persisted in localStorage.
 * Survives MT5 reconnects since the position id stays stable.
 * Format: { [positionId]: { notes: string, tags: string[], updatedAt: ISO } }
 */
export function PositionNotesProvider({ children }) {
  const [data, setData] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  const get = useCallback((id) => data[id] || { notes: '', tags: [] }, [data])

  const set = useCallback((id, patch) => {
    setData(prev => ({
      ...prev,
      [id]: { ...(prev[id] || { notes: '', tags: [] }), ...patch, updatedAt: new Date().toISOString() },
    }))
  }, [])

  const remove = useCallback((id) => {
    setData(prev => {
      if (!(id in prev)) return prev
      const n = { ...prev }
      delete n[id]
      return n
    })
  }, [])

  return <Ctx.Provider value={{ get, set, remove, all: data }}>{children}</Ctx.Provider>
}

export function usePositionNotes() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePositionNotes must be used within PositionNotesProvider')
  return ctx
}
