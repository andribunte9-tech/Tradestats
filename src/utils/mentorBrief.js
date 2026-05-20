/**
 * Mentor Brief generator.
 * Builds a Markdown report + structured JSON object that the user can share
 * with a trading mentor (or paste into an AI chat) for focused coaching.
 *
 * Privacy modes:
 *  - 'full'      → real $ amounts, account stats, notes shown
 *  - 'relative'  → $ amounts replaced with R-multiples (profit/risk)
 *  - 'anonymous' → no amounts at all, only ratios/counts; notes optional
 */
import { format, subDays } from 'date-fns'
import {
  calcStats, buildEquityCurve,
} from './calculations'
import {
  buildMistakeAnalysis, buildBestVsWorst, calcRecoveryFactor,
  buildVolatilityNormalized, calcSequentialBias, buildStreakStats,
  buildMfeMaeAnalysis, MISTAKE_CATEGORIES,
} from './analytics'

const netPnl = (t) => (t.profit || 0) + (t.commission || 0) + (t.swap || 0)
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

function fmtAmount(value, privacy, riskAmount) {
  if (privacy === 'anonymous') return '—'
  if (privacy === 'relative') {
    if (!riskAmount || riskAmount <= 0) return value.toFixed(2)
    const r = value / riskAmount
    return `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`
  }
  return `${value >= 0 ? '+' : ''}$${value.toFixed(2)}`
}

function fmtPct(n, digits = 1) {
  if (n == null || isNaN(n)) return '—'
  return `${n >= 0 ? '' : ''}${n.toFixed(digits)}%`
}

function inRange(t, fromIso, toIso) {
  if (!t.closeTime) return false
  if (fromIso && t.closeTime < fromIso) return false
  if (toIso   && t.closeTime > toIso)   return false
  return true
}

/**
 * Build the Mentor Brief.
 * @param {object} opts
 *   - trades            : full trade list (effective trades)
 *   - allTrades         : raw (un-grouped) for full-resolution counts
 *   - mfeArchive        : { id: { mfe, mae } }
 *   - setups            : array of setup definitions
 *   - accountBalance    : number (used only in 'full' mode)
 *   - riskPercent       : number  (e.g. 1 = 1%)
 *   - fromDate, toDate  : YYYY-MM-DD strings (inclusive)
 *   - privacy           : 'full' | 'relative' | 'anonymous'
 *   - includeNotes      : boolean
 *   - focusAreas        : string (free-text, user's questions)
 */
