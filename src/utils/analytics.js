/**
 * Analytics utilities for advanced trade statistics.
 * Pure functions — all charts/pages consume these.
 */

const netPnl = (t) => (t.profit || 0) + (t.commission || 0) + (t.swap || 0)

/* ─── 13. MFE/MAE — Capture-Rate ──────────────────────────── */
/**
 * Merge backend MFE/MAE archive into trade objects + compute capture rate.
 * mfeArchive: { [tradeId]: { mfe, mae } }
 *
 * Returns per-trade stats AND aggregate:
 *  - captureRate = realized / MFE (only for winning trades with MFE > 0)
 *  - mfeRatio    = MFE / risk (how big was the unrealized peak in R?)
 *  - maeRatio    = MAE / risk (worst drawdown in R)
 */
export function buildMfeMaeAnalysis(trades, mfeArchive, riskAmount = 0) {
  const rows = []
  let totalMfe = 0, totalRealized = 0, sampleSize = 0
  for (const t of trades) {
    const mm = mfeArchive?.[t.id]
    if (!mm || mm.mfe == null) continue
    const realized = netPnl(t)
    const mfe      = mm.mfe
    const mae      = mm.mae
    rows.push({
      id:        t.id,
      symbol:    t.symbol,
      closeTime: t.closeTime,
      realized,
      mfe,
      mae,
      capture:   mfe > 0 ? Math.min(realized / mfe, 1.5) : null,   // cap visual outliers
      mfeR:      riskAmount > 0 ? mfe / riskAmount : null,
      maeR:      riskAmount > 0 ? mae / riskAmount : null,
      giveBack:  mfe > 0 ? mfe - Math.max(realized, 0) : 0,
    })
    if (mfe > 0) {
      totalMfe      += mfe
      totalRealized += Math.max(realized, 0)
      sampleSize++
    }
  }
  const overallCapture = totalMfe > 0 ? totalRealized / totalMfe : null
  return {
    rows: rows.sort((a, b) => new Date(b.closeTime) - new Date(a.closeTime)),
    sampleSize,
    totalMfe,
    totalRealized,
    overallCapture,
    giveBackTotal: rows.reduce((s, r) => s + r.giveBack, 0),
  }
}

/* ─── 14. Best vs Worst Auto-Comparison ──────────────────── */
/**
 * Compare top-N vs bottom-N trades, find features that differ most.
 * Returns insights as an array of {label, top, bottom, delta}.
 */
export function buildBestVsWorst(trades, n = 10) {
  const closed = trades.filter(t => t.closeTime).map(t => ({ ...t, _pnl: netPnl(t) }))
  if (closed.length < n * 2) return null

  const sorted = [...closed].sort((a, b) => b._pnl - a._pnl)
  const top    = sorted.slice(0, n)
  const bottom = sorted.slice(-n)

  function aggregate(arr) {
    const totalPnl = arr.reduce((s, t) => s + t._pnl, 0)
    const wins     = arr.filter(t => t._pnl > 0).length
    const holdMins = arr
      .filter(t => t.openTime && t.closeTime)
      .map(t => (new Date(t.closeTime) - new Date(t.openTime)) / 60000)
    const avgHold  = holdMins.length ? holdMins.reduce((s, n) => s + n, 0) / holdMins.length : 0
    const symbolCounts = {}
    arr.forEach(t => { symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1 })
    const topSymbol = Object.entries(symbolCounts).sort((a, b) => b[1] - a[1])[0]
    const typeCounts = { BUY: 0, SELL: 0 }
    arr.forEach(t => { typeCounts[t.type] = (typeCounts[t.type] || 0) + 1 })
    const avgVolume = arr.reduce((s, t) => s + (t.volume || 0), 0) / arr.length
    // Hour-of-day (UTC for now)
    const hours = arr.filter(t => t.openTime).map(t => new Date(t.openTime).getHours())
    const hourCounts = {}
    hours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1 })
    const topHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]
    // Weekday
    const dayCounts = {}
    arr.filter(t => t.closeTime).forEach(t => {
      const d = new Date(t.closeTime).getDay()
      dayCounts[d] = (dayCounts[d] || 0) + 1
    })
    const topDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]
    // Tags
    const tagCounts = {}
    arr.forEach(t => (t.tags || []).forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1 }))
    const tagsSorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    return {
      totalPnl, winRate: (wins / arr.length) * 100,
      avgHold, avgVolume,
      topSymbol: topSymbol ? topSymbol[0] : '—',
      topSymbolPct: topSymbol ? (topSymbol[1] / arr.length) * 100 : 0,
      typeBuyPct: (typeCounts.BUY / arr.length) * 100,
      topHour: topHour ? Number(topHour[0]) : null,
      topDay: topDay ? Number(topDay[0]) : null,
      tags: tagsSorted,
    }
  }
  const topStats    = aggregate(top)
  const bottomStats = aggregate(bottom)
  return { top: topStats, bottom: bottomStats, topTrades: top, bottomTrades: bottom }
}

/* ─── 15. GitHub-Style Yearly Heatmap ─────────────────────── */
/**
 * Returns 365 daily cells, oldest first, each with pnl + count.
 * Suitable for a 7-row × 53-week grid.
 */
export function buildYearlyHeatmap(trades, days = 365) {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  start.setHours(0, 0, 0, 0)

  const byDay = {}
  for (const t of trades) {
    if (!t.closeTime) continue
    const d = t.closeTime.slice(0, 10)
    if (!byDay[d]) byDay[d] = { pnl: 0, count: 0, wins: 0 }
    byDay[d].pnl   += netPnl(t)
    byDay[d].count += 1
    if (t.profit > 0) byDay[d].wins += 1
  }

  const cells = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key  = d.toISOString().slice(0, 10)
    const data = byDay[key] || { pnl: 0, count: 0, wins: 0 }
    cells.push({
      date:    key,
      dayOfWeek: d.getDay(),
      pnl:     data.pnl,
      count:   data.count,
      wins:    data.wins,
    })
  }
  return cells
}

/* ─── 16. Volatility-Normalized Returns ───────────────────── */
/**
 * Per-symbol volatility (standard deviation of P&L) → normalize returns.
 * "Edge per unit of variance" is what real edge looks like.
 */
export function buildVolatilityNormalized(trades) {
  const bySymbol = {}
  for (const t of trades) {
    if (!t.closeTime) continue
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = []
    bySymbol[t.symbol].push(netPnl(t))
  }
  const rows = Object.entries(bySymbol).map(([symbol, pnls]) => {
    if (pnls.length < 3) return null
    const mean = pnls.reduce((s, n) => s + n, 0) / pnls.length
    const variance = pnls.reduce((s, n) => s + (n - mean) ** 2, 0) / pnls.length
    const std = Math.sqrt(variance) || 0.0001
    const total = pnls.reduce((s, n) => s + n, 0)
    return {
      symbol,
      trades: pnls.length,
      total,
      mean,
      std,
      sharpeLike: mean / std,        // higher = more consistent edge per unit volatility
      winRate: (pnls.filter(n => n > 0).length / pnls.length) * 100,
    }
  }).filter(Boolean).sort((a, b) => b.sharpeLike - a.sharpeLike)
  return rows
}

/* ─── 17. Recovery Factor ──────────────────────────────────── */
/**
 * Recovery Factor = Net Profit / Max Drawdown.
 * Industry-standard score for evaluating a trading system.
 * Recovery 1.0 = profit equals max DD. 3.0+ = strong, 5.0+ = elite.
 */
export function calcRecoveryFactor(trades, startingBalance = 10000) {
  const ulcer = calcUlcerIndex(trades, startingBalance)
  const totalPnl = trades.reduce((s, t) => s + netPnl(t), 0)
  const maxDdAbs = (ulcer.maxDD / 100) * startingBalance
  if (maxDdAbs <= 0) return { recoveryFactor: null, totalPnl, maxDd: 0 }
  return {
    recoveryFactor: totalPnl / maxDdAbs,
    totalPnl,
    maxDd:          maxDdAbs,
    maxDdPct:       ulcer.maxDD,
  }
}

/* ─── 18. Mistake Cost Analysis ──────────────────────────── */
/**
 * Aggregate cost per mistake category.
 * Trades have optional `mistakes: string[]` field.
 */
