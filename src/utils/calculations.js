import { format, parseISO, differenceInMinutes } from 'date-fns'

export function calcStats(trades) {
  if (!trades.length) return {
    totalPnl: 0, winRate: 0, totalTrades: 0,
    profitFactor: 0, avgWin: 0, avgLoss: 0,
    maxDrawdown: 0, largestWin: 0, largestLoss: 0,
    avgDuration: 0, totalWins: 0, totalLosses: 0,
  }

  const wins   = trades.filter(t => t.profit > 0)
  const losses = trades.filter(t => t.profit < 0)

  const totalPnl   = trades.reduce((s, t) => s + t.profit, 0)
  const grossProfit = wins.reduce((s, t) => s + t.profit, 0)
  const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.profit, 0))

  const avgWin  = wins.length  ? grossProfit / wins.length  : 0
  const avgLoss = losses.length ? grossLoss  / losses.length : 0
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

  const durations = trades
    .filter(t => t.openTime && t.closeTime)
    .map(t => differenceInMinutes(new Date(t.closeTime), new Date(t.openTime)))
  const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

  return {
    totalPnl,
    winRate:      trades.length ? (wins.length / trades.length) * 100 : 0,
    totalTrades:  trades.length,
    profitFactor: Math.min(profitFactor, 99.9),
    avgWin,
    avgLoss,
    maxDrawdown:  calcMaxDrawdown(trades),
    largestWin:   wins.length  ? Math.max(...wins.map(t => t.profit))   : 0,
    largestLoss:  losses.length ? Math.min(...losses.map(t => t.profit)) : 0,
    avgDuration,
    totalWins:    wins.length,
    totalLosses:  losses.length,
    grossProfit,
    grossLoss,
  }
}

export function calcMaxDrawdown(trades) {
  if (!trades.length) return 0
  const sorted = [...trades].sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))
  let peak = 0, maxDD = 0, cumPnl = 0
  for (const t of sorted) {
    cumPnl += t.profit
    if (cumPnl > peak) peak = cumPnl
    const dd = peak - cumPnl
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

export function buildEquityCurve(trades) {
  if (!trades.length) return []
  const sorted = [...trades].sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))
  let cumPnl = 0
  return sorted.map(t => {
    cumPnl += t.profit
    return {
      date: format(new Date(t.closeTime), 'dd.MM.yy'),
      equity: parseFloat(cumPnl.toFixed(2)),
      pnl: parseFloat(t.profit.toFixed(2)),
    }
  })
}

export function buildDrawdownCurve(trades) {
  if (!trades.length) return []
  const sorted = [...trades].sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))
  let peak = 0, cumPnl = 0
  return sorted.map(t => {
    cumPnl += t.profit
    if (cumPnl > peak) peak = cumPnl
    return {
      date: format(new Date(t.closeTime), 'dd.MM.yy'),
      drawdown: parseFloat(-(peak - cumPnl).toFixed(2)),
    }
  })
}

export function buildMonthlyPnl(trades) {
  const byMonth = {}
  for (const t of trades) {
    const key = format(new Date(t.closeTime), 'MMM yy')
    byMonth[key] = (byMonth[key] || 0) + t.profit
  }
  return Object.entries(byMonth).map(([month, pnl]) => ({
    month,
    pnl: parseFloat(pnl.toFixed(2)),
  }))
}

export function buildSymbolStats(trades) {
  const bySymbol = {}
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { symbol: t.symbol, pnl: 0, trades: 0, wins: 0 }
    bySymbol[t.symbol].pnl    += t.profit
    bySymbol[t.symbol].trades += 1
    if (t.profit > 0) bySymbol[t.symbol].wins += 1
  }
  return Object.values(bySymbol)
    .sort((a, b) => b.pnl - a.pnl)
    .map(s => ({ ...s, pnl: parseFloat(s.pnl.toFixed(2)), winRate: s.trades ? (s.wins / s.trades) * 100 : 0 }))
}

export function buildDurationBySymbol(trades) {
  const bySymbol = {}
  for (const t of trades) {
    if (!t.openTime || !t.closeTime) continue
    const dur = differenceInMinutes(new Date(t.closeTime), new Date(t.openTime))
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { symbol: t.symbol, total: 0, count: 0 }
    bySymbol[t.symbol].total += dur
    bySymbol[t.symbol].count += 1
  }
  return Object.values(bySymbol).map(s => ({
    symbol: s.symbol,
    avgDuration: Math.round(s.total / s.count),
  }))
}

