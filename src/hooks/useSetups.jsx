import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'tradestats_setups'
const Ctx = createContext(null)

/**
 * Setup = a named playbook entry with rules.
 * { id, name, description, entryRules: [string], exitRules: [string],
 *   targetRR: number, maxRiskPct: number, color, createdAt }
 */
export function SetupsProvider({ children }) {
  const [setups, setSetups] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setups))
  }, [setups])

  const createSetup = useCallback((data) => {
    const newSetup = {
      id:          `setup-${Date.now()}`,
      name:        data.name || 'Unbenanntes Setup',
      description: data.description || '',
      entryRules:  data.entryRules || [],
      exitRules:   data.exitRules || [],
      targetRR:    data.targetRR ?? 2,
      maxRiskPct:  data.maxRiskPct ?? 1,
      color:       data.color || '#3b82f6',
      createdAt:   new Date().toISOString(),
    }
    setSetups(prev => [...prev, newSetup])
    return newSetup
  }, [])

  const updateSetup = useCallback((id, patch) => {
    setSetups(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }, [])

  const deleteSetup = useCallback((id) => {
    setSetups(prev => prev.filter(s => s.id !== id))
  }, [])

  const getSetup = useCallback((id) => setups.find(s => s.id === id), [setups])

  return (
    <Ctx.Provider value={{ setups, createSetup, updateSetup, deleteSetup, getSetup }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSetups() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSetups must be inside SetupsProvider')
  return ctx
}
