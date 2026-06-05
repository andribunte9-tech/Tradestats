import { useMemo, useState } from 'react'
import { Radio, Target, AlertTriangle, TrendingUp, CheckCircle2, XCircle, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLanguage } from '../hooks/useLanguage'
import { useTrades } from '../hooks/useTrades'
import { usePrivacyMode, Pvt } from '../hooks/usePrivacyMode'
import { useSignals } from '../hooks/useSignals'
import { useLiveSync } from '../hooks/useLiveSync'
import { matchSignalsToTrades, buildSignalExecution } from '../utils/analytics'
import { format } from 'date-fns'

const PROFILE_FACTORS = { sehr_konservativ: 0.030, konservativ: 0.050, ausgewogen: 0.075, aggressiv: 0.100, sehr_aggressiv: 0.150 }
const PERIOD_KEY = 'tradestats_signals_period'
const PERIODS = [
  { id: '1T', kind: 'day' },
  { id: '1W', kind: 'week' },
  { id: '1M', kind: 'month' },
  { id: '1J', kind: 'year' },
  { id: 'all', kind: null },
]

function getRange(kind, offset) {
  if (!kind) return null
  const d = new Date()
  if (kind === 'day')   d.setDate(d.getDate() + offset)
  if (kind === 'week')  d.setDate(d.getDate() + offset * 7)
  if (kind === 'month') d.setMonth(d.getMonth() + offset)
  if (kind === 'year')  d.setFullYear(d.getFullYear() + offset)
  d.setHours(0, 0, 0, 0)
  if (kind === 'day')  { const from = d.getTime(); return { from, to: from + 86_400_000 - 1 } }
  if (kind === 'week') { const dow = (d.getDay() + 6) % 7; const f = new Date(d); f.setDate(d.getDate() - dow); return { from: f.getTime(), to: f.getTime() + 7 * 86_400_000 - 1 } }
  if (kind === 'month'){ return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1 } }
  if (kind === 'year') { return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: new Date(d.getFullYear() + 1, 0, 1).getTime() - 1 } }
  return null
}
const inRangeMs = (ms, r) => !r || (ms != null && ms >= r.from && ms <= r.to)

function rangeLabel(kind, offset) {
  const r = getRange(kind, offset)
  if (!r) return null
  const from = new Date(r.from)
  const pad = n => String(n).padStart(2, '0')
  if (kind === 'day')   return offset === 0 ? 'Heute' : `${pad(from.getDate())}.${pad(from.getMonth() + 1)}.${from.getFullYear()}`
  if (kind === 'week')  return `KW · ab ${pad(from.getDate())}.${pad(from.getMonth() + 1)}.`
  if (kind === 'month') return from.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  if (kind === 'year')  return String(from.getFullYear())
  return null
}

function StatBox({ icon: Icon, label, value, sub, color = '#3b82f6' }) {
  return (
    <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} style={{ color }} />
        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      </div>
      <p className="text-2xl font-mono font-bold text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Header({ t }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-white">{t('nav.signals')}</h1>
      <p className="text-sm text-slate-500 mt-0.5">{t('sig.subtitle')}</p>
    </div>
  )
}