export function groupTradesByDay(trades) {
  const byDay = {}
  for (const t of trades) {
    // Nur geschlossene Trades
    if (!t.closeTime || t.isOpen) continue

    const date = new Date(t.closeTime)   // in lokaler Systemzeit interpretieren

    // Wochenende überspringen (Forex/CFD Märkte geschlossen)
    // 0 = Sonntag, 6 = Samstag (lokale Zeit des Benutzers)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue

    const day = format(date, 'yyyy-MM-dd')   // lokaler Tag
    if (!byDay[day]) byDay[day] = { pnl: 0, trades: [] }
    byDay[day].pnl += t.profit
    byDay[day].trades.push(t)
  }
  return byDay
}

/* ─── Symbol → Kategorie Mapping ───────────────────────────── */
const CURRENCIES = ['USD','EUR','GBP','JPY','CHF','AUD','NZD','CAD','SGD','HKD','NOK','SEK','DKK','MXN','ZAR','TRY','PLN','CZK','HUF','CNH','CNY']

const CRYPTO_BASES = ['BTC','ETH','LTC','XRP','BNB','ADA','DOT','SOL','DOGE','AVAX','MATIC','LINK','UNI','ATOM','ALGO','VET','FTM','NEAR','SAND','MANA','CRO','LUNA']

const INDEX_PREFIXES = ['US30','US500','US100','NAS100','SPX','DAX','GER40','GER30','UK100','FTSE','JPN225','AUS200','HK50','CAC40','STOXX','VIX','ESP35','SUI20','FRA40','EUSTX50','CHINA50','NIKKEI']

const COMMODITY_PREFIXES = ['XAU','XAG','XPT','XPD','GOLD','SILVER','OIL','USOIL','UKOIL','WTI','BRENT','NATGAS','NG','NGAS','COPPER','WHEAT','CORN','SOYBEAN','COFFEE','SUGAR','COCOA','COTTON']

export function normalizeSymbol(symbol) {
  if (!symbol) return ''
  let s = symbol.toUpperCase()
  s = s.replace(/^#/, '')                                            // #AAPL  → AAPL
  s = s.replace(/\.(US|UK|DE|NQ|HK|AU|JP|FR|CA|SG|EU|NAS|NYSE|LSE|XETRA)$/i, '') // AAPL.US → AAPL
  s = s.replace(/[._\-]+$/, '')                                      // trailing punctuation
  return s
}

export function getSymbolCategory(symbol) {
  if (!symbol) return 'other'
  const s = normalizeSymbol(symbol)

  // Crypto
  if (CRYPTO_BASES.some(b => s.startsWith(b))) return 'crypto'
  if (CRYPTO_BASES.some(b => s.endsWith(b))) return 'crypto'

  // Commodities / Metals / Energy
  if (COMMODITY_PREFIXES.some(p => s.startsWith(p))) return 'commodities'

  // Indices
  if (INDEX_PREFIXES.some(p => s.startsWith(p))) return 'indices'
  if (/^[A-Z]{2,6}\d{2,3}$/.test(s)) return 'indices'   // GER40, US500, JPN225 …

  // Forex – 6-char pair of known 3-letter currencies (EURUSD, GBPJPY …)
  const base  = s.slice(0, 3)
  const quote = s.slice(3, 6)
  if (s.length >= 6 && CURRENCIES.includes(base) && CURRENCIES.includes(quote)) return 'forex'

  // Aktien – pure letters 1–8 chars (AAPL, TSLA, NVIDIA, GOOGL, BRK …)
  if (/^[A-Z]{1,8}$/.test(s)) return 'aktien'

  return 'other'
}

export function formatPnl(value, decimals = 2) {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(decimals)}`
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/**
 * Konto-Balance zu einem bestimmten Zeitpunkt.
 * = initialBalance + kumulierter P&L aller Trades, die VOR cutoffMs geschlossen wurden.
 *
 * @param {Array}  trades         – alle effectiveTrades (unsortiert)
 * @param {number} cutoffMs       – Unix-Timestamp in ms (exklusiv)
 * @param {number} initialBalance – einmalig eingegebenes Anfangs-Kapital
 */
export function calcBalanceAt(trades, cutoffMs, initialBalance) {
  let sum = 0
  for (const t of trades) {
    if (t.closeTime && new Date(t.closeTime).getTime() < cutoffMs) {
      sum += (t.profit || 0) + (t.commission || 0) + (t.swap || 0)
    }
  }
  return initialBalance + sum
}