export function buildMentorBrief(opts) {
  const {
    trades = [], mfeArchive = {}, setups = [],
    accountBalance = 10000, riskPercent = 1,
    fromDate = null, toDate = null,
    privacy = 'relative', includeNotes = true,
    focusAreas = '',
  } = opts

  const riskAmount = (accountBalance * riskPercent) / 100
  const fromIso = fromDate ? `${fromDate}T00:00:00` : null
  const toIso   = toDate   ? `${toDate}T23:59:59`   : null

  const filtered = trades.filter(t => t.closeTime && inRange(t, fromIso, toIso))
  if (!filtered.length) {
    return {
      markdown: `# Mentor-Brief\n\n_Keine Trades im gewählten Zeitraum (${fromDate || 'Start'} bis ${toDate || 'heute'})._`,
      json: { empty: true, range: { from: fromDate, to: toDate } },
    }
  }

  const stats = calcStats(filtered)
  const setupMap = Object.fromEntries(setups.map(s => [s.id, s]))

  // ── Per-setup performance ──
  const setupPerf = setups.map(s => {
    const t = filtered.filter(x => x.setupId === s.id)
    if (!t.length) return null
    const wins = t.filter(x => netPnl(x) > 0).length
    const pnl  = t.reduce((sum, x) => sum + netPnl(x), 0)
    return {
      name: s.name,
      targetRR: s.targetRR,
      trades: t.length,
      winRate: (wins / t.length) * 100,
      pnl,
      avgR: riskAmount > 0 ? pnl / t.length / riskAmount : 0,
    }
  }).filter(Boolean).sort((a, b) => b.pnl - a.pnl)

  // ── Per-symbol performance ──
  const bySymbol = {}
  for (const t of filtered) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { trades: 0, wins: 0, pnl: 0 }
    bySymbol[t.symbol].trades++
    if (netPnl(t) > 0) bySymbol[t.symbol].wins++
    bySymbol[t.symbol].pnl += netPnl(t)
  }
  const symbolRows = Object.entries(bySymbol).map(([sym, s]) => ({
    symbol: sym,
    trades: s.trades,
    winRate: (s.wins / s.trades) * 100,
    pnl: s.pnl,
    avgR: riskAmount > 0 ? s.pnl / s.trades / riskAmount : 0,
  })).sort((a, b) => b.pnl - a.pnl)

  // ── Session performance (UTC hour buckets) ──
  function getSession(hour) {
    if (hour < 7)  return 'Asia'
    if (hour < 12) return 'London'
    if (hour < 17) return 'NY-Overlap'
    if (hour < 22) return 'NY'
    return 'After-Hours'
  }
  const bySession = {}
  for (const t of filtered) {
    if (!t.openTime) continue
    const s = getSession(new Date(t.openTime).getUTCHours())
    if (!bySession[s]) bySession[s] = { trades: 0, wins: 0, pnl: 0 }
    bySession[s].trades++
    if (netPnl(t) > 0) bySession[s].wins++
    bySession[s].pnl += netPnl(t)
  }
  const sessionRows = Object.entries(bySession).map(([s, v]) => ({
    session: s,
    trades: v.trades,
    winRate: (v.wins / v.trades) * 100,
    pnl: v.pnl,
  })).sort((a, b) => b.pnl - a.pnl)

  // ── Best / Worst 5 ──
  const sortedByPnl = [...filtered].sort((a, b) => netPnl(b) - netPnl(a))
  const top5    = sortedByPnl.slice(0, 5)
  const bottom5 = sortedByPnl.slice(-5).reverse()

  function tradeLine(t) {
    const date = t.closeTime ? format(new Date(t.closeTime), 'dd.MM.yy HH:mm') : '—'
    const pnl  = fmtAmount(netPnl(t), privacy, riskAmount)
    const setup = t.setupId ? (setupMap[t.setupId]?.name || '?') : '—'
    const tags = (t.tags || []).join(', ') || '—'
    const mistakes = (t.mistakes || []).map(id => {
      const cat = MISTAKE_CATEGORIES.find(m => m.id === id)
      return cat ? cat.label : id
    }).join(', ') || '—'
    const notes = includeNotes && t.notes ? ` · _"${t.notes.replace(/\n/g, ' ').slice(0, 120)}"_` : ''
    return `${date} · ${t.symbol} ${t.type} · ${pnl} · Setup: ${setup} · Tags: ${tags} · Fehler: ${mistakes}${notes}`
  }

  const mistakeAnalysis = buildMistakeAnalysis(filtered)
  const bvw   = buildBestVsWorst(filtered, 10)
  const recovery = calcRecoveryFactor(filtered, accountBalance)
  const seq   = calcSequentialBias(filtered)
  const streak = buildStreakStats(filtered)
  const volNorm = buildVolatilityNormalized(filtered)
  const mfeMae = buildMfeMaeAnalysis(filtered, mfeArchive, riskAmount)

  // ── Header ──
  const md = []
  md.push(`# 📊 Mentor-Brief`)
  md.push(``)
  md.push(`**Zeitraum:** ${fromDate || 'Beginn'} → ${toDate || 'heute'}`)
  md.push(`**Trades:** ${filtered.length}`)
  md.push(`**Privacy-Modus:** \`${privacy}\``)
  md.push(``)

  if (focusAreas.trim()) {
    md.push(`## 🎯 Fokus für die Coaching-Session`)
    md.push(``)
    md.push(focusAreas.trim().split('\n').map(l => `> ${l}`).join('\n'))
    md.push(``)
  }

  // ── Overall summary ──
  md.push(`## 📈 Performance-Übersicht`)
  md.push(``)
  md.push(`- **Win Rate:** ${stats.winRate.toFixed(1)}% (${stats.totalWins}W / ${stats.totalLosses}L)`)
  md.push(`- **Profit Faktor:** ${stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}`)
  md.push(`- **Ø R:R:** ${(stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : 0).toFixed(2)}`)
  md.push(`- **Gesamt P&L:** ${fmtAmount(stats.totalPnl, privacy, riskAmount)}`)
  if (privacy === 'full') {
    md.push(`- **Account-Balance:** $${accountBalance.toFixed(0)} · **Risiko/Trade:** ${riskPercent}%`)
  } else if (privacy === 'relative') {
    md.push(`- **Risiko/Trade:** ${riskPercent}% des Kontos = 1R`)
  }
  if (recovery.recoveryFactor != null) {
    md.push(`- **Recovery Factor:** ${recovery.recoveryFactor.toFixed(2)} (Max-DD: ${recovery.maxDdPct.toFixed(1)}%)`)
  }
  md.push(``)

  // ── Edge map ──
  md.push(`## 🎯 Edge-Karte`)
  md.push(``)
  md.push(`### Top Symbole`)
  md.push(``)
  md.push(`| Symbol | Trades | WR | P&L | Ø R |`)
  md.push(`|---|---|---|---|---|`)
  symbolRows.slice(0, 8).forEach(r => {
    md.push(`| ${r.symbol} | ${r.trades} | ${r.winRate.toFixed(0)}% | ${fmtAmount(r.pnl, privacy, riskAmount)} | ${r.avgR.toFixed(2)}R |`)
  })
  md.push(``)
  md.push(`### Sessions (UTC)`)
  md.push(``)
  md.push(`| Session | Trades | WR | P&L |`)
  md.push(`|---|---|---|---|`)
  sessionRows.forEach(r => {
    md.push(`| ${r.session} | ${r.trades} | ${r.winRate.toFixed(0)}% | ${fmtAmount(r.pnl, privacy, riskAmount)} |`)
  })
  md.push(``)

  if (setupPerf.length > 0) {
    md.push(`### Setup-Performance`)
    md.push(``)
    md.push(`| Setup | Ziel R:R | Trades | WR | P&L | Ø R |`)
    md.push(`|---|---|---|---|---|---|`)
    setupPerf.forEach(s => {
      md.push(`| ${s.name} | ${s.targetRR} | ${s.trades} | ${s.winRate.toFixed(0)}% | ${fmtAmount(s.pnl, privacy, riskAmount)} | ${s.avgR.toFixed(2)}R |`)
    })
    md.push(``)
  }

  if (volNorm.length > 0) {
    md.push(`### Volatilitäts-normalisierte Edge (Sharpe-like je Symbol)`)
    md.push(``)
    md.push(`| Symbol | Trades | Sharpe-like |`)
    md.push(`|---|---|---|`)
    volNorm.slice(0, 6).forEach(r => {
      md.push(`| ${r.symbol} | ${r.trades} | ${r.sharpeLike.toFixed(2)} |`)
    })
    md.push(``)
  }

  // ── Best / Worst ──
  md.push(`## 🏆 Top 5 Gewinner-Trades`)
  md.push(``)
  top5.forEach((t, i) => md.push(`${i + 1}. ${tradeLine(t)}`))
  md.push(``)
  md.push(`## ❌ Bottom 5 Verlierer-Trades`)
  md.push(``)
  bottom5.forEach((t, i) => md.push(`${i + 1}. ${tradeLine(t)}`))
  md.push(``)

  // ── Best vs Worst clusters ──
  if (bvw) {
    md.push(`## 🔍 Muster bei Top-10 vs Bottom-10`)
    md.push(``)
    md.push(`| Merkmal | Top 10 | Bottom 10 |`)
    md.push(`|---|---|---|`)
    md.push(`| Ø Hold | ${bvw.top.avgHold < 60 ? bvw.top.avgHold.toFixed(0) + 'min' : (bvw.top.avgHold / 60).toFixed(1) + 'h'} | ${bvw.bottom.avgHold < 60 ? bvw.bottom.avgHold.toFixed(0) + 'min' : (bvw.bottom.avgHold / 60).toFixed(1) + 'h'} |`)
    md.push(`| Ø Volumen | ${bvw.top.avgVolume.toFixed(2)} | ${bvw.bottom.avgVolume.toFixed(2)} |`)
    md.push(`| Top Symbol | ${bvw.top.topSymbol} (${bvw.top.topSymbolPct.toFixed(0)}%) | ${bvw.bottom.topSymbol} (${bvw.bottom.topSymbolPct.toFixed(0)}%) |`)
    md.push(`| BUY-Anteil | ${bvw.top.typeBuyPct.toFixed(0)}% | ${bvw.bottom.typeBuyPct.toFixed(0)}% |`)
    md.push(``)
  }

  // ── Mistakes ──
  if (mistakeAnalysis.tradesWithMistakes > 0) {
    md.push(`## 🐛 Fehler-Muster`)
    md.push(``)
    md.push(`**${mistakeAnalysis.tradesWithMistakes} Trades** mit Fehler-Tag · **${mistakeAnalysis.cleanTrades} saubere Trades**`)
    md.push(`- Saubere Trades Ø: ${fmtAmount(mistakeAnalysis.cleanAvg, privacy, riskAmount)} · WR ${mistakeAnalysis.cleanWinRate.toFixed(0)}%`)
    md.push(`- Mit Fehler Ø: ${fmtAmount(mistakeAnalysis.dirtyAvg, privacy, riskAmount)}`)
    md.push(``)
    md.push(`| Fehler | Anzahl | WR | Gesamt-Kosten |`)
    md.push(`|---|---|---|---|`)
    mistakeAnalysis.rows.slice(0, 8).forEach(m => {
      md.push(`| ${m.emoji} ${m.label} | ${m.count} | ${m.winRate.toFixed(0)}% | ${fmtAmount(m.totalCost, privacy, riskAmount)} |`)
    })
    md.push(``)
  }

  // ── Behavior ──
  if (seq) {
    md.push(`## 🧠 Verhaltens-Diagnose`)
    md.push(``)
    md.push(`- **Nach Gewinn:** WR ${seq.afterWin.winRate.toFixed(0)}% · Ø ${fmtAmount(seq.afterWin.avgPnl, privacy, riskAmount)} (${seq.afterWin.count}T)`)
    md.push(`- **Nach Verlust:** WR ${seq.afterLoss.winRate.toFixed(0)}% · Ø ${fmtAmount(seq.afterLoss.avgPnl, privacy, riskAmount)} (${seq.afterLoss.count}T)`)
    md.push(`- **Baseline:** WR ${seq.baseline.winRate.toFixed(0)}% · Ø ${fmtAmount(seq.baseline.avgPnl, privacy, riskAmount)}`)
    if (streak) {
      md.push(`- **Max Gewinn-/Verlust-Serie:** ${streak.maxWin}W / ${streak.maxLoss}L`)
    }
    md.push(``)
  }

  // ── MFE/MAE if available ──
  if (mfeMae.sampleSize > 0) {
    md.push(`## 💸 MFE/MAE Capture`)
    md.push(``)
    md.push(`- **Capture-Rate** (realisierter Anteil vom MFE-Peak): **${(mfeMae.overallCapture * 100).toFixed(0)}%** über ${mfeMae.sampleSize} Trades`)
    md.push(`- **Verschenkter Gewinn** (MFE − realisiert, nur Gewinner): ${fmtAmount(mfeMae.giveBackTotal, privacy, riskAmount)}`)
    md.push(``)
  }

  // ── Setup playbook reference (so mentor knows the rules) ──
  if (setups.length > 0) {
    md.push(`## 📖 Aktive Setup-Playbooks`)
    md.push(``)
    setups.forEach(s => {
      md.push(`### ${s.name} (Ziel R:R ${s.targetRR}, max ${s.maxRiskPct}% Risiko)`)
      if (s.description) md.push(`_${s.description}_`)
      if (s.entryRules?.length > 0) {
        md.push(`**Entry:**`)
        s.entryRules.forEach(r => md.push(`- ${r}`))
      }
      if (s.exitRules?.length > 0) {
        md.push(`**Exit:**`)
        s.exitRules.forEach(r => md.push(`- ${r}`))
      }
      md.push(``)
    })
  }

  md.push(`---`)
  md.push(`_Generiert am ${format(new Date(), 'dd.MM.yyyy HH:mm')} · TradeStats Mentor-Brief_`)

  // ── JSON variant (for AI parsing or rich analysis) ──
  const json = {
    meta: {
      generatedAt: new Date().toISOString(),
      range: { from: fromDate, to: toDate },
      privacy,
      tradeCount: filtered.length,
    },
    focusAreas: focusAreas.trim() || null,
    summary: {
      winRate: round(stats.winRate, 2),
      profitFactor: stats.profitFactor === Infinity ? null : round(stats.profitFactor, 2),
      wins: stats.totalWins,
      losses: stats.totalLosses,
      totalPnl: privacy === 'anonymous' ? null : (privacy === 'relative' && riskAmount > 0 ? round(stats.totalPnl / riskAmount, 2) : round(stats.totalPnl, 2)),
      totalPnlUnit: privacy === 'relative' ? 'R' : privacy === 'anonymous' ? null : 'USD',
      recoveryFactor: recovery.recoveryFactor != null ? round(recovery.recoveryFactor, 2) : null,
      maxDdPct: recovery.maxDdPct != null ? round(recovery.maxDdPct, 2) : null,
    },
    bySymbol: symbolRows.map(r => ({
      symbol: r.symbol, trades: r.trades,
      winRate: round(r.winRate, 1),
      avgR: round(r.avgR, 2),
    })),
    bySession: sessionRows.map(r => ({
      session: r.session, trades: r.trades,
      winRate: round(r.winRate, 1),
    })),
    bySetup: setupPerf.map(s => ({
      name: s.name, targetRR: s.targetRR, trades: s.trades,
      winRate: round(s.winRate, 1), avgR: round(s.avgR, 2),
    })),
    mistakes: mistakeAnalysis.rows.map(m => ({
      id: m.id, label: m.label, count: m.count,
      winRate: round(m.winRate, 1),
    })),
    behavior: seq ? {
      baseline: { winRate: round(seq.baseline.winRate, 1) },
      afterWin: { winRate: round(seq.afterWin.winRate, 1), count: seq.afterWin.count },
      afterLoss: { winRate: round(seq.afterLoss.winRate, 1), count: seq.afterLoss.count },
      maxWinStreak: streak?.maxWin || 0,
      maxLossStreak: streak?.maxLoss || 0,
    } : null,
    mfeMae: mfeMae.sampleSize > 0 ? {
      sampleSize: mfeMae.sampleSize,
      captureRate: round(mfeMae.overallCapture * 100, 1),
    } : null,
    bestTrades: top5.map(t => ({
      date: t.closeTime,
      symbol: t.symbol, type: t.type,
      pnlR: riskAmount > 0 ? round(netPnl(t) / riskAmount, 2) : null,
      setup: t.setupId ? setupMap[t.setupId]?.name : null,
      tags: t.tags || [],
      mistakes: t.mistakes || [],
      notes: includeNotes ? t.notes || null : null,
    })),
    worstTrades: bottom5.map(t => ({
      date: t.closeTime,
      symbol: t.symbol, type: t.type,
      pnlR: riskAmount > 0 ? round(netPnl(t) / riskAmount, 2) : null,
      setup: t.setupId ? setupMap[t.setupId]?.name : null,
      tags: t.tags || [],
      mistakes: t.mistakes || [],
      notes: includeNotes ? t.notes || null : null,
    })),
  }

  return { markdown: md.join('\n'), json }
}