export const MISTAKE_CATEGORIES = [
  { id: 'early-entry',  label: 'Zu früher Entry',       color: '#f59e0b', emoji: '⏰' },
  { id: 'late-entry',   label: 'Zu später Entry',       color: '#f97316', emoji: '🐢' },
  { id: 'no-sl',        label: 'Kein Stop-Loss',         color: '#ef4444', emoji: '🛑' },
  { id: 'moved-sl',     label: 'Stop verschoben',        color: '#ef4444', emoji: '↔️' },
  { id: 'oversized',    label: 'Position zu groß',       color: '#ef4444', emoji: '🏋️' },
  { id: 'undersized',   label: 'Position zu klein',      color: '#f59e0b', emoji: '🐭' },
  { id: 'fomo',         label: 'FOMO',                   color: '#ef4444', emoji: '😰' },
  { id: 'revenge',      label: 'Revenge-Trade',          color: '#ef4444', emoji: '😤' },
  { id: 'early-exit',   label: 'Zu früh geschlossen',    color: '#f59e0b', emoji: '🏃' },
  { id: 'late-exit',    label: 'Zu spät geschlossen',    color: '#f59e0b', emoji: '🦦' },
  { id: 'news',         label: 'In News reingehandelt',  color: '#f97316', emoji: '📰' },
  { id: 'overtrading',  label: 'Übertrading',            color: '#ef4444', emoji: '🔥' },
  { id: 'no-plan',      label: 'Kein Plan',              color: '#ef4444', emoji: '❓' },
  { id: 'broke-rule',   label: 'Regel gebrochen',        color: '#ef4444', emoji: '💔' },
]

export function buildMistakeAnalysis(trades) {
  const byMistake = {}
  for (const cat of MISTAKE_CATEGORIES) {
    byMistake[cat.id] = { ...cat, count: 0, totalCost: 0, wins: 0, totalPnl: 0 }
  }
  let tradesWithMistakes = 0
  for (const t of trades) {
    if (!t.mistakes?.length) continue
    tradesWithMistakes++
    const pnl = netPnl(t)
    for (const mid of t.mistakes) {
      if (!byMistake[mid]) continue
      byMistake[mid].count++
      byMistake[mid].totalPnl += pnl
      if (pnl < 0) byMistake[mid].totalCost += pnl
      if (pnl > 0) byMistake[mid].wins++
    }
  }
  const rows = Object.values(byMistake)
    .filter(m => m.count > 0)
    .map(m => ({
      ...m,
      avgPnl:  m.count ? m.totalPnl / m.count : 0,
      winRate: m.count ? (m.wins / m.count) * 100 : 0,
    }))
    .sort((a, b) => a.totalCost - b.totalCost)   // worst first

  // Total cost: sum of negative totalPnl across mistake categories (without double-counting)
  // Use trade-level: each trade with at least one mistake contributes its net PnL
  const tradesWithAnyMistake = trades.filter(t => t.mistakes?.length)
  const realizedTotal = tradesWithAnyMistake.reduce((s, t) => s + netPnl(t), 0)
  const cleanTrades = trades.filter(t => !t.mistakes?.length)
  const cleanWinRate = cleanTrades.length
    ? (cleanTrades.filter(t => netPnl(t) > 0).length / cleanTrades.length) * 100
    : 0
  const cleanAvg = cleanTrades.length
    ? cleanTrades.reduce((s, t) => s + netPnl(t), 0) / cleanTrades.length
    : 0
  const dirtyAvg = tradesWithAnyMistake.length
    ? realizedTotal / tradesWithAnyMistake.length
    : 0
  return {
    rows,
    tradesWithMistakes,
    cleanTrades:    cleanTrades.length,
    cleanWinRate,
    cleanAvg,
    dirtyAvg,
    realizedFromMistakes: realizedTotal,
  }
}

/* ─── 19. Coach-Mode Weekly Report ─────────────────────────── */
/**
 * Build narrative report for "this week vs last week".
 * Returns text-paragraph-style insights.
 */
export function buildWeeklyReport(trades) {
  const now = new Date()
  const dow = now.getDay()                                          // 0=Sun
  const offsetToMonday = (dow + 6) % 7
  const thisWeekStart = new Date(now); thisWeekStart.setHours(0, 0, 0, 0); thisWeekStart.setDate(now.getDate() - offsetToMonday)
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(thisWeekStart.getDate() - 7)
  const lastWeekEnd   = new Date(thisWeekStart)

  const inRange = (t, from, to) => {
    if (!t.closeTime) return false
    const d = new Date(t.closeTime)
    return d >= from && d < to
  }
  const thisWeek = trades.filter(t => inRange(t, thisWeekStart, new Date(thisWeekStart.getTime() + 7 * 86400000)))
  const lastWeek = trades.filter(t => inRange(t, lastWeekStart, lastWeekEnd))

  function summarize(arr) {
    const total = arr.reduce((s, t) => s + netPnl(t), 0)
    const wins  = arr.filter(t => netPnl(t) > 0).length
    const best  = arr.reduce((b, t) => netPnl(t) > netPnl(b || { profit: -Infinity, commission: 0, swap: 0 }) ? t : b, null)
    const worst = arr.reduce((b, t) => netPnl(t) < netPnl(b || { profit:  Infinity, commission: 0, swap: 0 }) ? t : b, null)
    return {
      count: arr.length,
      pnl: total,
      winRate: arr.length ? (wins / arr.length) * 100 : 0,
      best, worst,
    }
  }
  const cur  = summarize(thisWeek)
  const prev = summarize(lastWeek)

  const symbolPerf = {}
  thisWeek.forEach(t => { symbolPerf[t.symbol] = (symbolPerf[t.symbol] || 0) + netPnl(t) })
  const topSymbol  = Object.entries(symbolPerf).sort((a, b) => b[1] - a[1])[0]
  const worstSymbol = Object.entries(symbolPerf).sort((a, b) => a[1] - b[1])[0]

  // Mistake highlights this week
  const mistakeTrades = thisWeek.filter(t => t.mistakes?.length)
  const mistakeCost   = mistakeTrades.reduce((s, t) => s + Math.min(0, netPnl(t)), 0)

  return {
    weekStart: thisWeekStart.toISOString().slice(0, 10),
    current: cur,
    previous: prev,
    pnlDelta:    cur.pnl - prev.pnl,
    countDelta:  cur.count - prev.count,
    topSymbol,
    worstSymbol,
    mistakeTrades: mistakeTrades.length,
    mistakeCost,
  }
}

/* ─── 1. Pareto / Equity Contribution ────────────────────── */
/**
 * Sort trades by absolute P&L impact (largest winners first), compute cumulative %.
 * Returns rows ready for a Pareto chart.
 */
export function buildParetoContribution(trades) {
  if (!trades.length) return { rows: [], topNCovers80: 0 }
  const sorted = [...trades]
    .filter(t => t.closeTime)
    .sort((a, b) => netPnl(b) - netPnl(a))
  const total = sorted.reduce((s, t) => s + netPnl(t), 0)
  const positiveTotal = sorted.filter(t => netPnl(t) > 0).reduce((s, t) => s + netPnl(t), 0)
  let running = 0
  const rows = sorted.map((t, i) => {
    running += netPnl(t)
    return {
      idx:      i + 1,
      symbol:   t.symbol,
      closeTime: t.closeTime,
      pnl:      netPnl(t),
      cumulative: running,
      // Anteil am Bruttogewinn (Summe nur der Gewinner-Trades),
      // damit die Kurve sauber von 0% bis 100% läuft und nicht durch Verluste verzerrt wird
      cumulativePct: positiveTotal > 0 ? (running / positiveTotal) * 100 : 0,
    }
  })
  // how many trades cover 80% of total profit?
  let topNCovers80 = 0
  if (positiveTotal > 0) {
    let acc = 0
    for (const t of sorted) {
      if (netPnl(t) <= 0) break
      acc += netPnl(t)
      topNCovers80++
      if (acc / positiveTotal >= 0.8) break
    }
  }
  return { rows, topNCovers80, total, positiveTotal }
}

/* ─── 2. Was-wäre-wenn-Simulator ──────────────────────────── */
/**
 * Recompute equity curve after applying filters (exclude worst N%, weekday, tag, etc.).
 */
export function applyWhatIf(trades, filters) {
  let result = [...trades].filter(t => t.closeTime)

  if (filters.excludeWorstPct > 0 && result.length > 0) {
    const sorted = [...result].sort((a, b) => netPnl(a) - netPnl(b))
    const cut = Math.floor(result.length * filters.excludeWorstPct / 100)
    const excludeIds = new Set(sorted.slice(0, cut).map(t => t.id))
    result = result.filter(t => !excludeIds.has(t.id))
  }
  if (filters.excludeWeekdays?.length) {
    const set = new Set(filters.excludeWeekdays)
    result = result.filter(t => !set.has(new Date(t.closeTime).getDay()))
  }
  if (filters.excludeTags?.length) {
    const set = new Set(filters.excludeTags)
    result = result.filter(t => !(t.tags || []).some(tag => set.has(tag)))
  }
  if (filters.excludeHoldLessThanMin > 0) {
    result = result.filter(t => {
      if (!t.openTime || !t.closeTime) return true
      const mins = (new Date(t.closeTime) - new Date(t.openTime)) / 60000
      return mins >= filters.excludeHoldLessThanMin
    })
  }

  return result
}