export default function SignalsPage() {
  const { t } = useLanguage()
  const { effectiveTrades } = useTrades()
  const { privacyMode, accountBalance } = usePrivacyMode()
  const { messages, loading, available, error } = useSignals()
  const { status } = useLiveSync()

  const [period, setPeriod] = useState(() => localStorage.getItem(PERIOD_KEY) || '1M')
  const [offset, setOffset] = useState(0)
  const periodDef = PERIODS.find(p => p.id === period) || PERIODS[2]
  const range = getRange(periodDef.kind, offset)
  function selectPeriod(id) { setPeriod(id); setOffset(0); localStorage.setItem(PERIOD_KEY, id) }

  const profileId = (typeof localStorage !== 'undefined' && localStorage.getItem('tradestats_risk_profile')) || 'ausgewogen'
  const profileFactor = PROFILE_FACTORS[profileId] ?? 0.075
  const liveBalance = (status?.connected ? (status.account?.balance ?? accountBalance) : accountBalance) || 0

  const full = useMemo(() => {
    if (!messages?.length) return null
    const mr = matchSignalsToTrades(messages, effectiveTrades)
    const exec = buildSignalExecution(mr, { liveBalance, profileFactor })
    // erster Trade = Floor für "verpasste Signale" (vorher wurde nicht getradet)
    const firstTradeMs = effectiveTrades.reduce((min, tr) => {
      const o = tr.openTime ? new Date(tr.openTime).getTime() : null
      return o != null && (min == null || o < min) ? o : min
    }, null)
    return { mr, exec, firstTradeMs }
  }, [messages, effectiveTrades, liveBalance, profileFactor])

  if (!available) {
    return (
      <div className="p-6 space-y-6"><Header t={t} />
        <div className="card p-8 flex flex-col items-center gap-3 text-center text-slate-400">
          <AlertTriangle size={28} className="text-[#f59e0b]" />
          <p className="text-sm max-w-md">Dein Backend kennt den <code>/signals</code>-Endpoint noch nicht. Starte das aktuelle Backend mit Telegram-Anbindung.</p>
        </div>
      </div>
    )
  }
  if (loading && !full) return <div className="p-6 space-y-6"><Header t={t} /><div className="card p-8 text-center text-slate-500 text-sm">Lade Signale…</div></div>
  if (!full) return (
    <div className="p-6 space-y-6"><Header t={t} />
      <div className="card p-8 flex flex-col items-center gap-3 text-center text-slate-500">
        <Radio size={28} className="text-[#8b5cf6]" /><p className="text-sm">Noch keine Signale empfangen{error ? ` (${error})` : ''}.</p>
      </div>
    </div>
  )

  // ── Zeitfilter anwenden ──
  const takenRows = full.exec.rows
    .filter(r => inRangeMs(r.trade.closeTime ? new Date(r.trade.closeTime).getTime() : null, range))
    .sort((a, b) => new Date(b.trade.closeTime || 0) - new Date(a.trade.closeTime || 0))   // neueste oben
  const overtraded   = full.mr.overtradedTrades.filter(tr => inRangeMs(tr.closeTime ? new Date(tr.closeTime).getTime() : null, range))
  const discretionary = full.mr.discretionaryTrades.filter(tr => inRangeMs(tr.closeTime ? new Date(tr.closeTime).getTime() : null, range))
  const missed = full.mr.unmatchedSignals
    .filter(s => s.ts && s.tp != null)
    .filter(s => full.firstTradeMs == null || new Date(s.ts).getTime() >= full.firstTradeMs)   // erst ab erstem Trade
    .filter(s => inRangeMs(new Date(s.ts).getTime(), range))
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))   // neueste oben

  const tradeCount = takenRows.length + overtraded.length + discretionary.length
  const adherencePct = tradeCount > 0 ? (takenRows.length / tradeCount) * 100 : 0
  const inRangeCnt = takenRows.filter(r => r.inRange).length
  const entryQualityPct = takenRows.length > 0 ? (inRangeCnt / takenRows.length) * 100 : 0
  const withTheo = takenRows.filter(r => r.theoProfit != null)
  const diff = withTheo.reduce((s, r) => s + (r.theoProfit - r.realized), 0)
  const diffColor = diff > 0 ? '#ef4444' : '#10b981'

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Header t={t} />
        {/* Zeitfilter */}
        <div className="flex items-center gap-2">
          {periodDef.kind && (
            <div className="flex items-center gap-1">
              <button onClick={() => setOffset(o => o - 1)} className="p-1.5 rounded-lg border border-[#2d3748] bg-[#131c2e] text-slate-400 hover:text-slate-200"><ChevronLeft size={14} /></button>
              {offset !== 0 && <button onClick={() => setOffset(0)} className="px-2 py-1 rounded-lg border border-[#2d3748] bg-[#131c2e] text-[11px] text-slate-400 hover:text-slate-200">Heute</button>}
              <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset >= 0} className="p-1.5 rounded-lg border border-[#2d3748] bg-[#131c2e] text-slate-400 hover:text-slate-200 disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          )}
          <div className="flex rounded-lg border border-[#1f2937] overflow-hidden">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => selectPeriod(p.id)}
                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${period === p.id ? 'bg-[#8b5cf6]/20 text-[#a78bfa]' : 'text-slate-500 hover:text-slate-300'}`}>
                {p.id === 'all' ? 'Alles' : p.id}
              </button>
            ))}
          </div>
        </div>
      </div>
      {range && <p className="text-[11px] text-slate-500 -mt-3">{rangeLabel(periodDef.kind, offset)}</p>}

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox icon={CheckCircle2} color="#10b981" label="Aus Signalen"
          value={`${takenRows.length}/${tradeCount}`}
          sub={`${adherencePct.toFixed(0)}% deiner Trades aus einem Signal`} />
        <StatBox icon={AlertTriangle} color="#f59e0b" label="Overtrading"
          value={overtraded.length}
          sub={`Re-Entries auf genommene Signale${discretionary.length ? ` · +${discretionary.length} diskretionär` : ''}`} />
        <StatBox icon={Target} color="#3b82f6" label="Entry-Treffer"
          value={`${entryQualityPct.toFixed(0)}%`}
          sub={`${inRangeCnt}/${takenRows.length} in der Signal-Range`} />
        <StatBox icon={TrendingUp} color={diffColor} label="Wie Robert vs. du"
          value={privacyMode ? '•••' : `${diff >= 0 ? '+' : ''}$${Math.abs(diff) >= 1000 ? (diff / 1000).toFixed(1) + 'k' : diff.toFixed(0)}`}
          sub={diff > 0 ? 'so viel mehr hätte Roberts Plan gebracht' : 'du warst besser als der Plan'} />
      </div>

      {/* ── 1) GENOMMENE Signale (oben) ── */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2"><Radio size={14} className="text-[#8b5cf6]" /><h3 className="text-sm font-semibold text-slate-200">Genommene Signale — Ausführung</h3></div>
          <span className="text-xs text-slate-500">{takenRows.length} Trades</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#1f2937]">
              {['Datum', 'Symbol', 'Seite', 'Lot Ist/Soll', 'Dein Entry', 'Signal-Range', 'Dein Exit', 'Signal-TP', 'Dein P&L', 'Wie Robert', 'Δ'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] text-slate-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {takenRows.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-slate-600 text-sm">Keine genommenen Signale in diesem Zeitraum.</td></tr>
              ) : takenRows.map((r, i) => {
                const tr = r.trade, sg = r.signal
                const rangeStr = sg.entryLow != null ? (sg.entryLow === sg.entryHigh ? `${sg.entryLow}` : `${sg.entryLow}–${sg.entryHigh}`) : '—'
                const dColor = r.theoProfit == null ? '#6b7280' : (r.theoProfit - r.realized) > 0 ? '#ef4444' : '#10b981'
                return (
                  <tr key={tr.id || i} className="border-b border-[#1f2937]/50 hover:bg-[#1a2233] transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">{tr.closeTime ? format(new Date(tr.closeTime), 'dd.MM HH:mm') : '—'}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-200">{tr.symbol}</td>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tr.type === 'BUY' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#ef4444]/10 text-[#ef4444]'}`}>{tr.type}</span></td>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                      {r.expectedLot == null ? <span className="text-slate-300">{(tr.volume ?? 0).toFixed(2)}<span className="text-slate-600"> / —</span></span>
                        : (() => { const dev = Math.abs((r.lotRatio ?? 1) - 1); const c = dev > 0.25 ? '#ef4444' : dev > 0.10 ? '#f59e0b' : '#10b981'; return <span style={{ color: c }}>{(tr.volume ?? 0).toFixed(2)} / {r.expectedLot.toFixed(2)}</span> })()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{tr.openPrice}</td>
                    <td className="px-4 py-2.5 font-mono text-xs"><span className={r.inRange ? 'text-[#10b981]' : 'text-slate-400'}>{rangeStr}</span>{r.inRange && <CheckCircle2 size={11} className="inline ml-1 text-[#10b981]" />}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{tr.closePrice ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{sg.tp ?? '—'}</td>
                    <td className="px-4 py-2.5"><span className={`font-mono font-semibold text-xs ${r.realized >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}><Pvt value={r.realized} /></span></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{r.theoProfit == null ? '—' : (privacyMode ? '•••' : `${r.theoProfit >= 0 ? '+' : ''}${r.theoProfit.toFixed(0)}`)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold" style={{ color: dColor }}>{r.theoProfit == null ? '—' : (privacyMode ? '•••' : `${(r.theoProfit - r.realized) >= 0 ? '+' : ''}${(r.theoProfit - r.realized).toFixed(0)}`)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 2) VERPASSTE Signale (unten) ── */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2"><XCircle size={14} className="text-[#ef4444]" /><h3 className="text-sm font-semibold text-slate-200">Verpasste Signale</h3></div>
          <span className="text-xs text-slate-500">{missed.length} nicht gehandelt</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#1f2937]">
              {['Datum', 'Symbol', 'Seite', 'Entry', 'TP'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] text-slate-500 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {missed.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-slate-600 text-sm">Keine verpassten Signale in diesem Zeitraum.</td></tr>
              ) : missed.slice(0, 40).map((s, i) => (
                <tr key={i} className="border-b border-[#1f2937]/50 hover:bg-[#1a2233] transition-colors">
                  <td className="px-4 py-2 text-slate-400 text-xs whitespace-nowrap">{format(new Date(s.ts), 'dd.MM HH:mm')}</td>
                  <td className="px-4 py-2 font-mono font-semibold text-slate-200">{s.symbol}</td>
                  <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.direction === 'LONG' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#ef4444]/10 text-[#ef4444]'}`}>{s.direction}</span></td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{s.entryLow != null ? (s.entryLow === s.entryHigh ? s.entryLow : `${s.entryLow}–${s.entryHigh}`) : '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{s.tp ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {missed.length > 40 && <p className="px-4 py-2 text-[11px] text-slate-600">… und {missed.length - 40} weitere.</p>}
      </div>
    </div>
  )
}
