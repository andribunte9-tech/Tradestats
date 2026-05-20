/**
 * Trade-Gruppierungs-Logik
 * ─────────────────────────
 * Erkennt zusammenhängende Positionen desselben Symbols
 * (zeitliche Überschneidung oder Abschluss innerhalb von GAP_MS).
 */

export const AUTO_GROUP_GAP_MS = 5 * 60 * 1000  // 5 Minuten

/* ─── Hilfsfunktionen ────────────────────────────────────── */
const ts = (t) =>
  new Date(t.openTime || t.closeTime || 0).getTime()

const closeTs = (t) =>
  new Date(t.closeTime || t.openTime || 0).getTime()

/** Stabiler Gruppen-Key aus sortierten Trade-IDs */
export function groupKey(trades) {
  return trades.map(t => t.id).sort().join('|')
}

/* ─── Gruppen-Stats berechnen ────────────────────────────── */
export function calcGroupStats(groupTrades) {
  const totalVol = groupTrades.reduce((s, t) => s + (t.volume || 0), 0)

  const avgEntry = totalVol > 0
    ? groupTrades.reduce((s, t) => s + (t.openPrice  || 0) * (t.volume || 0), 0) / totalVol
    : (groupTrades[0]?.openPrice  || 0)

  const avgExit = totalVol > 0
    ? groupTrades.reduce((s, t) => s + (t.closePrice || 0) * (t.volume || 0), 0) / totalVol
    : (groupTrades[0]?.closePrice || 0)

  const totalPnl  = groupTrades.reduce((s, t) => s + t.profit + (t.commission || 0) + (t.swap || 0), 0)
  const grossPnl  = groupTrades.reduce((s, t) => s + t.profit, 0)
  const totalCom  = groupTrades.reduce((s, t) => s + (t.commission || 0) + (t.swap || 0), 0)

  const openTimes  = groupTrades.map(t => ts(t)).filter(n => n > 0)
  const closeTimes = groupTrades.map(t => closeTs(t)).filter(n => n > 0)

  const buyVol  = groupTrades.filter(t => t.type === 'BUY') .reduce((s, t) => s + (t.volume || 0), 0)
  const sellVol = groupTrades.filter(t => t.type === 'SELL').reduce((s, t) => s + (t.volume || 0), 0)

  const wins    = groupTrades.filter(t => t.profit > 0)
  const losses  = groupTrades.filter(t => t.profit < 0)
  const gProfit = wins.reduce((s, t) => s + t.profit, 0)
  const gLoss   = Math.abs(losses.reduce((s, t) => s + t.profit, 0))

  return {
    symbol:      groupTrades[0].symbol,
    type:        buyVol >= sellVol ? 'BUY' : 'SELL',
    volume:      parseFloat(totalVol.toFixed(2)),
    avgEntry:    parseFloat(avgEntry.toFixed(5)),
    avgExit:     parseFloat(avgExit.toFixed(5)),
    totalPnl:    parseFloat(totalPnl.toFixed(2)),
    grossPnl:    parseFloat(grossPnl.toFixed(2)),
    commissions: parseFloat(totalCom.toFixed(2)),
    profitFactor: gLoss > 0 ? Math.min(gProfit / gLoss, 99.9) : gProfit > 0 ? Infinity : 0,
    openTime:    openTimes.length  ? new Date(Math.min(...openTimes)).toISOString()  : null,
    closeTime:   closeTimes.length ? new Date(Math.max(...closeTimes)).toISOString() : null,
    count:       groupTrades.length,
    tradeIds:    groupTrades.map(t => t.id),
  }
}

/* ─── Effective Trades für Statistiken ──────────────────── */
/**
 * Wandelt Gruppen in virtuelle Einzel-Trades um.
 * Gruppen zählen als EIN Trade; sub-Trades innerhalb einer Gruppe
 * werden NICHT separat gezählt.
 *
 * Virtuelle Gruppen-Trades haben:
 *   profit     = Summe der Einzel-profits (brutto, ohne Kommission)
 *   commission = Summe aller Kommissionen + Swaps
 *   openTime   = früheste openTime der Gruppe
 *   closeTime  = späteste closeTime der Gruppe
 */