/* ─── 3. Hold-Time vs Outcome Scatter ─────────────────────── */
export function buildHoldTimeScatter(trades, riskAmount = 0) {
  return trades
    .filter(t => t.openTime && t.closeTime)
    .map(t => {
      const mins = (new Date(t.closeTime) - new Date(t.openTime)) / 60000
      const pnl  = netPnl(t)
      return {
        id:        t.id,
        symbol:    t.symbol,
        holdMin:   Math.max(mins, 0.1),
        holdH:     mins / 60,
        pnl,
        rMultiple: riskAmount > 0 ? t.profit / riskAmount : 0,
        win:       pnl > 0,
      }
    })
}

/* ─── 4. Streak-Statistik ─────────────────────────────────── */
export function buildStreakStats(trades) {
  const sorted = [...trades]
    .filter(t => t.closeTime)
    .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))

  if (!sorted.length) return null

  let curWin = 0, curLoss = 0
  let maxWin = 0, maxLoss = 0
  const winStreaks = [], lossStreaks = []

  for (const t of sorted) {
    if (t.profit > 0) {
      curWin++
      if (curLoss > 0) { lossStreaks.push(curLoss); curLoss = 0 }
      maxWin = Math.max(maxWin, curWin)
    } else if (t.profit < 0) {
      curLoss++
      if (curWin > 0) { winStreaks.push(curWin); curWin = 0 }
      maxLoss = Math.max(maxLoss, curLoss)
    }
  }
  if (curWin > 0)  winStreaks.push(curWin)
  if (curLoss > 0) lossStreaks.push(curLoss)

  const avg = (arr) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0

  // probability of winning after N consecutive losers
  const condProb = {}
  for (let n = 1; n <= 4; n++) {
    let opps = 0, wins = 0
    for (let i = n; i < sorted.length; i++) {
      const prior = sorted.slice(i - n, i)
      if (prior.every(t => t.profit < 0)) {
        opps++
        if (sorted[i].profit > 0) wins++
      }
    }
    condProb[n] = { opps, wins, rate: opps ? (wins / opps) * 100 : null }
  }

  return {
    maxWin, maxLoss,
    avgWin:  avg(winStreaks),
    avgLoss: avg(lossStreaks),
    streakCount: winStreaks.length + lossStreaks.length,
    condProb,
  }
}

/* ─── 5. Wochentag × Stunde Heatmap ───────────────────────── */
const WEEKDAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export function buildWeekHourHeatmap(trades) {
  // 7 days × 24 hours grid
  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ count: 0, wins: 0, totalPnl: 0 }))
  )
  for (const t of trades) {
    if (!t.openTime) continue
    const d = new Date(t.openTime)
    const day  = d.getDay()
    const hour = d.getHours()
    const cell = grid[day][hour]
    cell.count++
    if (t.profit > 0) cell.wins++
    cell.totalPnl += netPnl(t)
  }
  return {
    grid: grid.map((row, day) => row.map((cell, hour) => ({
      day, hour,
      ...cell,
      winRate: cell.count ? (cell.wins / cell.count) * 100 : null,
      avgPnl:  cell.count ? cell.totalPnl / cell.count : 0,
    }))),
    weekdayLabels: WEEKDAYS_DE,
  }
}

/* ─── 7. Ulcer Index + Recovery Time ──────────────────────── */
/**
 * Ulcer Index = sqrt(mean(drawdown_pct^2))
 * Recovery time = max consecutive days underwater between equity highs.
 */
export function calcUlcerIndex(trades, startingBalance = 10000) {
  const sorted = [...trades]
    .filter(t => t.closeTime)
    .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))
  if (!sorted.length) return { ulcer: 0, maxDD: 0, longestUnderwaterDays: 0, longestUnderwaterTrades: 0 }

  let equity = startingBalance
  let peak   = startingBalance
  let sumSq  = 0
  let maxDD  = 0
  let underwaterTrades = 0
  let longestUnderwaterTrades = 0
  let underwaterStart = null
  let longestUnderwaterDays = 0

  for (const t of sorted) {
    equity += netPnl(t)
    if (equity > peak) {
      peak = equity
      if (underwaterStart) {
        const days = (new Date(t.closeTime) - underwaterStart) / 86400000
        longestUnderwaterDays = Math.max(longestUnderwaterDays, days)
        underwaterStart = null
      }
      longestUnderwaterTrades = Math.max(longestUnderwaterTrades, underwaterTrades)
      underwaterTrades = 0
    } else if (equity < peak) {
      if (!underwaterStart) underwaterStart = new Date(t.closeTime)
      underwaterTrades++
      const ddPct = ((peak - equity) / peak) * 100
      sumSq += ddPct * ddPct
      maxDD = Math.max(maxDD, ddPct)
    }
  }
  if (underwaterStart) {
    const lastTime = new Date(sorted[sorted.length - 1].closeTime)
    longestUnderwaterDays = Math.max(longestUnderwaterDays, (lastTime - underwaterStart) / 86400000)
  }
  longestUnderwaterTrades = Math.max(longestUnderwaterTrades, underwaterTrades)

  return {
    ulcer: Math.sqrt(sumSq / sorted.length),
    maxDD,
    longestUnderwaterDays,
    longestUnderwaterTrades,
  }
}

/* ─── 8. Risk of Ruin ─────────────────────────────────────── */
/**
 * Approximate Risk of Ruin using the binomial model.
 * winRate: 0–1, payoffRatio: avgWin/avgLoss
 * riskPerTrade: fraction of account (e.g. 0.01 = 1%)
 * ruinThreshold: e.g. 0.5 = lose 50% of account
 */
export function calcRiskOfRuin({ winRate, payoffRatio, riskPerTrade, ruinThreshold = 0.5 }) {
  if (winRate <= 0 || winRate >= 1) return winRate <= 0 ? 100 : 0
  if (payoffRatio <= 0)              return 100
  // Edge = E(R) per trade
  const edge = winRate * payoffRatio - (1 - winRate)
  if (edge <= 0) return 100
  // Kelly approximation for ruin probability:
  // RoR ≈ ((1 - edge) / (1 + edge)) ^ (units to ruin)
  const units = Math.floor(ruinThreshold / riskPerTrade)
  const a = (1 - edge) / (1 + edge)
  const ror = Math.pow(Math.max(a, 0), units) * 100
  return Math.min(Math.max(ror, 0), 100)
}

/* ─── 9. Kelly Criterion ──────────────────────────────────── */
export function calcKelly({ winRate, payoffRatio }) {
  if (winRate <= 0 || payoffRatio <= 0) return 0
  // f* = W - (1-W)/R
  const f = winRate - (1 - winRate) / payoffRatio
  return Math.max(0, f) * 100   // percent
}

/* ─── 10. Sequential Trade Correlation (Revenge Trading) ──── */
export function calcSequentialBias(trades) {
  const sorted = [...trades]
    .filter(t => t.closeTime)
    .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))
  if (sorted.length < 2) return null

  let afterWin = { count: 0, wins: 0, totalPnl: 0 }
  let afterLoss = { count: 0, wins: 0, totalPnl: 0 }
  const baseline = { count: 0, wins: 0, totalPnl: 0 }

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    baseline.count++
    if (t.profit > 0) baseline.wins++
    baseline.totalPnl += netPnl(t)
    if (i === 0) continue
    const prev = sorted[i - 1]
    const bucket = prev.profit > 0 ? afterWin : prev.profit < 0 ? afterLoss : null
    if (!bucket) continue
    bucket.count++
    if (t.profit > 0) bucket.wins++
    bucket.totalPnl += netPnl(t)
  }
  const pct = (b) => b.count ? (b.wins / b.count) * 100 : 0
  const avg = (b) => b.count ? b.totalPnl / b.count : 0
  return {
    baseline: { ...baseline, winRate: pct(baseline), avgPnl: avg(baseline) },
    afterWin: { ...afterWin, winRate: pct(afterWin), avgPnl: avg(afterWin) },
    afterLoss:{ ...afterLoss,winRate: pct(afterLoss),avgPnl: avg(afterLoss) },
  }
}

/* ─── 11. Tag-Combo Performance Matrix ────────────────────── */
export function buildTagComboMatrix(trades, minSampleSize = 3) {
  // All unique tags
  const allTags = [...new Set(trades.flatMap(t => t.tags || []))]
  const matrix = {}
  for (const a of allTags) {
    matrix[a] = {}
    for (const b of allTags) {
      const filtered = trades.filter(t => (t.tags || []).includes(a) && (t.tags || []).includes(b))
      if (filtered.length < minSampleSize) { matrix[a][b] = null; continue }
      const wins = filtered.filter(t => t.profit > 0).length
      const totalPnl = filtered.reduce((s, t) => s + netPnl(t), 0)
      matrix[a][b] = {
        count: filtered.length,
        winRate: (wins / filtered.length) * 100,
        avgPnl: totalPnl / filtered.length,
        totalPnl,
      }
    }
  }
  return { tags: allTags, matrix }
}

