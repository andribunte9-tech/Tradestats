import { useMemo, useState, useRef, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Activity, Target, Award, ChevronDown, X, Percent, BarChart2, CalendarDays } from 'lucide-react'
import { useTrades } from '../hooks/useTrades'
import { LiveSyncPanel } from './LiveSyncPanel'
import { usePrivacyMode, Pvt } from '../hooks/usePrivacyMode'
import { useLanguage } from '../hooks/useLanguage'
import {
  calcStats, buildEquityCurve, buildMonthlyPnl,
  buildDrawdownCurve, buildSymbolStats, buildDurationBySymbol,
  formatPnl, formatDuration, getSymbolCategory, calcBalanceAt,
} from '../utils/calculations'

/* ─── Custom Tooltip ─────────────────────────────────────── */
function ChartTooltip({ active, payload, label, balance }) {
  const { privacyMode, accountBalance } = usePrivacyMode()
  const refBalance = balance ?? accountBalance
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => {
        const v = p.value ?? 0
        const sign = v >= 0 ? '+' : ''
        const display = privacyMode
          ? `${sign}${(v / refBalance * 100).toFixed(2)}%`
          : `${sign}$${Math.abs(v).toFixed(2)}`
        return (
          <p key={i} style={{ color: p.color }} className="font-mono font-medium">
            {display}
          </p>
        )
      })}
    </div>
  )
}

/* ─── Stat Card ──────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, sub, color = 'text-white', iconColor = 'text-slate-500' }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg bg-[#1a2233]`}>
          <Icon size={16} className={iconColor} />
        </div>
      </div>
      <div className={`text-2xl font-bold font-mono ${color} mb-0.5`}>{value}</div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
    </div>
  )
}

/* ─── Avg Win/Loss Card (Tradezella-Style) ───────────────── */
function AvgWinLossCard({ avgWin, avgLoss }) {
  const ratio     = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0
  const ratioText = ratio === Infinity ? '∞' : ratio.toFixed(2)
  const total     = avgWin + avgLoss
  const greenPct  = total > 0 ? (avgWin / total) * 100 : 50
  const redPct    = 100 - greenPct

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-[#1a2233]">
          <TrendingUp size={16} className="text-slate-500" />
        </div>
      </div>

      {/* Ratio + Balken */}
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold font-mono text-white leading-none shrink-0">
          {ratioText}
        </span>

        <div className="flex-1 min-w-0">
          {/* Grün/Rot Balken */}
          <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]">
            <div className="rounded-l-full bg-[#10b981]" style={{ width: `${greenPct}%` }} />
            <div className="rounded-r-full bg-[#ef4444]" style={{ width: `${redPct}%` }} />
          </div>
          {/* Labels unter dem Balken */}
          <div className="flex justify-between mt-1.5">
            <Pvt value={avgWin}   decimals={0} sign={false} className="text-[11px] font-mono font-semibold text-[#10b981]" />
            <Pvt value={-avgLoss} decimals={0} sign={true}  className="text-[11px] font-mono font-semibold text-[#ef4444]" />
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-500 font-medium mt-2">Avg win/loss trade</div>
    </div>
  )
}

/* ─── Filter Bar ─────────────────────────────────────────── */
const CATEGORIES = [
  { id: 'alle',        key: 'journal.cat_all',        color: '#6b7280' },
  { id: 'forex',       key: 'journal.cat_forex',      color: '#3b82f6' },
  { id: 'commodities', key: 'journal.cat_commodities',color: '#f59e0b' },
  { id: 'indices',     key: 'journal.cat_indices',    color: '#8b5cf6' },
  { id: 'crypto',      key: 'journal.cat_crypto',     color: '#06b6d4' },
  { id: 'aktien',      key: 'journal.cat_stocks',     color: '#10b981' },
]