export function buildEffectiveTrades(trades, manualGroups = []) {
  if (!trades.length) return []
  const groups = buildTradeGroups(trades, manualGroups)

  return groups.map(group => {
    // Singleton → Original-Trade unverändert zurückgeben
    if (group.isSingle) return group.trades[0]

    // Gruppe → virtuellen Trade bauen
    const { stats } = group
    return {
      id:         `_grp_${group.key}`,
      symbol:     stats.symbol,
      type:       stats.type,
      volume:     stats.volume,
      openTime:   stats.openTime,
      closeTime:  stats.closeTime,
      openPrice:  stats.avgEntry,
      closePrice: stats.avgExit,
      profit:     stats.grossPnl,       // Brutto (ohne Kommission) → konsistent mit calcStats
      commission: stats.commissions,    // Summe aller Kommissionen + Swaps der Gruppe
      swap:       0,
      tags:       [...new Set(group.trades.flatMap(t => t.tags || []))],
      notes:      group.trades.filter(t => t.notes).map(t => t.notes).join('\n---\n'),
      _virtual:   true,
      _groupKey:  group.key,
    }
  })
}

/* ─── Haupt-Gruppierungsfunktion ─────────────────────────── */
/**
 * Baut Gruppen aus einem gefilterten Trade-Array.
 *
 * @param {object[]} trades        - Gefilterte Trade-Liste
 * @param {string[][]} manualGroups - Manuelle Gruppen [[id,id], [id,id,id], ...]
 * @returns {GroupObject[]}
 *
 * GroupObject = {
 *   key:      string,        // stabiler Key
 *   trades:   Trade[],       // Mitglieder
 *   stats:    GroupStats,
 *   isManual: boolean,
 *   isSingle: boolean,       // nur 1 Trade
 * }
 */
export function buildTradeGroups(trades, manualGroups = []) {
  if (!trades.length) return []

  const result     = []
  const assignedIds = new Set()

  // ── 1. Manuelle Gruppen zuerst ──────────────────────────
  for (const ids of manualGroups) {
    const members = ids.map(id => trades.find(t => t.id === id)).filter(Boolean)
    if (members.length === 0) continue
    members.forEach(t => assignedIds.add(t.id))
    result.push({
      key:      ids.slice().sort().join('|'),
      trades:   members,
      stats:    calcGroupStats(members),
      isManual: true,
      isSingle: members.length === 1,
    })
  }

  // ── 2. Nicht-manuel, nicht-excluded → Auto-Grouping ────
  const remaining = trades.filter(t => !assignedIds.has(t.id) && !t.noAutoGroup)
  const excluded  = trades.filter(t => !assignedIds.has(t.id) &&  t.noAutoGroup)

  // Gruppiere nach Symbol
  const bySymbol = {}
  for (const t of remaining) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = []
    bySymbol[t.symbol].push(t)
  }

  for (const symTrades of Object.values(bySymbol)) {
    // Sortiere nach openTime
    const sorted = [...symTrades].sort((a, b) => ts(a) - ts(b))

    let currentGroup = [sorted[0]]
    let latestClose  = closeTs(sorted[0])

    for (let i = 1; i < sorted.length; i++) {
      const t      = sorted[i]
      const tOpen  = ts(t)
      const tClose = closeTs(t)

      if (tOpen <= latestClose + AUTO_GROUP_GAP_MS) {
        // Überschneidung oder innerhalb des Gaps → zur Gruppe hinzufügen
        currentGroup.push(t)
        if (tClose > latestClose) latestClose = tClose
      } else {
        // Neue Gruppe beginnen
        const grp = currentGroup
        result.push({
          key:      groupKey(grp),
          trades:   grp,
          stats:    calcGroupStats(grp),
          isManual: false,
          isSingle: grp.length === 1,
        })
        currentGroup = [t]
        latestClose  = tClose
      }
    }

    // Letzte Gruppe des Symbols pushen
    result.push({
      key:      groupKey(currentGroup),
      trades:   currentGroup,
      stats:    calcGroupStats(currentGroup),
      isManual: false,
      isSingle: currentGroup.length === 1,
    })
  }

  // ── 3. Excluded Trades: je ein eigener Singleton ────────
  for (const t of excluded) {
    result.push({
      key:      t.id,
      trades:   [t],
      stats:    calcGroupStats([t]),
      isManual: false,
      isSingle: true,
      excluded: true,
    })
  }

  // ── 4. Sortierung: neueste closeTime zuerst ─────────────
  return result.sort((a, b) => {
    const at = a.stats.closeTime ? new Date(a.stats.closeTime).getTime() : 0
    const bt = b.stats.closeTime ? new Date(b.stats.closeTime).getTime() : 0
    return bt - at
  })
}