/* ─── 13. Equity Forecast ────────────────────────────────── */
/**
 * Project future equity based on recent performance.
 * Method:
 *  1. Aggregate daily P&L across all trades in the chosen base period.
 *  2. Compute mean daily P&L and std deviation (across active trading days).
 *  3. Project N days forward: each day adds meanDailyPnl ± confidence bands.
 *
 * `basePeriodDays` — how far back to look for the projection rate (e.g. 30, 90, all)
 * `forecastDays`   — how many calendar days forward to project
 * `startingBalance` — account balance to start the curve from
 */
export function buildEquityForecast({ trades, basePeriodDays, forecastDays, startingBalance, currentEquity, compound = true, targetDailyPct = null }) {
  const sorted = [...trades]
    .filter(t => t.closeTime)
    .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))
  if (!sorted.length) return null

  // Build daily P&L
  const dailyPnl = {}
  for (const t of sorted) {
    const day = t.closeTime.slice(0, 10)
    dailyPnl[day] = (dailyPnl[day] || 0) + (t.profit || 0) + (t.commission || 0) + (t.swap || 0)
  }
  const sortedDays = Object.keys(dailyPnl).sort()
  const totalHistoricalPnl = Object.values(dailyPnl).reduce((s, n) => s + n, 0)

  // If a live currentEquity is supplied (e.g. MT5), anchor the curve so it ends there.
  const effectiveStart = currentEquity != null
    ? currentEquity - totalHistoricalPnl
    : startingBalance

  // Build full daily timeline AND capture equity-at-start-of-day for each trading day
  const firstDay = new Date(sortedDays[0])
  const lastDay  = new Date(sortedDays[sortedDays.length - 1])
  const actual   = []
  const equityBefore = {}   // { 'YYYY-MM-DD': equity BEFORE that day's P&L is applied }
  let equity     = effectiveStart
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    equityBefore[key] = equity
    equity += dailyPnl[key] || 0
    actual.push({ date: key, actual: equity, forecast: null, upper: null, lower: null })
  }

  // Base period for projection
  const cutoff = basePeriodDays
    ? new Date(lastDay.getTime() - basePeriodDays * 86400000)
    : firstDay
  const baseDays = sortedDays.filter(d => new Date(d) >= cutoff)
  const baseTradingDayCount = baseDays.length
  const basePnls = baseDays.map(d => dailyPnl[d])

  // Absolute mean & std (dollar-based)
  const meanDaily = baseTradingDayCount > 0
    ? basePnls.reduce((s, n) => s + n, 0) / baseTradingDayCount
    : 0
  const variance = baseTradingDayCount > 1
    ? basePnls.reduce((s, n) => s + (n - meanDaily) ** 2, 0) / (baseTradingDayCount - 1)
    : 0
  const stdDaily = Math.sqrt(variance)

  // Relative (percentage) mean & std — needed for compound projection
  const baseReturns = baseDays.map(d => {
    const e0 = equityBefore[d]
    return e0 > 0 ? dailyPnl[d] / e0 : 0
  })
  const meanRate = baseReturns.length
    ? baseReturns.reduce((s, n) => s + n, 0) / baseReturns.length
    : 0
  const rateVariance = baseReturns.length > 1
    ? baseReturns.reduce((s, n) => s + (n - meanRate) ** 2, 0) / (baseReturns.length - 1)
    : 0
  const stdRate = Math.sqrt(rateVariance)

  // Realistic-Cap für Compound-Modus: maximal 10% Wachstum pro Trading-Woche (5 Tage).
  // Daraus folgt ein Tages-Cap von (1.10)^(1/5) - 1 ≈ 1.924% — ambitioniert, aber
  // über Jahre durchhaltbar gedacht. Verhindert, dass kleine Konten in der Prognose
  // in absurde Millionen-Bereiche springen, sobald die Stichprobe einen starken
  // Lauf erwischt hat.
  const REALISTIC_WEEKLY_CAP = 0.10   // 10% pro Trading-Woche
  const REALISTIC_DAILY_CAP  = Math.pow(1 + REALISTIC_WEEKLY_CAP, 1 / 5) - 1
  const rawMeanRate = meanRate
  const cappedMeanRate = Math.min(Math.max(meanRate, -REALISTIC_DAILY_CAP), REALISTIC_DAILY_CAP)
  const wasCapped = compound && Math.abs(meanRate) > REALISTIC_DAILY_CAP

  // Trading-day frequency (active days / calendar days in base window)
  let calendarDaysInBase = 0
  if (baseDays.length > 0) {
    const baseStart = new Date(baseDays[0])
    const baseEnd   = lastDay
    calendarDaysInBase = Math.max(1, (baseEnd - baseStart) / 86400000 + 1)
  }
  const tradingDayRate = calendarDaysInBase > 0 ? baseTradingDayCount / calendarDaysInBase : 0

  // Per-calendar-day rates (account for non-trading days)
  const expectedDailyPnl  = meanDaily * tradingDayRate
  const expectedDailyRate = cappedMeanRate * tradingDayRate
  const stdPerCalDay      = stdDaily  * tradingDayRate
  const stdRatePerCalDay  = stdRate   * tradingDayRate

  // Forecast
  const forecast = []
  let projEquity = equity
  let cumVarianceSum = 0   // for linear mode: $-variance
  const lastDate = new Date(lastDay)
  forecast.push({
    date:     lastDate.toISOString().slice(0, 10),
    actual:   equity,
    forecast: equity,
    upper:    equity,
    lower:    equity,
  })
  // Count weekdays elapsed so confidence bands widen only on trading days
  let tradingDaysElapsed = 0
  for (let i = 1; i <= forecastDays; i++) {
    const d = new Date(lastDate.getTime() + i * 86400000)
    const dow = d.getUTCDay()   // 0 = Sun, 6 = Sat
    const isWeekday = dow >= 1 && dow <= 5
    if (isWeekday) {
      tradingDaysElapsed++
      if (compound) {
        // Use per-trading-day rate (not calendar-day) since we only step on weekdays
        // cappedMeanRate verhindert absurde Hochrechnungen (siehe REALISTIC_DAILY_CAP oben)
        projEquity *= (1 + cappedMeanRate)
      } else {
        projEquity += meanDaily
        cumVarianceSum += stdDaily ** 2
      }
    }
    // On weekends, equity stays flat (no growth, no variance accumulation)
    let upper, lower
    if (compound) {
      const sigmaCum = stdRate * Math.sqrt(tradingDaysElapsed)
      upper = projEquity * (1 + sigmaCum)
      lower = projEquity * (1 - sigmaCum)
    } else {
      const projStd = Math.sqrt(cumVarianceSum)
      upper = projEquity + projStd
      lower = projEquity - projStd
    }
    forecast.push({
      date:     d.toISOString().slice(0, 10),
      actual:   null,
      forecast: projEquity,
      upper, lower,
    })
  }

  const combined = [...actual.slice(0, -1), ...forecast]

  // ── Target curve (weekdays only) ──
  // Anchored at effectiveStart so user sees "where they should have been by now".
  // Weekends (Sat/Sun) stay flat — no growth on non-trading days.
  let targetSeries = null
  let targetFinal  = null
  let targetReached = null
  if (targetDailyPct != null && targetDailyPct !== '' && Number(targetDailyPct) !== 0) {
    const tPct = Number(targetDailyPct) / 100
    let tEquity = effectiveStart
    for (const row of combined) {
      // Parse date as UTC midnight for consistent weekday detection
      const d = new Date(row.date + 'T00:00:00Z')
      const dow = d.getUTCDay()   // 0 = Sun, 6 = Sat
      const isWeekday = dow >= 1 && dow <= 5
      if (isWeekday) tEquity = tEquity * (1 + tPct)
      row.target = tEquity
      // Note when actual first reaches or exceeds target (for the "ahead/behind" message)
      if (row.actual != null && targetReached == null && row.actual >= tEquity) {
        targetReached = row.date
      }
    }
    targetSeries = combined.map(r => r.target)
    targetFinal  = tEquity
  }

  const baseForReturn = currentEquity != null ? currentEquity : startingBalance
  // Final-band reference (matches the loop's final iteration — weekdays only)
  const finalSigmaCum = compound
    ? stdRate * Math.sqrt(tradingDaysElapsed)
    : Math.sqrt(cumVarianceSum)
  return {
    combined,
    meanDaily,
    stdDaily,
    meanRate: cappedMeanRate,    // gekappte Rate, die tatsächlich verwendet wurde
    rawMeanRate,                 // historische Rate ohne Cap (zum Vergleich)
    wasCapped,                   // true wenn der Cap gegriffen hat
    realisticCap: REALISTIC_DAILY_CAP,
    realisticWeeklyCap: REALISTIC_WEEKLY_CAP,
    stdRate,
    expectedDailyPnl,
    expectedDailyRate,           // per-calendar-day return rate used in compound mode
    tradingDayRate,
    baseTradingDayCount,
    compound,
    finalEquity: projEquity,
    finalReturn: baseForReturn > 0 ? ((projEquity - baseForReturn) / baseForReturn) * 100 : 0,
    finalProfit: projEquity - equity,
    currentEquity: equity,
    baseReference: baseForReturn,
    upperFinal: compound ? projEquity * (1 + finalSigmaCum) : projEquity + finalSigmaCum,
    lowerFinal: compound ? projEquity * (1 - finalSigmaCum) : projEquity - finalSigmaCum,
    targetEnabled: targetSeries != null,
    targetFinal,
    targetCurrent: targetSeries ? targetSeries[Math.max(0, actual.length - 1)] : null,
  }
}

