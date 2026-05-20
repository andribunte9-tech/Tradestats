import { useState, useRef } from 'react'
import {
  Upload, FileText, CheckCircle, AlertTriangle, X, ChevronDown, ChevronUp,
  Info, ArrowRight, Trash2,
} from 'lucide-react'
import { format } from 'date-fns'
import { useTrades } from '../hooks/useTrades'
import { parseMT5CSV, filterDuplicates } from '../utils/csvParser'

const STEPS = [
  { n: 1, title: 'MT5 öffnen',      desc: 'MetaTrader 5 starten' },
  { n: 2, title: 'History Center',  desc: '"Ansicht" → "History" öffnen' },
  { n: 3, title: 'Tab wählen',      desc: 'Tab "Deals" oder "Positions" wählen' },
  { n: 4, title: 'Zeitraum',        desc: 'Gewünschten Zeitraum einstellen' },
  { n: 5, title: 'Als CSV speichern', desc: 'Rechtsklick → "Als Report speichern"' },
]

export default function ImportPage() {
  const { trades, importTrades } = useTrades()

  const [csvText, setCsvText]         = useState('')
  const [preview, setPreview]         = useState(null)  // { trades, duplicates, errors }
  const [parseError, setParseError]   = useState('')
  const [imported, setImported]       = useState(false)
  const [showGuide, setShowGuide]     = useState(true)
  const [dragOver, setDragOver]       = useState(false)
  const fileRef = useRef(null)

  function handleParse(text) {
    setParseError('')
    setImported(false)
    setPreview(null)
    if (!text.trim()) return

    try {
      const { trades: parsed, errors } = parseMT5CSV(text)
      if (!parsed.length) {
        setParseError('Keine gültigen Trades gefunden. Prüfe das CSV-Format.')
        return
      }
      const unique     = filterDuplicates(parsed, trades)
      const duplicates = parsed.length - unique.length
      setPreview({ trades: unique, duplicates, errors, total: parsed.length })
    } catch (err) {
      setParseError('Fehler beim Parsen: ' + err.message)
    }
  }

  function handleFileUpload(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target.result
      setCsvText(text)
      handleParse(text)
    }
    reader.readAsText(file, 'utf-8')
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  function handleTextChange(e) {
    const text = e.target.value
    setCsvText(text)
    if (text.length > 50) handleParse(text)
    else { setPreview(null); setParseError('') }
  }

  function handleImport() {
    if (!preview?.trades?.length) return
    importTrades(preview.trades)
    setImported(true)
    setPreview(null)
    setCsvText('')
    setTimeout(() => setImported(false), 4000)
  }

  function handleReset() {
    setCsvText('')
    setPreview(null)
    setParseError('')
    setImported(false)
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">CSV Import</h1>
        <p className="text-sm text-slate-500 mt-0.5">MetaTrader 5 Export importieren</p>
      </div>

      {/* Success Banner */}
      {imported && (
        <div className="bg-[#10b981]/10 border border-[#10b981]/30 rounded-xl px-5 py-4 flex items-center gap-3 fade-in">
          <CheckCircle size={20} className="text-[#10b981] flex-shrink-0" />
          <div>
            <p className="text-[#10b981] font-semibold text-sm">Import erfolgreich!</p>
            <p className="text-slate-400 text-xs mt-0.5">Trades wurden ins Journal übernommen.</p>
          </div>
        </div>
      )}

      {/* Guide */}
      <div className="card">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="card-header w-full text-left hover:bg-[#1a2233] transition-colors rounded-t-xl"
        >
          <div className="flex items-center gap-2">
            <Info size={15} className="text-[#3b82f6]" />
            <span className="text-sm font-semibold text-slate-200">Anleitung: Export aus MetaTrader 5</span>
          </div>
          {showGuide ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
        </button>
        {showGuide && (
          <div className="p-5 fade-in">
            <div className="flex flex-wrap gap-2">
              {STEPS.map((s, i) => (
                <div key={s.n} className="flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-[#0d1117] rounded-lg px-3 py-2">
                    <div className="w-5 h-5 rounded-full bg-[#3b82f6]/20 text-[#3b82f6] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {s.n}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-300">{s.title}</div>
                      <div className="text-[10px] text-slate-500">{s.desc}</div>
                    </div>
                  </div>
                  {i < STEPS.length - 1 && <ArrowRight size={12} className="text-slate-700" />}
                </div>
              ))}
            </div>
            <div className="mt-4 bg-[#0d1117] rounded-lg p-3 text-xs text-slate-400 space-y-1">
              <p className="font-medium text-slate-300">Unterstützte Formate:</p>
              <p>✓ MT5 Deals-Report (Semikolon oder Komma getrennt)</p>
              <p>✓ MT5 Positions-Report</p>
              <p>✓ Datumformat: <code className="font-mono bg-[#1f2937] px-1 rounded">2024.01.15 08:30:00</code></p>
            </div>
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-slate-200">Datei hochladen oder CSV einfügen</h3>
        </div>
        <div className="p-5 space-y-4">
          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${dragOver
                ? 'border-[#10b981] bg-[#10b981]/5'
                : 'border-[#1f2937] hover:border-[#374151] hover:bg-[#1a2233]/30'
              }
            `}
          >
            <Upload size={24} className={`mx-auto mb-3 ${dragOver ? 'text-[#10b981]' : 'text-slate-600'}`} />
            <p className="text-sm font-medium text-slate-400">
              CSV-Datei hier ablegen oder <span className="text-[#3b82f6]">klicken zum Auswählen</span>
            </p>
            <p className="text-xs text-slate-600 mt-1">Unterstützt: .csv, .txt</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={e => handleFileUpload(e.target.files[0])}
          />

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-[#1f2937]" />
            <span className="text-xs text-slate-600">oder CSV-Text einfügen</span>
            <div className="flex-1 border-t border-[#1f2937]" />
          </div>

          {/* Text area */}
          <div className="relative">
            <textarea
              value={csvText}
              onChange={handleTextChange}
              placeholder="Füge hier den CSV-Inhalt ein (Strg+V)..."
              rows={6}
              className="input w-full resize-none font-mono text-xs leading-relaxed"
            />
            {csvText && (
              <button
                onClick={handleReset}
                className="absolute top-2 right-2 text-slate-600 hover:text-slate-400"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Error */}
          {parseError && (
            <div className="flex items-start gap-2 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-4 py-3 text-sm text-[#ef4444]">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="card fade-in">
          <div className="card-header">
            <div className="flex items-center gap-3">
              <FileText size={15} className="text-[#10b981]" />
              <h3 className="text-sm font-semibold text-slate-200">Vorschau</h3>
              <span className="bg-[#10b981]/15 text-[#10b981] text-xs px-2 py-0.5 rounded-full font-medium">
                {preview.trades.length} neue Trades
              </span>
              {preview.duplicates > 0 && (
                <span className="bg-[#f59e0b]/15 text-[#f59e0b] text-xs px-2 py-0.5 rounded-full font-medium">
                  {preview.duplicates} Duplikate übersprungen
                </span>
              )}
            </div>
          </div>

          {/* Preview table */}
          {preview.trades.length > 0 ? (
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#111827]">
                  <tr className="border-b border-[#1f2937]">
                    {['Symbol', 'Typ', 'Vol.', 'Open', 'Close', 'Open Time', 'P&L'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.trades.slice(0, 50).map((t, i) => (
                    <tr key={i} className="border-b border-[#1f2937]/30 hover:bg-[#1a2233]">
                      <td className="px-4 py-2 font-mono font-semibold text-slate-200">{t.symbol}</td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.type === 'BUY' ? 'bg-[#10b981]/15 text-[#10b981]' : 'bg-[#ef4444]/15 text-[#ef4444]'
                        }`}>{t.type}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-400 font-mono">{t.volume}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono">{t.openPrice?.toFixed(5)}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono">{t.closePrice?.toFixed(5)}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {t.openTime ? format(new Date(t.openTime), 'dd.MM.yy HH:mm') : '—'}
                      </td>
                      <td className={`px-4 py-2 font-mono font-bold ${t.profit >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {t.profit >= 0 ? '+' : ''}{t.profit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.trades.length > 50 && (
                <p className="text-center text-xs text-slate-600 py-2">
                  ... und {preview.trades.length - 50} weitere
                </p>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-slate-600 text-sm">
              Alle Trades sind bereits vorhanden (Duplikate).
            </div>
          )}

          {/* Parse errors */}
          {preview.errors?.length > 0 && (
            <div className="px-4 pb-4">
              <details className="text-xs">
                <summary className="text-[#f59e0b] cursor-pointer">
                  {preview.errors.length} Warnungen anzeigen
                </summary>
                <div className="mt-2 space-y-1 text-slate-500">
                  {preview.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              </details>
            </div>
          )}

          {/* Actions */}
          <div className="px-4 pb-4 flex justify-between items-center">
            <button onClick={handleReset} className="btn-secondary text-xs">
              <Trash2 size={12} /> Zurücksetzen
            </button>
            <button
              onClick={handleImport}
              disabled={!preview.trades.length}
              className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload size={14} />
              {preview.trades.length} Trades importieren
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
