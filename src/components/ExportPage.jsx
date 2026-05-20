import { useState, useMemo } from 'react'
import { Download, FileText, Filter, CheckCircle, Trash2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { useTrades } from '../hooks/useTrades'
import { tradesToCSV } from '../utils/csvParser'
import { calcStats } from '../utils/calculations'

export default function ExportPage() {
  const { trades, clearAllTrades } = useTrades()

  const [filterSymbol, setFilterSymbol]   = useState('ALL')
  const [filterType, setFilterType]       = useState('ALL')
  const [filterTag, setFilterTag]         = useState('ALL')
  const [dateFrom, setDateFrom]           = useState('')
  const [dateTo, setDateTo]               = useState('')
  const [exported, setExported]           = useState(false)
  const [confirmClear, setConfirmClear]   = useState(false)

  const { allTags } = useTrades()

  const symbols = useMemo(() => {
    const s = new Set(trades.map(t => t.symbol))
    return ['ALL', ...Array.from(s).sort()]
  }, [trades])

  const filtered = useMemo(() => {
    let result = [...trades]
    if (filterSymbol !== 'ALL') result = result.filter(t => t.symbol === filterSymbol)
    if (filterType   !== 'ALL') result = result.filter(t => t.type === filterType)
    if (filterTag    !== 'ALL') result = result.filter(t => (t.tags || []).includes(filterTag))
    if (dateFrom)               result = result.filter(t => t.closeTime >= dateFrom)
    if (dateTo)                 result = result.filter(t => t.closeTime <= dateTo + 'T23:59:59')
    return result
  }, [trades, filterSymbol, filterType, filterTag, dateFrom, dateTo])

  const stats = useMemo(() => calcStats(filtered), [filtered])

  function handleExport() {
    if (!filtered.length) return
    const csv      = tradesToCSV(filtered)
    const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url      = URL.createObjectURL(blob)
    const link     = document.createElement('a')
    const dateStr  = format(new Date(), 'yyyy-MM-dd')
    link.href      = url
    link.download  = `tradestats_export_${dateStr}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setExported(true)
    setTimeout(() => setExported(false), 3000)
  }

  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return }
    clearAllTrades()
    setConfirmClear(false)
  }

  const hasFilters = filterSymbol !== 'ALL' || filterType !== 'ALL' || filterTag !== 'ALL' || dateFrom || dateTo
  const pnl = stats.totalPnl

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Export</h1>
        <p className="text-sm text-slate-500 mt-0.5">Trades als CSV-Datei exportieren</p>
      </div>

      {/* Success */}
      {exported && (
        <div className="bg-[#10b981]/10 border border-[#10b981]/30 rounded-xl px-5 py-4 flex items-center gap-3 fade-in">
          <CheckCircle size={20} className="text-[#10b981]" />
          <p className="text-[#10b981] font-semibold text-sm">Export erfolgreich gespeichert!</p>
        </div>
      )}

      {/* Filter Card */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-200">Filter (optional)</h3>
          </div>
          {hasFilters && (
            <button
              onClick={() => { setFilterSymbol('ALL'); setFilterType('ALL'); setFilterTag('ALL'); setDateFrom(''); setDateTo('') }}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Zurücksetzen
            </button>
          )}
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Symbol</label>
            <select value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)} className="select w-full text-xs">
              {symbols.map(s => <option key={s} value={s}>{s === 'ALL' ? 'Alle' : s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Typ</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="select w-full text-xs">
              <option value="ALL">Alle</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Tag</label>
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className="select w-full text-xs">
              <option value="ALL">Alle Tags</option>
              {allTags.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Von</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input w-full text-xs" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Bis</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input w-full text-xs" />
          </div>
        </div>
      </div>

      {/* Preview Stats */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-200">Export-Vorschau</h3>
          </div>
          <span className="text-xs text-slate-500">{filtered.length} Trades</span>
        </div>
        <div className="p-5">
          {/* Stats summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Trades',      value: filtered.length,                color: 'text-slate-200' },
              { label: 'Gesamt P&L',  value: (pnl >= 0 ? '+' : '') + pnl.toFixed(2),
                                                                              color: pnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]' },
              { label: 'Win Rate',    value: stats.winRate.toFixed(1) + '%', color: stats.winRate >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]' },
              { label: 'Profit Fakt', value: stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2),
                                                                              color: stats.profitFactor >= 1 ? 'text-[#10b981]' : 'text-[#ef4444]' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[#0d1117] rounded-lg p-3 text-center">
                <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Column info */}
          <div className="bg-[#0d1117] rounded-lg p-4 mb-5">
            <p className="text-xs text-slate-500 mb-2 font-medium">Exportierte Spalten:</p>
            <div className="flex flex-wrap gap-1.5">
              {['ID', 'Symbol', 'Typ', 'Volumen', 'Eröffnung', 'Schluss', 'Open Time', 'Close Time',
                'SL', 'TP', 'Kommission', 'Swap', 'Profit', 'Tags', 'Notizen'].map(col => (
                <span key={col} className="text-[10px] bg-[#1f2937] text-slate-400 px-2 py-0.5 rounded font-mono">
                  {col}
                </span>
              ))}
            </div>
          </div>

          {/* Filename preview */}
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-5">
            <FileText size={12} />
            <span>Dateiname: </span>
            <code className="font-mono bg-[#1f2937] px-2 py-0.5 rounded text-slate-300">
              tradestats_export_{format(new Date(), 'yyyy-MM-dd')}.csv
            </code>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={!filtered.length}
            className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            {filtered.length} Trades als CSV exportieren
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card border-[#ef4444]/20">
        <div className="card-header border-[#ef4444]/10">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#ef4444]" />
            <h3 className="text-sm font-semibold text-[#ef4444]">Gefahrenzone</h3>
          </div>
        </div>
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300 font-medium">Alle Trades löschen</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Löscht alle {trades.length} Trades aus dem lokalen Speicher. Nicht rückgängig zu machen.
            </p>
          </div>
          <button
            onClick={handleClear}
            className={`btn-danger text-xs flex-shrink-0 transition-all ${confirmClear ? 'ring-1 ring-[#ef4444]' : ''}`}
          >
            <Trash2 size={13} />
            {confirmClear ? 'Wirklich alles löschen?' : 'Alle Trades löschen'}
          </button>
        </div>
        {confirmClear && (
          <div className="px-5 pb-4">
            <button onClick={() => setConfirmClear(false)} className="text-xs text-slate-500 hover:text-slate-300">
              Abbrechen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