/* ─── 12. Consistency Score ──────────────────────────────── */
export function calcConsistency(trades) {
  // bucket by month, get returns
  const byMonth = {}
  for (const t of trades) {
    if (!t.closeTime) continue
    const key = t.closeTime.slice(0, 7)
    byMonth[key] = (byMonth[key] || 0) + netPnl(t)
  }
  const months = Object.values(byMonth)
  if (months.length < 2) return null
  const mean = months.reduce((s, n) => s + n, 0) / months.length
  const variance = months.reduce((s, n) => s + (n - mean) ** 2, 0) / months.length
  const std  = Math.sqrt(variance)
  const cv   = mean !== 0 ? std / Math.abs(mean) : null
  // simple Sharpe-like: mean / std
  const sharpe = std > 0 ? (mean / std) : null
  return {
    monthlyReturns: byMonth,
    monthCount: months.length,
    meanMonthly: mean,
    stdMonthly:  std,
    cv,
    sharpe,
    positiveMonths: months.filter(n => n > 0).length,
    negativeMonths: months.filter(n => n < 0).length,
  }
}

/* ─── Average Hold Duration per Day ───────────────────────── */
/**
 * Aggregiert die durchschnittliche Haltedauer (Minuten) je Trading-Tag
 * und berechnet ein 7-Tage-Rolling-Average zur Trend-Erkennung.
 * Liefert {rows, overallAvg, firstHalfAvg, secondHalfAvg, trendPct} zurück,
 * damit die Card direkt eine Drift-Aussage treffen kann.
 */
export function buildAvgHoldByDay(trades) {
  const valid = trades.filter(t => t.openTime && t.closeTime)
  if (!valid.length) return { rows: [], overallAvg: 0, firstHalfAvg: 0, secondHalfAvg: 0, trendPct: 0 }

  const byDay = {}
  for (const t of valid) {
    const day = t.closeTime.slice(0, 10)
    const minutes = (new Date(t.closeTime) - new Date(t.openTime)) / 60000
    if (minutes < 0 || !isFinite(minutes)) continue
    if (!byDay[day]) byDay[day] = { total: 0, count: 0 }
    byDay[day].total += minutes
    byDay[day].count++
  }

  const sortedDays = Object.keys(byDay).sort()
  const rows = sortedDays.map(day => ({
    date: day,
    avgMinutes: byDay[day].total / byDay[day].count,
    count: byDay[day].count,
  }))

  // Rolling 7-Day Average — geglättete Linie zum Trend-Lesen
  const window = 7
  for (let i = 0; i < rows.length; i++) {
    const slice = rows.slice(Math.max(0, i - window + 1), i + 1)
    const totalMin = slice.reduce((s, r) => s + r.avgMinutes * r.count, 0)
    const totalCnt = slice.reduce((s, r) => s + r.count, 0)
    rows[i].rolling7 = totalCnt > 0 ? totalMin / totalCnt : 0
  }

  // Drift: erste vs. zweite Hälfte
  const overallMins = valid.map(t => (new Date(t.closeTime) - new Date(t.openTime)) / 60000)
  const overallAvg = overallMins.reduce((s, n) => s + n, 0) / overallMins.length
  const mid = Math.floor(rows.length / 2)
  const half = (arr) => {
    if (!arr.length) return 0
    const totalMin = arr.reduce((s, r) => s + r.avgMinutes * r.count, 0)
    const totalCnt = arr.reduce((s, r) => s + r.count, 0)
    return totalCnt > 0 ? totalMin / totalCnt : 0
  }
  const firstHalfAvg  = half(rows.slice(0, mid))
  const secondHalfAvg = half(rows.slice(mid))
  const trendPct = firstHalfAvg > 0
    ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
    : 0

  return { rows, overallAvg, firstHalfAvg, secondHalfAvg, trendPct }
}

/* ─── Empirischer Dollar-Notional pro Trade ───────────────── */
/**
 * Schätzt den realen Dollar-Gegenwert (Notional) eines Trades —
 * instrumentübergreifend vergleichbar. Kontraktgrößen variieren massiv
 * (Aktie vs. Index-CFD vs. FX) und werden von MT5 historisch nicht
 * geliefert, daher leiten wir den $-Wert pro Preis-Punkt EMPIRISCH aus
 * den eigenen Fills ab:
 *
 *   profit = volume × priceMove × pointValue
 *      ⟹  pointValue = profit / (volume × priceMove)
 *
 * Dann ist notional = volume × openPrice × pointValue. Der Median pro
 * Symbol macht das robust gegen Commission/Swap-Rauschen und Ausreißer.
 * Self-calibrating, keine hardcodierten Kontraktgrößen.
 *
 * Beispiel-Validierung (echte User-Fills):
 *   AVGO  BUY 409.55→412.19, 4.2 lot, +$11.09 → pv = 11.09/(4.2×2.64) ≈ 1.0
 *   NAS100 BUY +147 Punkte, 0.3 lot, +$44.19  → pv = 44.19/(0.3×147.3) ≈ 1.0
 * → notional AVGO ≈ $1.720, NAS100 ≈ $9.087 (echte, vergleichbare Beträge).
 */
export function buildSymbolPointValues(trades) {
  const bySym = {}
  for (const t of trades) {
    if (!t.symbol || !(t.volume > 0) || !(t.openPrice > 0) || t.closePrice == null) continue
    const isSell = /sell/i.test(t.type || '')
    const move = isSell ? (t.openPrice - t.closePrice) : (t.closePrice - t.openPrice)
    if (Math.abs(move) < 1e-9) continue
    const gross = t.profit || 0
    if (gross === 0) continue
    const pv = gross / (t.volume * move)
    if (!isFinite(pv) || pv <= 0) continue
    if (!bySym[t.symbol]) bySym[t.symbol] = []
    bySym[t.symbol].push(pv)
  }
  const out = {}
  for (const [sym, arr] of Object.entries(bySym)) {
    arr.sort((a, b) => a - b)
    out[sym] = arr[Math.floor(arr.length / 2)] // Median
  }
  return out
}

// Fallback-Notional wenn kein empirischer Point-Value ableitbar ist
// (z.B. Symbol ohne closePrice oder ohne Bewegung): grobe Heuristik wie im
// Risk-Tab — FX (6-stellig) = volume × 100k, sonst volume × openPrice.
function fallbackNotional(t) {
  const isFx = /^[A-Z]{6}(\.[a-z]+)?$/.test(t.symbol || '')
  if (isFx) return t.volume * 100_000
  return t.volume * (t.openPrice || 0)
}

function tradeNotional(t, pvMap) {
  const pv = pvMap[t.symbol]
  if (pv && t.openPrice > 0) return t.volume * t.openPrice * pv
  return fallbackNotional(t)
}

/* ─── Position-Sizing-Konsistenz ──────────────────────────── */
/**
 * Untersucht, ob die Positionsgröße je nach vorherigem Ergebnis
 * variiert — klassischer Indikator für Revenge-Sizing oder Übermut.
 *
 * WICHTIG: gemessen wird das reale DOLLAR-RISIKO (Notional via
 * buildSymbolPointValues), NICHT die rohe Lot-Größe — Lot ist über
 * Instrumente nicht vergleichbar (0.3 Lot Gold ≠ 10 Lot Aktie ≠ 0.1 FX).
 * Der angezeigte Faktor "1.3× üblich" heißt: 30% mehr Dollar-Exposure als
 * dein typischer Trade, instrumentübergreifend.
 *
 * Buckets:
 *  - opening:    erster Trade eines Tages (kein Vorgänger)
 *  - afterWin:   direkt nach einem Gewinner
 *  - afterLoss:  direkt nach einem Verlierer
 *  - after2Loss: direkt nach 2+ Verlierern in Folge
 *  - afterBigLoss: nach einem Verlust > 1.5× durchschnittlicher Verlust
 */