function FilterBar({ trades, activeCat, setActiveCat, activeSym, setActiveSym }) {
  const { t } = useLanguage()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Schließe Dropdown bei Klick außerhalb
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Symbole der aktiven Kategorie aus den Trades extrahieren
  const symbolsInCat = useMemo(() => {
    if (activeCat === 'alle') return []
    const set = new Set()
    trades.forEach(t => {
      if (getSymbolCategory(t.symbol) === activeCat) set.add(t.symbol)
    })
    return [...set].sort()
  }, [trades, activeCat])

  // Trade-Anzahl pro Kategorie
  const countByCat = useMemo(() => {
    const counts = {}
    trades.forEach(t => {
      const cat = getSymbolCategory(t.symbol)
      counts[cat] = (counts[cat] || 0) + 1
    })
    return counts
  }, [trades])

  function handleCatClick(catId) {
    if (catId === 'alle') {
      setActiveCat('alle')
      setActiveSym(null)
      setDropdownOpen(false)
      return
    }
    if (activeCat === catId) {
      // Gleiche Kategorie nochmal klicken → Dropdown toggeln
      setDropdownOpen(prev => !prev)
    } else {
      setActiveCat(catId)
      setActiveSym(null)
      setDropdownOpen(true)
    }
  }

  const activeCatObj = CATEGORIES.find(c => c.id === activeCat)

  return (
    <div className="flex items-center gap-2 flex-wrap" ref={dropdownRef}>
      {/* Kategorie-Tabs — jeder in eigenem relative-Wrapper */}
      {CATEGORIES.map(cat => {
        const isActive = activeCat === cat.id
        const count    = cat.id === 'alle' ? trades.length : (countByCat[cat.id] || 0)
        const isEmpty  = cat.id !== 'alle' && count === 0
        const showDrop = dropdownOpen && isActive && symbolsInCat.length > 0

        return (
          <div key={cat.id} className="relative">
            <button
              onClick={() => !isEmpty && handleCatClick(cat.id)}
              disabled={isEmpty}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                transition-all duration-150 border
                ${isActive
                  ? 'text-white border-transparent'
                  : isEmpty
                    ? 'text-slate-600 border-[#1f2937] bg-[#0f1724] cursor-not-allowed'
                    : 'text-slate-400 border-[#2d3748] bg-[#131c2e] hover:text-slate-200 hover:border-slate-600'
                }
              `}
              style={isActive ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
            >
              {t(cat.key)}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono
                ${isActive ? 'bg-black/20 text-white' : isEmpty ? 'bg-[#1a2030] text-slate-700' : 'bg-[#1f2937] text-slate-500'}`}>
                {count}
              </span>
              {!isEmpty && cat.id !== 'alle' && (
                <ChevronDown
                  size={11}
                  className={`transition-transform duration-150 ${showDrop ? 'rotate-180' : ''}`}
                />
              )}
            </button>

            {/* Dropdown direkt unter dem jeweiligen Button */}
            {showDrop && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-[#131c2e] border border-[#2d3748] rounded-xl shadow-2xl p-2 min-w-[180px]">
                <p className="text-[10px] text-slate-600 uppercase tracking-wider px-2 pb-2 font-medium">
                  {t('journal.symbol_choose')}
                </p>
                <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto">
                  {symbolsInCat.map(sym => (
                    <button
                      key={sym}
                      onClick={() => { setActiveSym(sym === activeSym ? null : sym); setDropdownOpen(false) }}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono
                        transition-colors text-left
                        ${activeSym === sym ? '' : 'text-slate-300 hover:bg-[#1f2937]'}`}
                      style={activeSym === sym ? { backgroundColor: cat.color + '33', color: cat.color } : {}}
                    >
                      <span>{sym}</span>
                      <span className="text-[10px] text-slate-600 ml-4">
                        {trades.filter(t => t.symbol === sym).length}T
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Aktiver Symbol-Filter Badge */}
      {activeSym && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-semibold text-white"
          style={{ backgroundColor: activeCatObj?.color }}
        >
          {activeSym}
          <button
            onClick={() => { setActiveSym(null); setDropdownOpen(false) }}
            className="hover:bg-black/20 rounded-full p-0.5 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Reset-Button */}
      {(activeCat !== 'alle' || activeSym) && !activeSym && (
        <button
          onClick={() => { setActiveCat('alle'); setActiveSym(null); setDropdownOpen(false) }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={11} /> {t('common.reset')}
        </button>
      )}
    </div>
  )
}

/* ─── Zeit-Filter ────────────────────────────────────────── */
const TIME_FILTERS = [
  { id: '1D',     labelKey: 'dash.tf_1d',  days: 1   },
  { id: '1W',     labelKey: 'dash.tf_1w',  days: 7   },
  { id: '1M',     labelKey: 'dash.tf_1m',  days: 30  },
  { id: '3M',     labelKey: 'dash.tf_3m',  days: 90  },
  { id: '6M',     labelKey: 'dash.tf_6m',  days: 180 },
  { id: '1Y',     labelKey: 'dash.tf_1y',  days: 365 },
  { id: 'all',    labelKey: 'dash.tf_all', days: null },
  { id: 'custom', labelKey: null,          days: null },   // Datum-Bereich
]

function getPeriodCutoff(period) {
  const tf = TIME_FILTERS.find(f => f.id === period)
  if (!tf?.days) return null
  // '1D' = ab Beginn des heutigen Tages (00:00), nicht "letzte 24 Stunden"
  if (period === '1D') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  return Date.now() - tf.days * 86_400_000
}

// customRange = { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } | null
function applyTimePeriod(trades, period, customRange) {
  if (period === 'custom' && customRange?.from) {
    const fromMs = new Date(customRange.from + 'T00:00:00').getTime()
    const toMs   = customRange.to
      ? new Date(customRange.to + 'T23:59:59').getTime()
      : Date.now()
    return trades.filter(t => {
      if (!t.closeTime) return false
      const ts = new Date(t.closeTime).getTime()
      return ts >= fromMs && ts <= toMs
    })
  }
  const cutoff = getPeriodCutoff(period)
  if (!cutoff) return trades
  return trades.filter(t => t.closeTime && new Date(t.closeTime).getTime() >= cutoff)
}

/* ─── Date Range Picker Popover ──────────────────────────── */
function DateRangePicker({ customRange, setCustomRange, onClose }) {
  const { t } = useLanguage()
  const [from, setFrom] = useState(customRange?.from ?? '')
  const [to,   setTo]   = useState(customRange?.to   ?? '')
  const ref = useRef(null)

  // Außen-Klick schließt Popover
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  function apply() {
    if (!from) return
    setCustomRange({ from, to: to || from })
    onClose()
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 z-50 bg-[#131c2e] border border-[#2d3748]
        rounded-xl shadow-2xl p-4 w-72"
    >
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">
        {t('dash.choose_timeframe')}
      </p>
      <div className="space-y-2">
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">{t('common.from')}</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="input w-full text-xs font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">{t('common.to')}</label>
          <input
            type="date"
            value={to}
            min={from}
            onChange={e => setTo(e.target.value)}
            className="input w-full text-xs font-mono"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={apply} className="btn-primary text-xs px-3 py-1.5 flex-1">
          {t('dash.apply')}
        </button>
        <button
          onClick={() => { setCustomRange(null); onClose() }}
          className="text-xs px-3 py-1.5 rounded-lg border border-[#2d3748] text-slate-400
            hover:text-slate-200 hover:border-[#374151] transition-colors"
        >
          {t('common.reset')}
        </button>
      </div>
    </div>
  )
}

/* ─── Section Header ─────────────────────────────────────── */
function SectionHeader({ title, sub }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

/* ─── Dashboard ──────────────────────────────────────────── */
export default function Dashboard() {
  const { trades, effectiveTrades, allTags } = useTrades()
  const { privacyMode, accountBalance } = usePrivacyMode()
  const { t } = useLanguage()

  // ── Filter State ──────────────────────────────────────────
  const [activeCat,   setActiveCat]   = useState('alle')
  const [activeSym,   setActiveSym]   = useState(null)
  const [activeTag,   setActiveTag]   = useState('ALL')
  const [timePeriod,  setTimePeriod]  = useState('all')
  const [customRange, setCustomRange] = useState(null)   // { from, to } | null
  const [showPicker,  setShowPicker]  = useState(false)

  // Gefilterte effektive Trades → Kategorie → Tag → Zeit
  const filteredTrades = useMemo(() => {
    let t = effectiveTrades
    if (activeSym)               t = t.filter(x => x.symbol === activeSym)
    else if (activeCat !== 'alle') t = t.filter(x => getSymbolCategory(x.symbol) === activeCat)
    if (activeTag !== 'ALL')     t = t.filter(x => (x.tags || []).includes(activeTag))
    return applyTimePeriod(t, timePeriod, customRange)
  }, [effectiveTrades, activeCat, activeSym, activeTag, timePeriod, customRange])

  // Tags die tatsächlich in den (vor-Tag-)gefilterten Trades vorkommen
  const availableTags = useMemo(() => {
    let base = effectiveTrades
    if (activeSym)               base = base.filter(x => x.symbol === activeSym)
    else if (activeCat !== 'alle') base = base.filter(x => getSymbolCategory(x.symbol) === activeCat)
    const counts = {}
    base.forEach(t => (t.tags || []).forEach(tag => { counts[tag] = (counts[tag] || 0) + 1 }))
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [effectiveTrades, activeCat, activeSym])

  const stats        = useMemo(() => calcStats(filteredTrades), [filteredTrades])
  const equityCurve  = useMemo(() => buildEquityCurve(filteredTrades), [filteredTrades])
  const monthlyPnl   = useMemo(() => buildMonthlyPnl(filteredTrades), [filteredTrades])
  const drawdownData = useMemo(() => buildDrawdownCurve(filteredTrades), [filteredTrades])
  const symbolStats  = useMemo(() => buildSymbolStats(filteredTrades), [filteredTrades])
  const durationData = useMemo(() => buildDurationBySymbol(filteredTrades), [filteredTrades])

  const pnlColor  = stats.totalPnl >= 0 ? '#10b981' : '#ef4444'
  const pfDisplay = stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)

  // Balance am Anfang der gewählten Periode (automatisch berechnet)
  const periodCutoff = timePeriod === 'custom' && customRange?.from
    ? new Date(customRange.from + 'T00:00:00').getTime()
    : getPeriodCutoff(timePeriod)
  const balanceAtPeriodStart = useMemo(() => {
    if (!periodCutoff) return accountBalance
    return calcBalanceAt(effectiveTrades, periodCutoff, accountBalance)
  }, [effectiveTrades, periodCutoff, accountBalance])

  // ROI % und Ø R:R — relativ zur Balance am Periodenanfang
  const roi    = balanceAtPeriodStart > 0 ? (stats.totalPnl / balanceAtPeriodStart) * 100 : 0
  const avgRR  = stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : stats.avgWin > 0 ? Infinity : 0
  const rrDisplay = avgRR === Infinity ? '∞' : avgRR.toFixed(2)

  // Y-Achsen-Formatter: $ oder ROI %
  const fmtTick = (v) => {
    if (privacyMode) {
      const pct = balanceAtPeriodStart > 0 ? (v / balanceAtPeriodStart * 100) : 0
      return `${pct >= 0 ? '' : '-'}${Math.abs(pct).toFixed(1)}%`
    }
    return v.toFixed(0)
  }

  const isFiltered = activeCat !== 'alle' || activeSym !== null || activeTag !== 'ALL'

  // Gruppenanzahl für Hinweis
  const groupCount = effectiveTrades.filter(t => t._virtual).length

  return (
    <div className="p-6 space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-bold text-white">{t('nav.dashboard')}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {isFiltered
            ? <>{t('dash.x_of_y_filtered', { shown: filteredTrades.length, total: effectiveTrades.length })}</>
            : <>{effectiveTrades.length} {t('common.trades')}{groupCount > 0 && <span className="text-slate-600"> {t('dash.x_trades_pos_grouped', { positions: trades.length, groups: groupCount })}</span>}</>
          }
        </p>
      </div>

      {/* ── Live MT5 Sync Panel (only visible when backend is running) ── */}
      <LiveSyncPanel />

      {/* ── Filter Bar + Zeit-Filter ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterBar
            trades={effectiveTrades}
            activeCat={activeCat}
            setActiveCat={setActiveCat}
            activeSym={activeSym}
            setActiveSym={setActiveSym}
          />
          {availableTags.length > 0 && (
            <select
              value={activeTag}
              onChange={e => setActiveTag(e.target.value)}
              className={`select text-xs px-2 py-1.5 rounded-full border transition-colors
                ${activeTag !== 'ALL'
                  ? 'bg-[#8b5cf6]/15 border-[#8b5cf6]/40 text-[#8b5cf6]'
                  : 'bg-[#131c2e] border-[#2d3748] text-slate-400 hover:text-slate-200'}`}
              title={t('common.filter')}
            >
              <option value="ALL">{t('journal.tag_all')}</option>
              {availableTags.map(([name, count]) => (
                <option key={name} value={name}>{name} ({count})</option>
              ))}
            </select>
          )}
          {activeTag !== 'ALL' && (
            <button onClick={() => setActiveTag('ALL')}
              className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
              <X size={11} /> {t('common.tag')}
            </button>
          )}
        </div>
        {/* Zeit-Filter */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#1f2937] rounded-lg p-1">
            {TIME_FILTERS.filter(tf => tf.id !== 'custom').map(tf => (
              <button
                key={tf.id}
                onClick={() => { setTimePeriod(tf.id); setCustomRange(null) }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 select-none
                  ${timePeriod === tf.id
                    ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                {t(tf.labelKey)}
              </button>
            ))}
          </div>

          {/* Custom Date Range Button */}
          <div className="relative">
            <button
              onClick={() => setShowPicker(p => !p)}
              title={t('dash.choose_date')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium
                transition-all duration-150 select-none
                ${timePeriod === 'custom'
                  ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                  : 'bg-[#0d1117] border-[#1f2937] text-slate-500 hover:text-slate-300 hover:border-[#374151]'
                }`}
            >
              <CalendarDays size={13} />
              {timePeriod === 'custom' && customRange?.from
                ? <span className="font-mono">
                    {customRange.from.slice(5)}{customRange.to && customRange.to !== customRange.from ? ` – ${customRange.to.slice(5)}` : ''}
                  </span>
                : <span>{t('dash.date_short')}</span>
              }
            </button>

            {showPicker && (
              <DateRangePicker
                customRange={customRange}
                setCustomRange={(r) => {
                  setCustomRange(r)
                  if (r) setTimePeriod('custom')
                  else   setTimePeriod('all')
                }}
                onClose={() => setShowPicker(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── 6 Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          icon={TrendingUp}
          label={t('dash.total_pnl')}
          value={<Pvt value={stats.totalPnl} />}
          color={stats.totalPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}
          iconColor={stats.totalPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}
          sub={`${stats.totalWins}W / ${stats.totalLosses}L`}
        />
        <StatCard
          icon={Percent}
          label={t('dash.roi')}
          value={`${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`}
          color={roi >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}
          iconColor="text-[#06b6d4]"
          sub={`${t('dash.basis_label')}: $${balanceAtPeriodStart >= 1000
            ? (balanceAtPeriodStart / 1000).toFixed(1) + 'K'
            : balanceAtPeriodStart.toFixed(0)}`}
        />
        <StatCard
          icon={Target}
          label={t('common.win_rate')}
          value={`${stats.winRate.toFixed(1)}%`}
          color={stats.winRate >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]'}
          iconColor="text-[#3b82f6]"
          sub={`${stats.totalTrades} ${t('common.trades')}`}
        />
        <StatCard
          icon={Award}
          label={t('common.profit_factor')}
          value={pfDisplay}
          color={stats.profitFactor >= 1 ? 'text-[#10b981]' : 'text-[#ef4444]'}
          iconColor="text-[#f59e0b]"
          sub={stats.profitFactor >= 1.5 ? t('dash.excellent') : stats.profitFactor >= 1 ? t('dash.good') : t('dash.bad')}
        />
        <StatCard
          icon={Activity}
          label={t('common.trades')}
          value={stats.totalTrades}
          iconColor="text-[#8b5cf6]"
          sub={t('dash.winners', { count: stats.totalWins })}
        />
        <StatCard
          icon={BarChart2}
          label={t('dash.avg_rr')}
          value={rrDisplay}
          color={avgRR >= 1 ? 'text-[#10b981]' : avgRR > 0 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}
          iconColor="text-[#ec4899]"
          sub={avgRR >= 2 ? t('dash.excellent') : avgRR >= 1 ? t('dash.good') : avgRR > 0 ? t('dash.improve') : '—'}
        />
      </div>

      {/* ── Equity Curve + Monthly P&L ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Equity Curve */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-sm font-semibold text-slate-200">{t('dash.equity_curve')}</h3>
            <span className={`text-sm font-mono font-bold ${pnlColor}`}>
              <Pvt value={stats.totalPnl} balance={balanceAtPeriodStart} />
            </span>
          </div>
          <div className="p-4">
            {equityCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={equityCurve} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={pnlColor} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={pnlColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} width={60} tickFormatter={fmtTick} />
                  <Tooltip content={<ChartTooltip balance={balanceAtPeriodStart} />} />
                  <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="equity" stroke={pnlColor} strokeWidth={2} fill="url(#equityGrad)" dot={false} activeDot={{ r: 4, fill: pnlColor }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>

        {/* Monthly P&L */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-sm font-semibold text-slate-200">{t('dash.monthly_pnl')}</h3>
          </div>
          <div className="p-4">
            {monthlyPnl.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyPnl} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} width={60} tickFormatter={fmtTick} />
                  <Tooltip content={<ChartTooltip balance={balanceAtPeriodStart} />} />
                  <ReferenceLine y={0} stroke="#374151" />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}
                    fill="#10b981"
                    label={false}
                    isAnimationActive={false}
                    // color each bar based on value
                    shape={(props) => {
                      const { x, y, width, height, value } = props
                      const color = value >= 0 ? '#10b981' : '#ef4444'
                      const barY     = value >= 0 ? y : y + height
                      const barH     = Math.abs(height)
                      return <rect x={x} y={barY} width={width} height={barH} fill={color} rx={3} />
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>
      </div>

      {/* ── Drawdown + Duration ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Drawdown Chart */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-sm font-semibold text-slate-200">{t('dash.drawdown')}</h3>
            <span className="text-sm font-mono text-[#ef4444]">
              <Pvt value={-stats.maxDrawdown} balance={balanceAtPeriodStart} /> max
            </span>
          </div>
          <div className="p-4">
            {drawdownData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={drawdownData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} width={60} tickFormatter={fmtTick} />
                  <Tooltip content={<ChartTooltip balance={balanceAtPeriodStart} />} />
                  <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fill="url(#ddGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>

        {/* Duration by Symbol */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-sm font-semibold text-slate-200">{t('dash.hold_duration')}</h3>
            <span className="text-xs text-slate-500">{t('common.duration')}</span>
          </div>
          <div className="p-4">
            {durationData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={durationData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="symbol" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 shadow-xl text-xs">
                          <p className="text-slate-400 mb-1">{label}</p>
                          <p className="text-[#3b82f6] font-mono">{formatDuration(payload[0].value)}</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="avgDuration" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </div>
      </div>

      {/* ── Symbol P&L Table ── */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-slate-200">{t('dash.pnl_by_symbol')}</h3>
        </div>
        {symbolStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1f2937]">
                  {[t('dash.symbol_col'), t('common.trades'), t('dash.winners_col'), t('common.win_rate'), t('common.pnl')].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs text-slate-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbolStats.map((s, i) => (
                  <tr key={s.symbol} className="border-b border-[#1f2937]/50 hover:bg-[#1a2233] transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-mono font-semibold text-slate-200">{s.symbol}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-400">{s.trades}</td>
                    <td className="px-5 py-3 text-slate-400">{s.wins}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-[#1f2937] rounded-full h-1.5 w-20">
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${s.winRate}%`, backgroundColor: s.winRate >= 50 ? '#10b981' : '#ef4444' }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 font-mono">{s.winRate.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-mono font-semibold ${s.pnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        <Pvt value={s.pnl} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-600 text-sm">Keine Trades vorhanden</div>
        )}
      </div>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="h-[180px] flex items-center justify-center text-slate-600 text-sm">
      Keine Daten verfügbar
    </div>
  )
}
