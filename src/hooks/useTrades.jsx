import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { PREDEFINED_TAGS } from '../data/sampleData'
import { buildEffectiveTrades } from '../utils/tradeGrouping'

const TradesContext = createContext(null)

const STORAGE_KEY   = 'tradestats_trades'
const TAGS_KEY      = 'tradestats_tags'
const GROUPS_KEY    = 'tradestats_manual_groups'   // string[][]

export function TradesProvider({ children }) {
  const [trades, setTrades] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  const [customTags, setCustomTags] = useState(() => {
    try {
      const stored = localStorage.getItem(TAGS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  // manualGroups: Array von Trade-ID-Arrays, z.B. [['id1','id2'], ['id3','id4','id5']]
  const [manualGroups, setManualGroups] = useState(() => {
    try {
      const stored = localStorage.getItem(GROUPS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades))
  }, [trades])

  useEffect(() => {
    localStorage.setItem(TAGS_KEY, JSON.stringify(customTags))
  }, [customTags])

  useEffect(() => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(manualGroups))
  }, [manualGroups])

  const allTags = [
    ...PREDEFINED_TAGS,
    ...customTags.map(t => ({
      name: t,
      color: '#8b5cf6',
      bg: 'rgba(139,92,246,0.15)',
    })),
  ]

  /**
   * effectiveTrades – Gruppen zählen als EIN Trade.
   * Wird von Dashboard, Kalender, DailyJournal für Statistiken verwendet.
   * Das TradeJournal selbst nutzt weiterhin die rohen `trades`.
   */
  const effectiveTrades = useMemo(
    () => buildEffectiveTrades(trades, manualGroups),
    [trades, manualGroups]
  )

  const addTrade = useCallback((trade) => {
    setTrades(prev => [{ ...trade, id: `manual-${Date.now()}` }, ...prev])
  }, [])

  const updateTrade = useCallback((id, updates) => {
    setTrades(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }, [])

  const deleteTrade = useCallback((id) => {
    setTrades(prev => prev.filter(t => t.id !== id))
  }, [])

  const deleteTrades = useCallback((ids) => {
    const idSet = new Set(ids)
    setTrades(prev => prev.filter(t => !idSet.has(t.id)))
  }, [])

  /** Restore previously deleted trades (Undo). Keeps original order at top. */
  const restoreTrades = useCallback((restored) => {
    if (!restored?.length) return
    setTrades(prev => {
      const existing = new Set(prev.map(t => t.id))
      const toAdd = restored.filter(t => !existing.has(t.id))
      if (!toAdd.length) return prev
      return [...toAdd, ...prev]
    })
  }, [])

  const importTrades = useCallback((newTrades) => {
    setTrades(prev => [...newTrades, ...prev])
  }, [])

  /**
   * importIfNew – used by the live sync to auto-import MT5 trades.
   * Skips any trade whose `id` already exists in the store,
   * AND any trade that matches by (symbol + openTime + closeTime + profit).
   * Returns the count of newly imported trades.
   */
  const importIfNew = useCallback((newTrades) => {
    if (!newTrades?.length) return 0
    let imported = 0
    setTrades(prev => {
      const existingIds  = new Set(prev.map(t => t.id))
      const existingKeys = new Set(
        prev.map(t => `${t.symbol}|${t.openTime}|${t.closeTime}|${t.profit}`)
      )
      const toAdd = newTrades.filter(t => {
        if (existingIds.has(t.id)) return false
        const key = `${t.symbol}|${t.openTime}|${t.closeTime}|${t.profit}`
        if (existingKeys.has(key)) return false
        return true
      })
      imported = toAdd.length
      if (!toAdd.length) return prev
      return [...toAdd, ...prev]
    })
    return imported
  }, [])

  /**
   * Reconcile local trades with a fresh MT5 history list:
   *  - new trades → added
   *  - existing trades (by id) → MT5-sourced fields refreshed
   *    (closeTime, openTime, openPrice, closePrice, profit, commission, swap, type, volume)
   *    User fields (notes, tags, noAutoGroup) are preserved.
   * Returns: { added, updated }.
   */
  const syncFromBackend = useCallback((backendTrades) => {
    if (!backendTrades?.length) return { added: 0, updated: 0 }
    // Compute counts deterministically against the CURRENT state, then update.
    // We can't rely on counters mutated inside setTrades(prev => …) because
    // React StrictMode invokes the updater twice in dev.
    let snapshotAdded = 0, snapshotUpdated = 0
    setTrades(prev => {
      const byId = new Map(prev.map(t => [t.id, t]))
      const result = [...prev]
      let localAdded = 0, localUpdated = 0
      for (const fresh of backendTrades) {
        if (!fresh.id) continue
        const existing = byId.get(fresh.id)
        if (existing) {
          const updatedTrade = {
            ...existing,
            symbol:     fresh.symbol     ?? existing.symbol,
            type:       fresh.type       ?? existing.type,
            volume:     fresh.volume     ?? existing.volume,
            openPrice:  fresh.openPrice  ?? existing.openPrice,
            closePrice: fresh.closePrice ?? existing.closePrice,
            openTime:   fresh.openTime   ?? existing.openTime,
            closeTime:  fresh.closeTime  ?? existing.closeTime,
            profit:     fresh.profit     ?? existing.profit,
            commission: fresh.commission ?? existing.commission,
            swap:       fresh.swap       ?? existing.swap,
            sl:         fresh.sl         ?? existing.sl,
            tp:         fresh.tp         ?? existing.tp,
          }
          const changed = ['closeTime', 'openTime', 'profit', 'closePrice', 'openPrice', 'volume', 'commission', 'swap']
            .some(k => existing[k] !== updatedTrade[k])
          if (changed) {
            const idx = result.findIndex(t => t.id === fresh.id)
            result[idx] = updatedTrade
            localUpdated++
          }
        } else {
          result.unshift(fresh)
          localAdded++
        }
      }
      // Only assign on the first invocation; StrictMode re-runs would just overwrite with same values.
      snapshotAdded   = localAdded
      snapshotUpdated = localUpdated
      return result
    })
    return { added: snapshotAdded, updated: snapshotUpdated }
  }, [])

  const clearAllTrades = useCallback(() => {
    setTrades([])
  }, [])

  /** Auto-Group für diesen Trade an/abschalten */
  const toggleNoAutoGroup = useCallback((id) => {
    setTrades(prev => prev.map(t =>
      t.id === id ? { ...t, noAutoGroup: !t.noAutoGroup } : t
    ))
  }, [])

  /** Manuelle Gruppe aus Trade-IDs erstellen (oder bestehende erweitern) */
  const createManualGroup = useCallback((tradeIds) => {
    if (tradeIds.length < 2) return
    const newIds = new Set(tradeIds)
    setManualGroups(prev => {
      // Prüfe ob diese Trades schon in einer Gruppe sind → zusammenführen
      const existing = prev.filter(g => g.some(id => newIds.has(id)))
      const merged   = new Set([...tradeIds, ...existing.flatMap(g => g)])
      const rest     = prev.filter(g => !g.some(id => newIds.has(id)))
      return [...rest, [...merged]]
    })
  }, [])

  /** Manuelle Gruppe auflösen (alle Mitglieder werden wieder einzeln) */
  const dissolveManualGroup = useCallback((tradeIds) => {
    const keySet = new Set(tradeIds)
    setManualGroups(prev =>
      prev.filter(g => !g.some(id => keySet.has(id)))
    )
  }, [])

  /** Einzelnen Trade aus manueller Gruppe entfernen */
  const removeFromManualGroup = useCallback((tradeId) => {
    setManualGroups(prev =>
      prev
        .map(g => g.filter(id => id !== tradeId))
        .filter(g => g.length >= 2)   // Gruppen mit < 2 Mitgliedern löschen
    )
  }, [])

  const addCustomTag = useCallback((tagName) => {
    const name = tagName.trim()
    if (!name) return
    const exists = allTags.some(t => t.name.toLowerCase() === name.toLowerCase())
    if (!exists) {
      setCustomTags(prev => [...prev, name])
    }
  }, [allTags])

  const getTagStyle = useCallback((tagName) => {
    const found = allTags.find(t => t.name === tagName)
    return found || { name: tagName, color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' }
  }, [allTags])

  return (
    <TradesContext.Provider value={{
      trades,
      effectiveTrades,
      allTags,
      customTags,
      manualGroups,
      addTrade,
      updateTrade,
      deleteTrade,
      deleteTrades,
      restoreTrades,
      importTrades,
      syncFromBackend,
      importIfNew,
      clearAllTrades,
      addCustomTag,
      getTagStyle,
      toggleNoAutoGroup,
      createManualGroup,
      dissolveManualGroup,
      removeFromManualGroup,
    }}>
      {children}
    </TradesContext.Provider>
  )
}

export function useTrades() {
  const ctx = useContext(TradesContext)
  if (!ctx) throw new Error('useTrades must be used within TradesProvider')
  return ctx
}