export function buildSizingConsistency(trades) {
  const sorted = [...trades]
    .filter(t => t.closeTime && t.openTime && t.volume > 0)
    .sort((a, b) => new Date(a.openTime) - new Date(b.openTime))
  if (sorted.length < 5) return null

  // Reales Dollar-Notional pro Trade (instrumentübergreifend vergleichbar),
  // empirisch aus den eigenen Fills kalibriert. relSize = notional eines
  // Trades; die Bucket-Abweichung misst damit echtes Auf-/Absizen des
  // Kapitaleinsatzes, nicht den Instrument-Mix.
  const pvMap = buildSymbolPointValues(sorted)
  const relSize = (t) => tradeNotional(t, pvMap)

  const avgLoss = (() => {
    const losses = sorted.filter(t => t.profit < 0).map(t => Math.abs(t.profit))
    return losses.length ? losses.reduce((s, n) => s + n, 0) / losses.length : 0
  })()

  const buckets = {
    opening:      { factors: [], wins: 0, count: 0, pnl: 0 },
    afterWin:     { factors: [], wins: 0, count: 0, pnl: 0 },
    afterLoss:    { factors: [], wins: 0, count: 0, pnl: 0 },
    after2Loss:   { factors: [], wins: 0, count: 0, pnl: 0 },
    afterBigLoss: { factors: [], wins: 0, count: 0, pnl: 0 },
  }

  let consecutiveLosses = 0
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    const prev = i > 0 ? sorted[i - 1] : null
    const sameDay = prev && t.openTime.slice(0, 10) === prev.openTime.slice(0, 10)

    let bucketName
    if (!prev || !sameDay) {
      bucketName = 'opening'
    } else if (prev.profit > 0) {
      bucketName = 'afterWin'
    } else if (prev.profit < 0) {
      if (avgLoss > 0 && Math.abs(prev.profit) > avgLoss * 1.5) {
        bucketName = 'afterBigLoss'
      } else if (consecutiveLosses >= 2) {
        bucketName = 'after2Loss'
      } else {
        bucketName = 'afterLoss'
      }
    } else {
      bucketName = 'afterWin'  // break-even handled as neutral
    }

    const b = buckets[bucketName]
    b.factors.push(relSize(t))
    b.count++
    if (t.profit > 0) b.wins++
    b.pnl += netPnl(t)

    if (t.profit < 0) consecutiveLosses++
    else if (t.profit > 0) consecutiveLosses = 0
  }

  // overallAvg ist das durchschnittliche Dollar-Notional über ALLE Trades.
  const allNotionals = sorted.map(relSize)
  const overallAvg = allNotionals.reduce((s, n) => s + n, 0) / allNotionals.length

  const result = Object.entries(buckets).map(([id, b]) => {
    if (b.count === 0) return { id, count: 0, avgFactor: 0, avgNotional: 0, winRate: 0, pnl: 0, deviationPct: 0 }
    const avgNotional = b.factors.reduce((s, n) => s + n, 0) / b.factors.length
    // Faktor = Bucket-Exposure relativ zum Gesamt-Schnitt (1.0 = wie üblich).
    const avgFactor = overallAvg > 0 ? avgNotional / overallAvg : 1
    const deviationPct = overallAvg > 0 ? ((avgNotional - overallAvg) / overallAvg) * 100 : 0
    return {
      id,
      count: b.count,
      avgFactor,
      avgNotional,
      winRate: (b.wins / b.count) * 100,
      pnl: b.pnl,
      deviationPct,
    }
  })

  // Maximale Abweichung in beide Richtungen (für Risiko-Bewertung)
  const maxDeviation = Math.max(...result.filter(r => r.count >= 3).map(r => Math.abs(r.deviationPct)), 0)

  return {
    overallAvgFactor: 1, // Referenz: alle Buckets sind relativ zu 1.0× normiert
    overallAvgNotional: overallAvg,
    buckets: result,
    maxDeviation,
  }
}

/* ─── Konkurrierende offene Positionen + Symbol-Cluster ──── */
/**
 * Misst, wie viele Positionen typischerweise gleichzeitig offen sind,
 * und identifiziert häufige Symbol-Kombinationen.
 * Wichtig für versteckte Korrelations-Cluster: 3x Long-USD-Pairs sind
 * de facto ein einziger Trade mit 3x Risiko.
 */
