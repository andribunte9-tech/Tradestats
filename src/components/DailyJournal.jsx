import { useState, useMemo, useRef, useEffect } from 'react'
import {
  ChevronDown, ChevronRight, ChevronLeft,
  TrendingUp, TrendingDown, Activity, Award,
  Sun, CalendarDays, Wifi, WifiOff,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, parseISO,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { useTrades } from '../hooks/useTrades'
import { useLiveSync } from '../hooks/useLiveSync'
import { groupTradesByDay } from '../utils/calculations'
import { Pvt } from '../hooks/usePrivacyMode'

/* ─── Sparkline SVG ──────────────────────────────────────────── */
function Sparkline({ trades, width = 120, height = 36 }) {
  if (!trades || trades.length < 2) return null

  const sorted = [...trades].sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))
  let cum = 0
  const points = sorted.map(t => { cum += t.profit; return cum })
  const min = Math.min(0, ...points)
  const max = Math.max(0, ...points)
  const range = max - min || 1

  const px = (i) => (i / (points.length - 1)) * width
  const py = (v) => height - ((v - min) / range) * height

  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`)
    .join(' ')

  const isPositive = points[points.length - 1] >= 0
  const color = isPositive ? '#10b981' : '#ef4444'

  // Fill path
  const fill = `${d} L ${px(points.length - 1).toFixed(1)} ${height} L 0 ${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`spark-grad-${width}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* zero line */}
      <line
        x1="0" y1={py(0).toFixed(1)}
        x2={width} y2={py(0).toFixed(1)}
        stroke="#1f2937" strokeWidth="1" strokeDasharray="3 2"
      />
      {/* fill */}
      <path d={fill} fill={`url(#spark-grad-${width})`} />
      {/* line */}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* end dot */}
      <circle
        cx={px(points.length - 1).toFixed(1)}
        cy={py(points[points.length - 1]).toFixed(1)}
        r="2.5" fill={color}
      />
    </svg>
  )
}

/* ─── Tag-Stats berechnen ────────────────────────────────────── */
function calcDayStats(trades) {
  const wins   = trades.filter(t => t.profit > 0)
  const losses = trades.filter(t => t.profit < 0)
  const grossProfit = wins.reduce((s, t) => s + t.profit, 0)
  const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.profit, 0))
  const commissions = trades.reduce((s, t) => s + (t.commission || 0) + (t.swap || 0), 0)
  const netPnl      = trades.reduce((s, t) => s + t.profit + (t.commission || 0) + (t.swap || 0), 0)
  const volume      = trades.reduce((s, t) => s + (t.volume || 0), 0)
  const pf          = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const winRate     = trades.length ? (wins.length / trades.length) * 100 : 0

  return {
    netPnl,
    grossPnl:     trades.reduce((s, t) => s + t.profit, 0),
    commissions,
    winRate,
    winners:      wins.length,
    losers:       losses.length,
    total:        trades.length,
    volume:       parseFloat(volume.toFixed(2)),
    profitFactor: Math.min(pf, 99.9),
  }
}

function fmtPnl(v, decimals = 2) {
  const s = v >= 0 ? '+' : ''
  return `${s}$${Math.abs(v).toFixed(decimals)}`
}

