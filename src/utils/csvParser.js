/**
 * MetaTrader 5 CSV Parser
 * Handles both semicolon and comma delimited exports
 */

const MT5_COLUMN_MAP = {
  // Position / deal identifiers
  'deal':         null,
  'position':     null,
  'order':        null,

  // Time columns
  'time':         'openTime',
  'open time':    'openTime',
  'opentime':     'openTime',
  'close time':   'closeTime',
  'closetime':    'closeTime',
  'time.1':       'closeTime',

  // Symbol
  'symbol':       'symbol',

  // Type
  'type':         'type',
  'direction':    'type',

  // Volume
  'volume':       'volume',
  'lots':         'volume',
  'lot':          'volume',

  // Prices
  'price':        'openPrice',
  'open price':   'openPrice',
  'openprice':    'openPrice',
  'price.1':      'closePrice',
  'close price':  'closePrice',
  'closeprice':   'closePrice',

  // SL / TP
  's / l':        'sl',
  's/l':          'sl',
  'sl':           'sl',
  'stop loss':    'sl',
  't / p':        'tp',
  't/p':          'tp',
  'tp':           'tp',
  'take profit':  'tp',

  // Financial
  'commission':   'commission',
  'swap':         'swap',
  'profit':       'profit',
}

function detectDelimiter(text) {
  const firstLine = text.split('\n')[0]
  const semicolons = (firstLine.match(/;/g) || []).length
  const commas     = (firstLine.match(/,/g) || []).length
  return semicolons > commas ? ';' : ','
}

function normalizeHeader(h) {
  return h.toLowerCase().trim().replace(/"/g, '')
}

function parseValue(v) {
  if (v === undefined || v === null) return v
  const s = v.trim().replace(/"/g, '').replace(/\s+/g, ' ')
  return s
}

function parseFloat2(v) {
  const n = parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function normalizeType(t) {
  const upper = String(t).toUpperCase().trim()
  if (upper.includes('BUY') || upper === 'IN' || upper === 'LONG') return 'BUY'
  if (upper.includes('SELL') || upper === 'OUT' || upper === 'SHORT') return 'SELL'
  return upper
}

function parseDateTime(s) {
  if (!s) return null
  // MT5 format: "2024.01.15 08:30:00" or "2024-01-15 08:30:00"
  const normalized = s.replace(/\./g, '-').replace(' ', 'T')
  const d = new Date(normalized)
  if (isNaN(d)) return s
  return d.toISOString()
}

export function parseMT5CSV(csvText) {
  const lines = csvText.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV enthält zu wenig Zeilen.')

  const delimiter = detectDelimiter(csvText)

  // Find header line (skip comment lines starting with # or containing totals)
  let headerIdx = 0
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const lower = lines[i].toLowerCase()
    if (lower.includes('symbol') || lower.includes('profit') || lower.includes('time')) {
      headerIdx = i
      break
    }
  }

  const headers = lines[headerIdx].split(delimiter).map(normalizeHeader)

  // Map headers to our field names
  const colMap = {}
  headers.forEach((h, i) => {
    const mapped = MT5_COLUMN_MAP[h]
    if (mapped) colMap[i] = mapped
    else colMap[i] = h // keep original for unknown columns
  })

  const trades = []
  const errors = []

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cells = line.split(delimiter).map(parseValue)

    // Build raw row object
    const row = {}
    cells.forEach((cell, ci) => {
      const key = colMap[ci]
      if (key) row[key] = cell
    })

    // Skip summary/total rows
    if (!row.symbol || row.symbol.toLowerCase().includes('balance') || row.symbol.toLowerCase() === '') continue
    if (!row.profit && row.symbol?.toLowerCase().includes('total')) continue

    // Skip rows without profit (open positions)
    if (row.profit === undefined && !row.closeTime) continue

    // Build normalized trade
    const profit = parseFloat2(row.profit)

    // Skip non-trade rows (deposits, withdrawals)
    if (row.type) {
      const t = normalizeType(row.type)
      if (!['BUY', 'SELL'].includes(t)) continue
    }

    const trade = {
      id:         `mt5-${Date.now()}-${i}`,
      symbol:     (row.symbol || '').toUpperCase().trim(),
      type:       normalizeType(row.type || 'BUY'),
      volume:     parseFloat2(row.volume),
      openPrice:  parseFloat2(row.openPrice),
      closePrice: parseFloat2(row.closePrice),
      openTime:   parseDateTime(row.openTime),
      closeTime:  parseDateTime(row.closeTime),
      sl:         parseFloat2(row.sl),
      tp:         parseFloat2(row.tp),
      commission: parseFloat2(row.commission),
      swap:       parseFloat2(row.swap),
      profit:     profit,
      notes:      '',
      tags:       [],
    }

    if (!trade.symbol) {
      errors.push(`Zeile ${i + 1}: Symbol fehlt.`)
      continue
    }

    trades.push(trade)
  }

  return { trades, errors }
}

export function generateDuplicateKey(trade) {
  return `${trade.symbol}-${trade.openTime}-${trade.closeTime}-${trade.profit}`
}

export function filterDuplicates(newTrades, existingTrades) {
  const existingKeys = new Set(existingTrades.map(generateDuplicateKey))
  return newTrades.filter(t => !existingKeys.has(generateDuplicateKey(t)))
}

export function tradesToCSV(trades) {
  const headers = [
    'ID', 'Symbol', 'Typ', 'Volumen',
    'Eröffnung', 'Schluss', 'Open Time', 'Close Time',
    'SL', 'TP', 'Kommission', 'Swap', 'Profit',
    'Tags', 'Notizen'
  ]
  const rows = trades.map(t => [
    t.id,
    t.symbol,
    t.type,
    t.volume,
    t.openPrice,
    t.closePrice,
    t.openTime || '',
    t.closeTime || '',
    t.sl || '',
    t.tp || '',
    t.commission || 0,
    t.swap || 0,
    t.profit,
    (t.tags || []).join('|'),
    (t.notes || '').replace(/,/g, ';').replace(/\n/g, ' '),
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  return csv
}