export function buildConcurrentPositions(trades) {
  const valid = trades.filter(t => t.openTime && t.closeTime)
  if (valid.length < 2) return null

  // Sample-based: für jede Trade-Öffnung wird gezählt, wie viele
  // andere Trades zu diesem Zeitpunkt offen waren.
  const concurrentCounts = []
  const overlapPairs = {}   // "SYMA|SYMB" -> count
  const overlapSeconds = {}   // "SYMA|SYMB" -> total overlap in ms

  for (let i = 0; i < valid.length; i++) {
    const t = valid[i]
    const tOpen  = new Date(t.openTime).getTime()
    const tClose = new Date(t.closeTime).getTime()
    let concurrent = 0
    for (let j = 0; j < valid.length; j++) {
      if (i === j) continue
      const u = valid[j]
      const uOpen  = new Date(u.openTime).getTime()
      const uClose = new Date(u.closeTime).getTime()
      const overlap = Math.min(tClose, uClose) - Math.max(tOpen, uOpen)
      if (overlap > 0) {
        if (uOpen <= tOpen && uClose > tOpen) concurrent++   // u war beim Öffnen von t bereits offen
        if (t.symbol !== u.symbol && j > i) {   // Symbol-Paar nur einmal zählen
          const key = [t.symbol, u.symbol].sort().join('|')
          overlapPairs[key]   = (overlapPairs[key]   || 0) + 1
          overlapSeconds[key] = (overlapSeconds[key] || 0) + overlap
        }
      }
    }
    concurrentCounts.push(concurrent)
  }

  const avgConcurrent = concurrentCounts.reduce((s, n) => s + n, 0) / concurrentCounts.length
  const maxConcurrent = Math.max(...concurrentCounts, 0)
  const soloTradesPct = (concurrentCounts.filter(n => n === 0).length / concurrentCounts.length) * 100

  // Top Symbol-Paare nach Häufigkeit
  const topPairs = Object.entries(overlapPairs)
    .map(([key, count]) => {
      const [a, b] = key.split('|')
      return { symbolA: a, symbolB: b, count, overlapHours: (overlapSeconds[key] || 0) / 3_600_000 }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return {
    avgConcurrent,
    maxConcurrent,
    soloTradesPct,
    topPairs,
    totalTrades: valid.length,
  }
}

/* ─── Trading-Frequenz-Trend ──────────────────────────────── */
/**
 * Anzahl Trades pro Tag mit 7-Tage-Rolling-Average und gleichzeitiger
 * Win-Rate. Wenn die Frequenz steigt UND die Win-Rate fällt, ist das
 * ein klassisches Overtrading-Symptom.
 */
export function buildTradingFrequency(trades) {
  const valid = trades.filter(t => t.closeTime)
  if (!valid.length) return null

  const byDay = {}
  for (const t of valid) {
    const day = t.closeTime.slice(0, 10)
    if (!byDay[day]) byDay[day] = { trades: 0, wins: 0, pnl: 0 }
    byDay[day].trades++
    if (t.profit > 0) byDay[day].wins++
    byDay[day].pnl += netPnl(t)
  }

  const sortedDays = Object.keys(byDay).sort()
  const rows = sortedDays.map(d => ({
    date: d,
    trades: byDay[d].trades,
    winRate: byDay[d].trades > 0 ? (byDay[d].wins / byDay[d].trades) * 100 : 0,
    pnl: byDay[d].pnl,
  }))

  // 7-Tage-Rolling
  const window = 7
  for (let i = 0; i < rows.length; i++) {
    const slice = rows.slice(Math.max(0, i - window + 1), i + 1)
    const totalTrades = slice.reduce((s, r) => s + r.trades, 0)
    const totalWins   = slice.reduce((s, r) => s + (r.winRate / 100) * r.trades, 0)
    rows[i].rollingFreq    = totalTrades / slice.length
    rows[i].rollingWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0
  }

  // Drift: erste vs. zweite Hälfte
  const mid = Math.floor(rows.length / 2)
  const halfFreq = (arr) => arr.length ? arr.reduce((s, r) => s + r.trades, 0) / arr.length : 0
  const halfWR   = (arr) => {
    const total = arr.reduce((s, r) => s + r.trades, 0)
    const wins  = arr.reduce((s, r) => s + (r.winRate / 100) * r.trades, 0)
    return total > 0 ? (wins / total) * 100 : 0
  }
  const firstHalfFreq = halfFreq(rows.slice(0, mid))
  const secondHalfFreq = halfFreq(rows.slice(mid))
  const firstHalfWR   = halfWR(rows.slice(0, mid))
  const secondHalfWR  = halfWR(rows.slice(mid))

  const freqTrendPct = firstHalfFreq > 0 ? ((secondHalfFreq - firstHalfFreq) / firstHalfFreq) * 100 : 0
  const wrTrendPct   = firstHalfWR > 0 ? secondHalfWR - firstHalfWR : 0

  // Overtrading-Warnung: Frequenz steigt UND Win-Rate fällt
  const overtradingFlag = freqTrendPct > 15 && wrTrendPct < -3

  return {
    rows,
    avgTradesPerDay: valid.length / sortedDays.length,
    firstHalfFreq, secondHalfFreq, freqTrendPct,
    firstHalfWR, secondHalfWR, wrTrendPct,
    overtradingFlag,
  }
}

/* ─── MAE-basiertes Risiko (für Trader ohne fixen SL) ─────── */
/**
 * Konzept A: statt eines theoretischen "1% Risiko pro Trade" misst diese
 * Funktion das realisierte Risiko über die Maximum Adverse Excursion (MAE) —
 * also wie tief jeder Trade tatsächlich im Drawdown war.
 *
 * Gibt zurück:
 *  - rows:           Trade-Liste mit MAE in $, % vom Konto, R-MAE-Multiple
 *  - avgMaeAbs/Pct:  Durchschnittlicher MAE-Wert
 *  - p95MaeAbs/Pct:  95. Perzentil — "schlimmer wurde es nur in 5% der Fälle"
 *  - maxMaeAbs/Pct:  worst case
 *  - histogram:      Verteilung in %-Buckets
 *  - recoveryRate:   Anteil der Trades, die aus negativem MAE in den Gewinn gerettet wurden
 *  - giveBackRate:   Anteil der Trades, die positives MFE hatten, aber als Verlust schlossen
 */
export function buildMaeRiskStats(trades, mfeArchive, accountBalance = 10000) {
  const rows = []
  for (const t of trades) {
    const mm = mfeArchive?.[t.id]
    if (!mm || mm.mae == null) continue
    const maeAbs = Math.abs(mm.mae)   // immer positiv darstellen
    const realized = (t.profit || 0) + (t.commission || 0) + (t.swap || 0)
    rows.push({
      id: t.id,
      symbol: t.symbol,
      closeTime: t.closeTime,
      maeAbs,
      maePct: accountBalance > 0 ? (maeAbs / accountBalance) * 100 : 0,
      mfe: mm.mfe || 0,
      realized,
      isWin: realized > 0,
      recovered: mm.mae < 0 && realized > 0,           // war negativ, schloss als Gewinn
      gaveBack: (mm.mfe || 0) > 0 && realized < 0,     // war positiv, schloss als Verlust
    })
  }
  if (!rows.length) return null

  const sortedMae = [...rows].map(r => r.maeAbs).sort((a, b) => a - b)
  const p = (q) => sortedMae[Math.min(sortedMae.length - 1, Math.floor(sortedMae.length * q))]

  const avgMaeAbs = sortedMae.reduce((s, n) => s + n, 0) / sortedMae.length
  const maxMaeAbs = sortedMae[sortedMae.length - 1]
  const p50MaeAbs = p(0.5)
  const p95MaeAbs = p(0.95)

  // Histogramm in %-Buckets
  const buckets = [
    { label: '< 0.5%',  min: 0,    max: 0.5,  count: 0, color: '#10b981' },
    { label: '0.5–1%',  min: 0.5,  max: 1,    count: 0, color: '#84cc16' },
    { label: '1–2%',    min: 1,    max: 2,    count: 0, color: '#f59e0b' },
    { label: '2–3%',    min: 2,    max: 3,    count: 0, color: '#f97316' },
    { label: '3–5%',    min: 3,    max: 5,    count: 0, color: '#ef4444' },
    { label: '> 5%',    min: 5,    max: Infinity, count: 0, color: '#991b1b' },
  ]
  for (const r of rows) {
    const b = buckets.find(b => r.maePct >= b.min && r.maePct < b.max)
    if (b) b.count++
  }

  const recoveredCount = rows.filter(r => r.recovered).length
  const negMaeCount    = rows.filter(r => r.maeAbs > 0 && !r.isWin || r.recovered).length || rows.length
  const giveBackCount  = rows.filter(r => r.gaveBack).length
  const winsWithMfeCount = rows.filter(r => (r.mfe || 0) > 0).length

  // R-MAE-Multiple: realisierter P&L geteilt durch den eigenen MAE
  // (statt fixem $-Risiko). Sehr ehrlich: "wie viel hast du mitgenommen,
  // gemessen am Schmerz, den du durchgestanden hast?"
  const rMaeMultiples = rows.map(r => r.maeAbs > 0 ? r.realized / r.maeAbs : 0)
  const avgRMae = rMaeMultiples.length ? rMaeMultiples.reduce((s, n) => s + n, 0) / rMaeMultiples.length : 0

  return {
    rows: rows.sort((a, b) => b.maeAbs - a.maeAbs),
    avgMaeAbs,
    avgMaePct:  accountBalance > 0 ? (avgMaeAbs / accountBalance) * 100 : 0,
    p50MaeAbs,
    p50MaePct:  accountBalance > 0 ? (p50MaeAbs / accountBalance) * 100 : 0,
    p95MaeAbs,
    p95MaePct:  accountBalance > 0 ? (p95MaeAbs / accountBalance) * 100 : 0,
    maxMaeAbs,
    maxMaePct:  accountBalance > 0 ? (maxMaeAbs / accountBalance) * 100 : 0,
    histogram:  buckets,
    sampleSize: rows.length,
    recoveryRate: negMaeCount > 0 ? (recoveredCount / rows.length) * 100 : 0,
    giveBackRate: winsWithMfeCount > 0 ? (giveBackCount / winsWithMfeCount) * 100 : 0,
    avgRMae,
  }
}

/* ─── Margin-/Exposure-Risiko (Konzept B) ─────────────────── */
/**
 * Schätzt Margin-Belegung und Notional-Exposure pro Trade — wichtig, wenn
 * ohne Stop-Loss getradet wird, da das eigentliche Risiko dann durch
 * Hebel-Belegung definiert ist (Margin-Call-Distanz).
 *
 * Notional wird über buildSymbolPointValues/tradeNotional ermittelt: der
 * $-Wert pro Punkt wird empirisch aus den eigenen Fills kalibriert, was
 * Kontraktgröße UND Fremdwährung (z.B. JPY-notierter Nikkei225) automatisch
 * korrekt in Kontowährung umrechnet. Fällt auf eine grobe Heuristik zurück,
 * wenn für ein Symbol kein Point-Value ableitbar ist.
 */
export function buildMarginExposure(trades, { leverage = 100, accountBalance = 10000 } = {}) {
  const valid = trades.filter(t => t.openPrice > 0 && t.volume > 0)
  if (!valid.length) return null

  // Notional = realer Dollar-Gegenwert, empirisch aus den eigenen Fills
  // kalibriert (siehe buildSymbolPointValues). Das löst sowohl die
  // Kontraktgrößen- als auch die Fremdwährungs-Frage automatisch: der
  // $/Punkt wird aus profit (Kontowährung) rückgerechnet, daher ist z.B.
  // ein in JPY notierter Nikkei225 bereits korrekt in USD umgerechnet.
  // Fallback (tradeNotional): FX 6-stellig = vol×100k, sonst vol×price.
  const pvMap = buildSymbolPointValues(trades)

  const enriched = valid.map(t => {
    const notional  = tradeNotional(t, pvMap)
    const margin    = notional / leverage
    const marginPct = accountBalance > 0 ? (margin / accountBalance) * 100 : 0
    return {
      ...t,
      notional,
      margin,
      marginPct,
    }
  })

  // Sample-based: durchschnittliche gleichzeitig belegte Margin
  // (für jeden Eröffnungs-Zeitpunkt zähle ich offene Trades und ihre Margins)
  const sortedByOpen = [...enriched]
    .filter(t => t.openTime && t.closeTime)
    .sort((a, b) => new Date(a.openTime) - new Date(b.openTime))

  let maxConcurrentMargin = 0
  let totalMarginHours = 0
  for (const t of sortedByOpen) {
    const tOpen = new Date(t.openTime).getTime()
    const tClose = new Date(t.closeTime).getTime()
    const concurrentMargin = sortedByOpen.reduce((sum, u) => {
      const uOpen = new Date(u.openTime).getTime()
      const uClose = new Date(u.closeTime).getTime()
      // u ist beim Öffnen von t bereits offen
      if (uOpen <= tOpen && uClose > tOpen) return sum + u.margin
      return sum
    }, 0)
    if (concurrentMargin > maxConcurrentMargin) maxConcurrentMargin = concurrentMargin
    const hours = (tClose - tOpen) / 3_600_000
    totalMarginHours += t.margin * hours
  }

  const margins = enriched.map(t => t.margin)
  const sortedMargins = [...margins].sort((a, b) => a - b)
  const p = (q) => sortedMargins[Math.min(sortedMargins.length - 1, Math.floor(sortedMargins.length * q))]

  const avgMargin = margins.reduce((s, n) => s + n, 0) / margins.length
  const avgMarginPct = accountBalance > 0 ? (avgMargin / accountBalance) * 100 : 0
  const maxConcurrentMarginPct = accountBalance > 0 ? (maxConcurrentMargin / accountBalance) * 100 : 0

  // Liquidationsdistanz-Schätzung (sehr grob):
  // Wenn der Kontostand bei maxConcurrentMargin × leverage gehebelt ist,
  // löst ein Adverse Move von ~(equity / notional) × 100% Liquidation aus.
  // Für ein einzelnes Beispiel auf Basis des Durchschnitts:
  const avgNotional = enriched.reduce((s, t) => s + t.notional, 0) / enriched.length
  const liquidationMovePct = avgNotional > 0 ? (accountBalance / avgNotional) * 100 : 0

  // Sizing-Konsistenz: Variations-Koeffizient des Dollar-NOTIONALS (nicht
  // roher Lot — Lot ist über Instrumente unvergleichbar, 14 Lot Nikkei vs
  // 0.1 Lot FX würden sonst ein Riesen-CV vortäuschen).
  const meanVol = enriched.reduce((s, t) => s + t.notional, 0) / enriched.length
  const stdVol = Math.sqrt(enriched.reduce((s, t) => s + (t.notional - meanVol) ** 2, 0) / enriched.length)
  const volumeCV = meanVol > 0 ? stdVol / meanVol : 0

  return {
    leverage,
    avgMargin,
    avgMarginPct,
    p50Margin: p(0.5),
    p95Margin: p(0.95),
    maxMargin: sortedMargins[sortedMargins.length - 1],
    maxConcurrentMargin,
    maxConcurrentMarginPct,
    totalMarginHours,
    avgNotional,
    liquidationMovePct,
    volumeCV,
    rows: enriched.sort((a, b) => b.margin - a.margin).slice(0, 10),
    sampleSize: enriched.length,
  }
}

/* ─── AI Coach — Aggregierte Insights ─────────────────────── */
/**
 * Build a list of coaching insights from trade data.
 * Each insight: { severity: 'good'|'warn'|'bad'|'tip', title, message }
 */
/**
 * Generiert eine Liste von Insights als Übersetzungs-Keys + Variablen.
 * Die UI kümmert sich um die eigentliche Sprach-Übersetzung — diese Funktion
 * macht nur die numerische Auswertung.
 *
 * Rückgabeformat: { severity, titleKey, messageKey, vars }
 */
export function buildCoachInsights(trades, { stats, pareto, streak, mfeMae, sequence, consistency, recovery, ror } = {}) {
  const insights = []
  if (!trades.length) return insights
  const push = (severity, titleKey, messageKey, vars = {}) =>
    insights.push({ severity, titleKey, messageKey, vars })

  // ── Win Rate ──
  if (stats?.winRate != null && stats.totalTrades >= 10) {
    if (stats.winRate >= 60) {
      push('good', 'ci.high_wr.title', 'ci.high_wr.body', { wr: stats.winRate.toFixed(0), n: stats.totalTrades })
    } else if (stats.winRate < 40) {
      push('warn', 'ci.low_wr.title', 'ci.low_wr.body', { wr: stats.winRate.toFixed(0) })
    }
  }

  // ── Profit Factor ──
  if (stats?.profitFactor != null && stats.totalTrades >= 10) {
    const pf = stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)
    if (stats.profitFactor >= 2) {
      push('good', 'ci.strong_pf.title', 'ci.strong_pf.body', { pf })
    } else if (stats.profitFactor < 1 && stats.profitFactor > 0) {
      push('bad', 'ci.weak_pf.title', 'ci.weak_pf.body')
    } else if (stats.profitFactor < 1.3 && stats.profitFactor >= 1) {
      push('tip', 'ci.thin_pf.title', 'ci.thin_pf.body', { pf })
    }
  }

  // ── Avg R:R ──
  if (stats?.avgWin && stats?.avgLoss) {
    const rr = stats.avgWin / stats.avgLoss
    if (rr < 1) {
      push('warn', 'ci.bad_rr.title', 'ci.bad_rr.body', { win: stats.avgWin.toFixed(0), loss: stats.avgLoss.toFixed(0) })
    } else if (rr >= 2) {
      push('good', 'ci.good_rr.title', 'ci.good_rr.body', { rr: rr.toFixed(1) })
    }
  }

  // ── Pareto-Konzentration ──
  if (pareto?.topNCovers80 != null && trades.length >= 20) {
    const concentration = pareto.topNCovers80 / trades.length
    if (concentration < 0.1) {
      push('warn', 'ci.narrow_edge.title', 'ci.narrow_edge.body', { n: pareto.topNCovers80, total: trades.length, pct: (concentration * 100).toFixed(0) })
    } else if (concentration > 0.3) {
      push('good', 'ci.broad_edge.title', 'ci.broad_edge.body', { n: pareto.topNCovers80, total: trades.length })
    }
  }

  // ── Sequenz-Bias (Tilt) ──
  if (sequence?.afterWin && sequence?.afterLoss && sequence.afterLoss.count >= 5 && sequence.afterWin.count >= 5) {
    const wrDiff = sequence.afterWin.winRate - sequence.afterLoss.winRate
    if (sequence.afterLoss.winRate < sequence.afterWin.winRate - 15) {
      push('bad', 'ci.tilt.title', 'ci.tilt.body', {
        win:  sequence.afterWin.winRate.toFixed(0),
        loss: sequence.afterLoss.winRate.toFixed(0),
        diff: wrDiff.toFixed(0),
      })
    } else if (Math.abs(wrDiff) < 5) {
      push('good', 'ci.steady.title', 'ci.steady.body', {
        loss: sequence.afterLoss.winRate.toFixed(0),
        win:  sequence.afterWin.winRate.toFixed(0),
      })
    }
  }

  // ── MFE / Capture-Rate ──
  if (mfeMae?.overallCapture != null && mfeMae.sampleSize >= 10) {
    const cap = mfeMae.overallCapture
    if (cap < 0.4) {
      push('warn', 'ci.low_capture.title', 'ci.low_capture.body', { pct: (cap * 100).toFixed(0) })
    } else if (cap >= 0.7) {
      push('good', 'ci.high_capture.title', 'ci.high_capture.body', { pct: (cap * 100).toFixed(0) })
    }
  }

  // ── Consistency ──
  if (consistency?.cv != null && consistency.monthCount >= 3) {
    if (consistency.cv > 2) {
      push('tip', 'ci.volatile_months.title', 'ci.volatile_months.body', { cv: consistency.cv.toFixed(2) })
    } else if (consistency.cv < 1 && consistency.cv > 0 && consistency.positiveMonths > consistency.negativeMonths) {
      push('good', 'ci.consistent_returns.title', 'ci.consistent_returns.body', { cv: consistency.cv.toFixed(2), greens: consistency.positiveMonths })
    }
  }

  // ── Recovery Factor ──
  if (recovery?.recoveryFactor != null && stats?.totalTrades >= 20) {
    if (recovery.recoveryFactor < 1) {
      push('bad', 'ci.low_recovery.title', 'ci.low_recovery.body', { rf: recovery.recoveryFactor.toFixed(2) })
    } else if (recovery.recoveryFactor >= 5) {
      push('good', 'ci.high_recovery.title', 'ci.high_recovery.body', { rf: recovery.recoveryFactor.toFixed(1) })
    }
  }

  // ── Risk of Ruin ──
  if (ror?.ror != null && ror.ror > 0.1) {
    push('bad', 'ci.high_ror.title', 'ci.high_ror.body', { pct: (ror.ror * 100).toFixed(1) })
  }

  // ── Lange Verlierer-Serie ──
  if (streak?.maxLoss != null && streak.maxLoss >= 7) {
    push('tip', 'ci.long_streak.title', 'ci.long_streak.body', { n: streak.maxLoss })
  }

  // ── Fallback ──
  if (insights.length === 0 && trades.length >= 10) {
    push('tip', 'ci.fallback.title', 'ci.fallback.body')
  }

  return insights
}