/* ─── Mini Kalender ─────────────────────────────────────────── */
function MiniCalendar({ tradesByDay, onDayClick, calMonth, setCalMonth }) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 1 })
    const end   = endOfWeek(endOfMonth(calMonth),     { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [calMonth])

  return (
    <div className="bg-[#0d1117] rounded-xl border border-[#1f2937] p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1f2937] transition-colors"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="text-xs font-semibold text-slate-300">
          {format(calMonth, 'MMM yyyy', { locale: de })}
        </span>
        <button
          onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1f2937] transition-colors"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[9px] text-slate-600 font-medium py-0.5">{d}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map(day => {
          const key      = format(day, 'yyyy-MM-dd')
          const inMonth  = isSameMonth(day, calMonth)
          const hasData  = !!tradesByDay[key]
          const pnl      = hasData ? tradesByDay[key].pnl : 0
          const todayDay = isToday(day)

          return (
            <button
              key={key}
              onClick={() => hasData && inMonth && onDayClick(key)}
              className={`
                h-6 w-full rounded text-[10px] font-medium transition-all
                ${!inMonth ? 'opacity-0 pointer-events-none' : ''}
                ${todayDay ? 'ring-1 ring-[#10b981]' : ''}
                ${hasData && inMonth
                  ? pnl >= 0
                    ? 'bg-[#10b981]/20 text-[#10b981] hover:bg-[#10b981]/35 cursor-pointer'
                    : 'bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/35 cursor-pointer'
                  : 'text-slate-600 hover:bg-[#1f2937]'
                }
              `}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Tag-Zeile (ausklappbar) ────────────────────────────────── */
function DayRow({ dateKey, dayData, isExpanded, onToggle, dayRef }) {
  const stats   = useMemo(() => calcDayStats(dayData.trades), [dayData])
  const date    = parseISO(dateKey)
  const isGreen = stats.netPnl >= 0
  const color   = isGreen ? '#10b981' : '#ef4444'
  const pfText  = stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)

  const STAT_GRID = [
    { label: 'Total Trades',   value: stats.total },
    { label: 'Winners',        value: stats.winners,                   color: '#10b981' },
    { label: 'Losers',         value: stats.losers,                    color: '#ef4444' },
    { label: 'Win Rate',       value: `${stats.winRate.toFixed(1)}%`,  color: stats.winRate >= 50 ? '#10b981' : '#ef4444' },
    { label: 'Gross P&L',      value: <Pvt value={stats.grossPnl} />,  color: stats.grossPnl >= 0 ? '#10b981' : '#ef4444' },
    { label: 'Commissions',    value: <Pvt value={stats.commissions} sign={false} />, color: '#f59e0b' },
    { label: 'Volume',         value: `${stats.volume} Lot` },
    { label: 'Profit Factor',  value: pfText,                          color: stats.profitFactor >= 1 ? '#10b981' : '#ef4444' },
  ]

  return (
    <div ref={dayRef} className="rounded-xl border border-[#1f2937] overflow-hidden mb-2 transition-all">
      {/* ── Collapsed Header ── */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-[#111827] transition-colors text-left"
      >
        {/* Expand arrow */}
        <div className="text-slate-600 shrink-0">
          {isExpanded
            ? <ChevronDown size={15} className="text-slate-400" />
            : <ChevronRight size={15} />}
        </div>

        {/* Color indicator */}
        <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: color + '80' }} />

        {/* Date */}
        <div className="min-w-[110px]">
          <div className="text-sm font-semibold text-slate-200">
            {format(date, 'EEE, dd. MMM', { locale: de })}
          </div>
          <div className="text-[11px] text-slate-600">
            {format(date, 'yyyy')}
          </div>
        </div>

        {/* Net P&L */}
        <div className="min-w-[80px]">
          <div className="text-base font-bold font-mono" style={{ color }}>
            <Pvt value={stats.netPnl} />
          </div>
          <div className="text-[10px] text-slate-600">Net P&L</div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-4 flex-1">
          {[
            { label: 'Trades', value: stats.total },
            { label: 'Win %',  value: `${stats.winRate.toFixed(0)}%` },
            { label: 'W / L',  value: `${stats.winners} / ${stats.losers}` },
          ].map(s => (
            <div key={s.label} className="hidden sm:block">
              <div className="text-xs font-semibold text-slate-300 font-mono">{s.value}</div>
              <div className="text-[10px] text-slate-600">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Sparkline */}
        <div className="shrink-0 opacity-80">
          <Sparkline trades={dayData.trades} width={100} height={30} />
        </div>
      </button>

      {/* ── Expanded Detail ── */}
      {isExpanded && (
        <div className="border-t border-[#1f2937] bg-[#0a0f1a] px-5 py-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {STAT_GRID.map(s => (
              <div key={s.label} className="bg-[#0d1117] rounded-lg px-3 py-2.5 border border-[#1f2937]">
                <div
                  className="text-sm font-bold font-mono"
                  style={{ color: s.color || '#e2e8f0' }}
                >
                  {s.value}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Trades Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1f2937]">
                  {['Zeit', 'Symbol', 'Typ', 'Volumen', 'Open', 'Close', 'P&L', 'Net P&L'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-slate-600 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...dayData.trades]
                  .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))
                  .map(trade => {
                    const netPnl = trade.profit + (trade.commission || 0) + (trade.swap || 0)
                    return (
                      <tr key={trade.id} className="border-b border-[#1f2937]/40 hover:bg-[#111827] transition-colors">
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {trade.closeTime ? format(new Date(trade.closeTime), 'HH:mm') : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-200">{trade.symbol}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            trade.type === 'BUY'
                              ? 'bg-[#10b981]/10 text-[#10b981]'
                              : 'bg-[#ef4444]/10 text-[#ef4444]'
                          }`}>{trade.type}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-400">{trade.volume}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{trade.openPrice?.toFixed(5)}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{trade.closePrice?.toFixed(5)}</td>
                        <td className="px-3 py-2">
                          <span className={`font-mono font-semibold ${trade.profit >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                            <Pvt value={trade.profit} />
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`font-mono font-bold ${netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                            <Pvt value={netPnl} />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Daily Journal ──────────────────────────────────────────── */
export default function DailyJournal() {
  const { effectiveTrades } = useTrades()
  const { status }          = useLiveSync()
  const isDemo              = !status.connected

  const [expandedDays, setExpandedDays] = useState(new Set())
  const [calMonth, setCalMonth]         = useState(new Date())
  const dayRefs                         = useRef({})

  const tradesByDay = useMemo(() => groupTradesByDay(effectiveTrades), [effectiveTrades])

  const sortedDays = useMemo(() =>
    Object.entries(tradesByDay).sort(([a], [b]) => b.localeCompare(a)),
    [tradesByDay]
  )

  // Monats-Stats für die aktive Kalender-Ansicht
  const monthKey  = format(calMonth, 'yyyy-MM')
  const monthDays = sortedDays.filter(([d]) => d.startsWith(monthKey))
  const monthPnl  = monthDays.reduce((s, [, v]) => s + v.pnl, 0)

  function toggleDay(key) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function scrollToDay(key) {
    // Kalendermonat anpassen
    setCalMonth(parseISO(key))
    // Tag aufklappen und scrollen
    setExpandedDays(prev => new Set([...prev, key]))
    setTimeout(() => {
      dayRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  function startMyDay() {
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    if (tradesByDay[todayKey]) {
      scrollToDay(todayKey)
    } else {
      // Heute noch kein Trading — scroll nach oben
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Beim ersten Laden: neuesten Tag aufklappen
  useEffect(() => {
    if (sortedDays.length > 0) {
      setExpandedDays(new Set([sortedDays[0][0]]))
    }
  }, []) // eslint-disable-line

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Haupt-Liste ── */}
      <div className="flex-1 overflow-y-auto p-6 min-w-0">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-white">Daily Journal</h1>
          <p className="text-sm text-slate-500 mt-0.5">{sortedDays.length} Trading-Tage</p>
        </div>

        {/* Tag-Liste */}
        {sortedDays.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-600">
            <CalendarDays size={36} className="mb-3 opacity-30" />
            <p className="text-sm">Noch keine Trades vorhanden.</p>
            <p className="text-xs mt-1">Importiere Trades oder verbinde MT5.</p>
          </div>
        ) : (
          sortedDays.map(([dateKey, dayData]) => (
            <DayRow
              key={dateKey}
              dateKey={dateKey}
              dayData={dayData}
              isExpanded={expandedDays.has(dateKey)}
              onToggle={() => toggleDay(dateKey)}
              dayRef={el => { dayRefs.current[dateKey] = el }}
            />
          ))
        )}
      </div>

      {/* ── Rechtes Panel ── */}
      <div className="w-64 shrink-0 border-l border-[#1f2937] bg-[#0a0f1a] flex flex-col gap-4 p-4 overflow-y-auto">

        {/* Start My Day Button */}
        <button
          onClick={startMyDay}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
            bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-semibold text-sm
            hover:from-[#0ea472] hover:to-[#048a5c] transition-all shadow-lg shadow-[#10b981]/20
            active:scale-[0.98]"
        >
          <Sun size={16} />
          Start my day
        </button>

        {/* DEMO Badge */}
        {isDemo && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/20">
            <WifiOff size={13} className="text-[#f59e0b] shrink-0" />
            <div>
              <div className="text-xs font-bold text-[#f59e0b]">DEMO</div>
              <div className="text-[10px] text-[#f59e0b]/70">Keine MT5-Verbindung</div>
            </div>
          </div>
        )}

        {/* LIVE Badge */}
        {!isDemo && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#10b981]/10 border border-[#10b981]/20">
            <Wifi size={13} className="text-[#10b981] shrink-0" />
            <div>
              <div className="text-xs font-bold text-[#10b981]">LIVE</div>
              <div className="text-[10px] text-[#10b981]/70">MT5 verbunden</div>
            </div>
          </div>
        )}

        {/* Mini Kalender */}
        <div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider font-medium mb-2 px-1">
            Navigation
          </div>
          <MiniCalendar
            tradesByDay={tradesByDay}
            onDayClick={scrollToDay}
            calMonth={calMonth}
            setCalMonth={setCalMonth}
          />
        </div>

        {/* Monats-Zusammenfassung */}
        <div>
          <div className="text-[10px] text-slate-600 uppercase tracking-wider font-medium mb-2 px-1">
            {format(calMonth, 'MMMM yyyy', { locale: de })}
          </div>
          <div className="space-y-2">
            {[
              {
                label: 'Net P&L',
                value: <Pvt value={monthPnl} />,
                color: monthPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]',
                icon: monthPnl >= 0 ? TrendingUp : TrendingDown,
                iconColor: monthPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]',
              },
              {
                label: 'Trading-Tage',
                value: monthDays.length,
                color: 'text-slate-200',
                icon: Activity,
                iconColor: 'text-[#3b82f6]',
              },
              {
                label: 'Gewinn-Tage',
                value: monthDays.filter(([, v]) => v.pnl > 0).length,
                color: 'text-[#10b981]',
                icon: Award,
                iconColor: 'text-[#f59e0b]',
              },
            ].map(({ label, value, color, icon: Icon, iconColor }) => (
              <div key={label}
                className="flex items-center justify-between bg-[#0d1117] rounded-lg px-3 py-2 border border-[#1f2937]">
                <div className="flex items-center gap-2">
                  <Icon size={12} className={iconColor} />
                  <span className="text-[11px] text-slate-500">{label}</span>
                </div>
                <span className={`text-xs font-bold font-mono ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
