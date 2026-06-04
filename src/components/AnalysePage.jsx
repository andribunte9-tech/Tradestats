import { useState, useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, Line, ComposedChart,
} from 'recharts'
import {
  TrendingUp, Trophy, Clock, Flame, Calendar as CalendarIcon,
  Heart, AlertTriangle, Calculator, Repeat, Layers, BarChart3, Info, Activity,
  Telescope, Award, Crosshair, Scale, ShieldCheck, Bug, BookOpen, Sparkles,
  Scaling, Link2, Zap,
} from 'lucide-react'
import { useTrades } from '../hooks/useTrades'
import { usePrivacyMode, Pvt } from '../hooks/usePrivacyMode'
import { useLiveSync } from '../hooks/useLiveSync'
import { useLanguage } from '../hooks/useLanguage'
import {
  buildParetoContribution, applyWhatIf, buildHoldTimeScatter,
  buildStreakStats, buildWeekHourHeatmap, calcUlcerIndex,
  calcRiskOfRuin, calcKelly, calcSequentialBias,
  buildTagComboMatrix, calcConsistency, buildEquityForecast,
  buildMfeMaeAnalysis, buildBestVsWorst, buildYearlyHeatmap,
  buildVolatilityNormalized, calcRecoveryFactor, buildMistakeAnalysis,
  buildWeeklyReport, buildCoachInsights, buildAvgHoldByDay,
  buildSizingConsistency, buildConcurrentPositions, buildTradingFrequency,
} from '../utils/analytics'
import { buildEquityCurve, calcStats, formatDuration } from '../utils/calculations'

const RISK_KEY = 'tradestats_risk_percent'

/* ─── Section Header ─────────────────────────────────────── */
function SectionTitle({ icon: Icon, title, subtitle, color = '#3b82f6', info }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <div className="p-2 rounded-lg" style={{ backgroundColor: color + '15' }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          {info && (
            <span className="relative group inline-flex">
              <Info size={12} className="text-slate-500 hover:text-slate-300 cursor-help" />
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50
                  hidden group-hover:block w-72 bg-[#1a2233] border border-[#374151]
                  rounded-lg px-3 py-2 text-[11px] text-slate-300 leading-relaxed shadow-xl
                  whitespace-normal"
              >
                {info}
              </span>
            </span>
          )}
        </div>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

/* ─── Stat Pill ──────────────────────────────────────────── */
function Pill({ label, value, color, sub }) {
  return (
    <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">{label}</div>
      <div className={`text-lg font-mono font-bold`} style={{ color }}>{value}</div>
      {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  )
}

/* ============================================================
 * 0. EQUITY FORECAST
 * ============================================================ */
// Labels werden über t() übersetzt — die Konstante hält nur Keys
const BASE_PERIODS = [
  { id: 7,    labelKey: 'fc.base.7d'  },
  { id: 30,   labelKey: 'fc.base.30d' },
  { id: 90,   labelKey: 'fc.base.90d' },
  { id: null, labelKey: 'fc.base.all' },
]
const FORECAST_HORIZONS = [
  { id: 30,  labelKey: 'fc.horizon.1m' },
  { id: 90,  labelKey: 'fc.horizon.3m' },
  { id: 180, labelKey: 'fc.horizon.6m' },
  { id: 365, labelKey: 'fc.horizon.1y' },
]

const TARGET_PCT_KEY = 'tradestats_forecast_target_pct'

function ForecastCard({ trades, accountBalance }) {
  const { t } = useLanguage()
  const [basePeriod, setBasePeriod]     = useState(30)
  const [forecastDays, setForecastDays] = useState(90)
  const [compound, setCompound]         = useState(true)
  const [targetPct, setTargetPct]       = useState(() => {
    const v = localStorage.getItem(TARGET_PCT_KEY)
    return v != null ? v : ''
  })

  function updateTargetPct(v) {
    setTargetPct(v)
    if (v === '' || v == null) localStorage.removeItem(TARGET_PCT_KEY)
    else localStorage.setItem(TARGET_PCT_KEY, String(v))
  }

  const { status } = useLiveSync()
  const mt5Equity  = status?.connected ? status.account?.equity : null
  const liveEquity = mt5Equity || accountBalance || 10000
  const usingLive  = mt5Equity != null

  const data = useMemo(() => buildEquityForecast({
    trades,
    basePeriodDays: basePeriod,
    forecastDays,
    startingBalance: accountBalance || 10000,
    currentEquity: mt5Equity,
    compound,
    targetDailyPct: targetPct === '' ? null : Number(targetPct),
  }), [trades, basePeriod, forecastDays, accountBalance, mt5Equity, compound, targetPct])

  if (!data) return null

  const positive = compound ? data.expectedDailyRate > 0 : data.expectedDailyPnl > 0
  const projColor = positive ? '#10b981' : '#ef4444'
  // milestone targets — anchored on live equity if available
  const milestones = useMemo(() => {
    if (!positive) return []
    if (compound && data.expectedDailyRate <= 0) return []
    if (!compound && data.expectedDailyPnl <= 0) return []
    const targets = [
      { label: 'Verdopplung',        value: liveEquity * 2 },
      { label: '+25%',               value: liveEquity * 1.25 },
      { label: 'Nächste $1k-Marke', value: Math.ceil(data.currentEquity / 1000) * 1000 + 1000 },
    ]
    return targets.map(t => {
      const need = t.value - data.currentEquity
      if (need <= 0) return { ...t, days: 0, reached: true }
      let days
      if (compound) {
        // Solve: currentEquity * (1 + r)^n = target  →  n = log(target/E0) / log(1+r)
        const ratio = t.value / data.currentEquity
        const r1    = 1 + data.expectedDailyRate
        days = r1 > 1 ? Math.ceil(Math.log(ratio) / Math.log(r1)) : Infinity
      } else {
        days = Math.ceil(need / data.expectedDailyPnl)
      }
      return { ...t, days, reached: false }
    }).filter(t => !t.reached || true)
  }, [data, liveEquity, positive, compound])

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Telescope}
          title={t('an.forecast')}
          subtitle={t('ac.forecast.subtitle', { range: t(BASE_PERIODS.find(p => p.id === basePeriod)?.labelKey || '') })}
          color="#3b82f6"
          info={t('ac.forecast.info')}
        />
        {usingLive && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold
            bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
            Live MT5-Equity
          </span>
        )}
      </div>
      <div className="p-4 space-y-4">
        {/* Realistic-Cap Warnung */}
        {data.wasCapped && compound && (
          <div className="rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3 flex items-start gap-3">
            <AlertTriangle size={14} className="text-[#f59e0b] shrink-0 mt-0.5" />
            <div className="text-[12px] text-slate-300 leading-relaxed">
              <span className="font-semibold text-[#f59e0b]">{t('fc.cap_lead')}</span>{' '}
              {t('fc.cap_body', {
                daily:  (data.rawMeanRate * 100).toFixed(2),
                weekly: ((Math.pow(1 + data.rawMeanRate, 5) - 1) * 100).toFixed(1),
                annual: ((Math.pow(1 + data.rawMeanRate, 252) - 1) * 100).toFixed(0),
                capW:   (data.realisticWeeklyCap * 100).toFixed(0),
                capD:   (data.realisticCap * 100).toFixed(2),
                capA:   ((Math.pow(1 + data.realisticCap, 252) - 1) * 100).toFixed(0),
              })}
            </div>
          </div>
        )}
        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">{t('fc.base_label')}</span>
            <div className="flex gap-0.5 bg-[#0d1117] border border-[#1f2937] rounded-lg p-0.5">
              {BASE_PERIODS.map(p => (
                <button
                  key={p.id || 'all'}
                  onClick={() => setBasePeriod(p.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                    ${basePeriod === p.id
                      ? 'bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30'
                      : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">{t('fc.mode_label')}</span>
            <div className="flex gap-0.5 bg-[#0d1117] border border-[#1f2937] rounded-lg p-0.5">
              <button
                onClick={() => setCompound(true)}
                title={t('fc.compound_tip')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                  ${compound
                    ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                    : 'text-slate-500 hover:text-slate-300'}`}
              >
                {t('fc.compound')}
              </button>
              <button
                onClick={() => setCompound(false)}
                title={t('fc.linear_tip')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                  ${!compound
                    ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                    : 'text-slate-500 hover:text-slate-300'}`}
              >
                {t('fc.linear')}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">{t('fc.horizon_label')}</span>
            <div className="flex gap-0.5 bg-[#0d1117] border border-[#1f2937] rounded-lg p-0.5">
              {FORECAST_HORIZONS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setForecastDays(p.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                    ${forecastDays === p.id
                      ? 'bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30'
                      : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Tagesziel:</span>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={targetPct}
                onChange={e => updateTargetPct(e.target.value)}
                placeholder="z.B. 0.5"
                className="input w-24 text-xs font-mono pr-6"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">%</span>
            </div>
            {targetPct !== '' && (
              <button
                onClick={() => updateTargetPct('')}
                className="text-[11px] text-slate-500 hover:text-slate-300"
                title="Tagesziel deaktivieren"
              >
                ×
              </button>
            )}
            <span className="text-[10px] text-slate-600">{t('fc.target_input_unit')}</span>
          </div>
        </div>

        {/* Target vs Actual banner */}
        {data.targetEnabled && (() => {
          const cur  = data.currentEquity
          const tgt  = data.targetCurrent
          const diff = cur - tgt
          const pct  = tgt > 0 ? (diff / tgt) * 100 : 0
          const ahead = diff >= 0
          return (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs"
              style={{
                borderColor: ahead ? '#10b98140' : '#f59e0b40',
                backgroundColor: ahead ? '#10b9810a' : '#f59e0b0a',
              }}
            >
              <span className="text-base">{ahead ? '🎯' : '⏳'}</span>
              <span className="text-slate-300 flex-1">
                <strong style={{ color: ahead ? '#10b981' : '#f59e0b' }}>
                  {ahead
                    ? t('fc.ahead_of_target', { pct: pct.toFixed(1) })
                    : t('fc.behind_target',   { pct: Math.abs(pct).toFixed(1) })}
                </strong>{' '}
                — {t('fc.target_explainer', {
                  pct:    Number(targetPct).toFixed(2),
                  target: tgt.toFixed(0),
                  current:cur.toFixed(0),
                  days:   forecastDays,
                  final:  data.targetFinal.toFixed(0),
                })}
              </span>
            </div>
          )
        })()}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Pill
            label={compound ? t('fc.avg_return_per_day') : 'Ø P&L / Tag'}
            value={compound
              ? (data.expectedDailyRate >= 0 ? '+' : '') + (data.expectedDailyRate * 100).toFixed(3) + '%'
              : (data.expectedDailyPnl  >= 0 ? '+' : '') + '$' + data.expectedDailyPnl.toFixed(2)
            }
            color={projColor}
            sub={t('fc.trading_days_short', { n: data.baseTradingDayCount })}
          />
          <Pill
            label={t('fc.current_equity')}
            value={'$' + data.currentEquity.toFixed(0)}
            color="#e2e8f0"
          />
          <Pill
            label={t('fc.in_x_days', { days: forecastDays })}
            value={'$' + data.finalEquity.toFixed(0)}
            color={projColor}
            sub={(data.finalProfit >= 0 ? '+' : '') + '$' + data.finalProfit.toFixed(0)}
          />
          <Pill
            label={t('fc.expected_return')}
            value={(data.finalReturn >= 0 ? '+' : '') + data.finalReturn.toFixed(1) + '%'}
            color={projColor}
            sub={`vs. ${usingLive ? t('app.live_mt5_equity') : t('app.starting_capital')} $${data.baseReference.toFixed(0)}`}
          />
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data.combined} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={projColor} stopOpacity={0.18} />
                <stop offset="100%" stopColor={projColor} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false} tickLine={false}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false} tickLine={false}
              width={55}
              tickFormatter={v => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0))}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const isProj = payload.some(p => p.dataKey === 'forecast' && p.value != null)
                return (
                  <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-400 mb-1">
                      {label} {isProj && <span className="text-[#3b82f6]">(Prognose)</span>}
                    </p>
                    {payload.map((p, i) => {
                      if (p.value == null) return null
                      const labels = {
                        actual:   'Equity',
                        forecast: 'Prognose',
                        upper:    'Optimistisch',
                        lower:    'Pessimistisch',
                        target:   'Ziel',
                      }
                      return (
                        <p key={i} className="font-mono" style={{ color: p.color }}>
                          {labels[p.dataKey] || p.dataKey}: ${p.value.toFixed(2)}
                        </p>
                      )
                    })}
                  </div>
                )
              }}
            />
            <ReferenceLine
              y={data.baseReference}
              stroke="#6b7280"
              strokeDasharray="3 3"
              label={{ value: usingLive ? 'Jetzt' : 'Start', position: 'left', fill: '#6b7280', fontSize: 9 }}
            />
            {/* Confidence band */}
            <Area type="monotone" dataKey="upper" stroke="none" fill="url(#forecastBand)" connectNulls={false} />
            <Area type="monotone" dataKey="lower" stroke="none" fill="#0f1724" connectNulls={false} />
            {/* Actual line */}
            <Area type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} fill="url(#actualFill)" dot={false} connectNulls={false} />
            {/* Forecast line (dashed) */}
            <Line type="monotone" dataKey="forecast" stroke={projColor} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
            {/* Target line (weekdays-only compound) */}
            {data.targetEnabled && (
              <Line type="monotone" dataKey="target" stroke="#fbbf24" strokeWidth={2} strokeDasharray="2 3" dot={false} connectNulls={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Milestones */}
        {positive && milestones.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Wenn das Tempo so bleibt — Ziele</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {milestones.map(m => {
                const date = new Date(Date.now() + m.days * 86400000)
                return (
                  <div key={m.label} className="rounded-lg border border-[#1f2937] bg-[#0d1117] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">{m.label}</span>
                      <span className="text-[10px] text-slate-600 font-mono">${m.value.toFixed(0)}</span>
                    </div>
                    <div className="mt-1.5">
                      {m.reached ? (
                        <span className="text-sm text-[#10b981] font-bold">✓ erreicht</span>
                      ) : (
                        <>
                          <span className="text-lg font-mono font-bold text-[#3b82f6]">
                            {m.days < 365 ? `${m.days} Tage` : `${(m.days / 365).toFixed(1)} Jahre`}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-2 font-mono">
                            ≈ {date.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!positive && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 text-xs text-slate-300">
            <AlertTriangle size={14} className="text-[#ef4444] flex-shrink-0 mt-0.5" />
            <span>{t('fc.negative_pace', { all: t(BASE_PERIODS.find(p => p.id === null)?.labelKey || '') })}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: '#10b981' }} />
            {t('fc.legend_actual')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: projColor }} />
            {t('fc.legend_forecast', { range: t(BASE_PERIODS.find(p => p.id === basePeriod)?.labelKey || '') })}
          </span>
          {data.targetEnabled && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: '#fbbf24' }} />
              {t('fc.legend_target', { pct: Number(targetPct).toFixed(2) })}
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-600">
          {t('fc.confidence_band')}
          {' '}
          {compound ? t('fc.compound_note') : t('fc.linear_note')}
        </p>
      </div>
    </div>
  )
}

/* ============================================================
 * 1. PARETO — Equity-Beitrag
 * ============================================================ */
function ParetoCard({ trades }) {
  const { t } = useLanguage()
  const data = useMemo(() => buildParetoContribution(trades), [trades])
  if (!data.rows.length) return null
  const top20 = data.rows.slice(0, 20).map((r, i) => ({
    name: `#${i + 1}`,
    pnl: r.pnl,
    cumPct: r.cumulativePct,
    symbol: r.symbol,
  }))

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Trophy}
          title={t('an.pareto')}
          subtitle={t('ac.pareto.subtitle', { n: data.topNCovers80 })}
          color="#f59e0b"
          info={t('ac.pareto.info')}
        />
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={top20} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={45} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={35} unit="%" domain={[0, 100]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-300 font-semibold">{d.symbol}</p>
                    <p className="font-mono" style={{ color: d.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                      {d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}
                    </p>
                    <p className="text-[#3b82f6] font-mono">Kumuliert: {d.cumPct.toFixed(1)}%</p>
                  </div>
                )
              }}
            />
            <Bar yAxisId="left" dataKey="pnl" radius={[3, 3, 0, 0]}>
              {top20.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.85} />)}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <ReferenceLine yAxisId="right" y={80} stroke="#3b82f6" strokeDasharray="3 3" />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500 mt-3">
          {t('ac.pareto.footer')}
        </p>
      </div>
    </div>
  )
}

/* ============================================================
 * 2. WAS-WÄRE-WENN
 * ============================================================ */
function WhatIfCard({ trades }) {
  const { t } = useLanguage()
  const [excludeWorstPct, setExcludeWorstPct] = useState(0)
  const [excludeFriday, setExcludeFriday]     = useState(false)
  const [excludeMonday, setExcludeMonday]     = useState(false)
  const [excludeShortHolds, setExcludeShortHolds] = useState(0)

  const filtered = useMemo(() => applyWhatIf(trades, {
    excludeWorstPct,
    excludeWeekdays: [
      ...(excludeFriday ? [5] : []),
      ...(excludeMonday ? [1] : []),
    ],
    excludeHoldLessThanMin: excludeShortHolds,
  }), [trades, excludeWorstPct, excludeFriday, excludeMonday, excludeShortHolds])

  const baseStats = useMemo(() => calcStats(trades), [trades])
  const newStats  = useMemo(() => calcStats(filtered), [filtered])
  const baseEq    = useMemo(() => buildEquityCurve(trades), [trades])
  const newEq     = useMemo(() => buildEquityCurve(filtered), [filtered])

  const combined = useMemo(() => {
    const map = new Map()
    baseEq.forEach(p => map.set(p.date, { date: p.date, original: p.equity, whatIf: null }))
    newEq.forEach(p => {
      if (map.has(p.date)) map.get(p.date).whatIf = p.equity
      else map.set(p.date, { date: p.date, original: null, whatIf: p.equity })
    })
    return [...map.values()]
  }, [baseEq, newEq])

  const deltaPnl = newStats.totalPnl - baseStats.totalPnl
  const removed  = trades.length - filtered.length

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Calculator}
          title={t('an.whatif')}
          subtitle={t('ac.whatif.subtitle')}
          color="#10b981"
          info={t('ac.whatif.info')}
        />
      </div>
      <div className="p-4 space-y-4">
        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500 block mb-1.5">
              Schlechteste {excludeWorstPct}% Trades ausschließen
            </label>
            <input
              type="range" min={0} max={30} step={1}
              value={excludeWorstPct}
              onChange={e => setExcludeWorstPct(Number(e.target.value))}
              className="w-full accent-[#10b981]"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 block mb-1.5">
              Trades &lt; {excludeShortHolds} min ausschließen
            </label>
            <input
              type="range" min={0} max={120} step={5}
              value={excludeShortHolds}
              onChange={e => setExcludeShortHolds(Number(e.target.value))}
              className="w-full accent-[#10b981]"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={excludeMonday} onChange={e => setExcludeMonday(e.target.checked)} className="accent-[#10b981]" />
              Montag-Trades raus
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={excludeFriday} onChange={e => setExcludeFriday(e.target.checked)} className="accent-[#10b981]" />
              Freitag-Trades raus
            </label>
          </div>
        </div>

        {/* Stats Compare */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Pill label="Trades" value={`${filtered.length} / ${trades.length}`} color="#e2e8f0" sub={`–${removed}`} />
          <Pill label="P&L Δ" value={(deltaPnl >= 0 ? '+' : '') + '$' + deltaPnl.toFixed(0)} color={deltaPnl >= 0 ? '#10b981' : '#ef4444'} />
          <Pill label="Win Rate" value={newStats.winRate.toFixed(1) + '%'} color={newStats.winRate >= baseStats.winRate ? '#10b981' : '#ef4444'} sub={`Vorher: ${baseStats.winRate.toFixed(1)}%`} />
          <Pill label="Profit Faktor" value={newStats.profitFactor === Infinity ? '∞' : newStats.profitFactor.toFixed(2)} color={newStats.profitFactor >= baseStats.profitFactor ? '#10b981' : '#ef4444'} sub={`Vorher: ${baseStats.profitFactor === Infinity ? '∞' : baseStats.profitFactor.toFixed(2)}`} />
        </div>

        {/* Compare Chart */}
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={combined} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={45} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-400">{label}</p>
                    {payload.map((p, i) => (
                      <p key={i} className="font-mono" style={{ color: p.color }}>
                        {p.name}: ${p.value?.toFixed(2)}
                      </p>
                    ))}
                  </div>
                )
              }}
            />
            <Area type="monotone" dataKey="original" name="Original" stroke="#6b7280" strokeWidth={1.5} fill="#6b7280" fillOpacity={0.1} dot={false} />
            <Area type="monotone" dataKey="whatIf"   name="Mit Filter" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.18} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ============================================================
 * 3. HOLD-TIME vs OUTCOME
 * ============================================================ */
function HoldTimeScatterCard({ trades, riskAmount }) {
  const { t } = useLanguage()
  const data = useMemo(() => buildHoldTimeScatter(trades, riskAmount), [trades, riskAmount])
  if (!data.length) return null
  // bucket-based averages for trend overlay
  const buckets = [
    { max: 0.5,  label: '<30m' },
    { max: 2,    label: '30m-2h' },
    { max: 6,    label: '2-6h' },
    { max: 24,   label: '6-24h' },
    { max: 999,  label: '>1d' },
  ]
  const summary = buckets.map(b => {
    const arr = data.filter(d => d.holdH > 0 && d.holdH <= b.max && (buckets.indexOf(b) === 0 || d.holdH > buckets[buckets.indexOf(b) - 1].max))
    if (!arr.length) return null
    const wins = arr.filter(d => d.win).length
    return {
      label: b.label,
      count: arr.length,
      winRate: (wins / arr.length) * 100,
      avgPnl: arr.reduce((s, d) => s + d.pnl, 0) / arr.length,
    }
  }).filter(Boolean)

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Clock}
          title={t('an.holdtime')}
          subtitle={t('ac.holdtime.subtitle')}
          color="#8b5cf6"
          info={t('ac.holdtime.info')}
        />
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              type="number" dataKey="holdH" name="Stunden" scale="log" domain={[0.01, 'dataMax']}
              tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={(v) => v < 1 ? `${(v*60).toFixed(0)}m` : `${v.toFixed(1)}h`}
            />
            <YAxis type="number" dataKey="pnl" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={45} />
            <ReferenceLine y={0} stroke="#374151" />
            <Tooltip
              cursor={{ stroke: '#374151', strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-300 font-semibold">{d.symbol}</p>
                    <p className="font-mono text-slate-400">Dauer: {d.holdH < 1 ? `${(d.holdH * 60).toFixed(0)}m` : `${d.holdH.toFixed(1)}h`}</p>
                    <p className="font-mono" style={{ color: d.pnl >= 0 ? '#10b981' : '#ef4444' }}>{d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}</p>
                  </div>
                )
              }}
            />
            <Scatter data={data} fill="#8b5cf6">
              {data.map((d, i) => (
                <Cell key={i} fill={d.win ? '#10b981' : '#ef4444'} fillOpacity={0.7} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        {summary.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
            {summary.map(s => (
              <div key={s.label} className="rounded-lg border border-[#1f2937] bg-[#0d1117] p-2 text-center">
                <div className="text-[10px] text-slate-500">{s.label}</div>
                <div className={`text-sm font-mono font-bold ${s.winRate >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  {s.winRate.toFixed(0)}% WR
                </div>
                <div className={`text-[10px] font-mono ${s.avgPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  Ø {s.avgPnl >= 0 ? '+' : ''}${s.avgPnl.toFixed(0)} · {s.count}T
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================
 * 4. STREAK-STATISTIK
 * ============================================================ */
function StreakStatsCard({ trades }) {
  const { t } = useLanguage()
  const stats = useMemo(() => buildStreakStats(trades), [trades])
  if (!stats) return null
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Repeat}
          title={t('an.streak')}
          subtitle={t('ac.streak.subtitle')}
          color="#06b6d4"
          info={t('ac.streak.info')}
        />
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Pill label="Max Gewinn-Serie" value={`${stats.maxWin}T`} color="#10b981" sub={`Ø ${stats.avgWin.toFixed(1)}`} />
          <Pill label="Max Verlust-Serie" value={`${stats.maxLoss}T`} color="#ef4444" sub={`Ø ${stats.avgLoss.toFixed(1)}`} />
          <Pill label="Streak-Zyklen" value={stats.streakCount} color="#e2e8f0" />
          <Pill label="WR nach 1 Loss" value={stats.condProb[1].rate != null ? stats.condProb[1].rate.toFixed(0) + '%' : '—'} color="#06b6d4" sub={`${stats.condProb[1].opps} Fälle`} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(n => {
            const cp = stats.condProb[n]
            return (
              <div key={n} className="rounded-lg border border-[#1f2937] bg-[#0d1117] p-2 text-center">
                <div className="text-[10px] text-slate-500">Nach {n} Loss{n>1?'es':''}</div>
                <div className={`text-sm font-mono font-bold ${
                  cp.rate == null ? 'text-slate-700' : cp.rate >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]'
                }`}>
                  {cp.rate != null ? cp.rate.toFixed(0) + '%' : 'n/a'}
                </div>
                <div className="text-[10px] text-slate-600">{cp.opps} Fälle</div>
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-slate-500">
          Wenn die WR nach Lossern systematisch von der Baseline abweicht, sind deine Trades nicht unabhängig — ein Hinweis auf Regime-Wechsel oder dein Verhalten.
        </p>
      </div>
    </div>
  )
}

/* ============================================================
 * 5. WOCHENTAG × STUNDE HEATMAP
 * ============================================================ */
function HeatmapCard({ trades }) {
  const { t } = useLanguage()
  const { grid, weekdayLabels } = useMemo(() => buildWeekHourHeatmap(trades), [trades])
  // find best/worst cells
  const allCells = grid.flat()
  const populated = allCells.filter(c => c.count > 0)
  const maxPnl = Math.max(0, ...populated.map(c => c.avgPnl))
  const minPnl = Math.min(0, ...populated.map(c => c.avgPnl))

  function cellColor(c) {
    if (!c.count) return '#0d1117'
    if (c.avgPnl > 0) {
      const intensity = maxPnl > 0 ? c.avgPnl / maxPnl : 0
      return `rgba(16, 185, 129, ${0.15 + intensity * 0.7})`
    } else if (c.avgPnl < 0) {
      const intensity = minPnl < 0 ? c.avgPnl / minPnl : 0
      return `rgba(239, 68, 68, ${0.15 + intensity * 0.7})`
    }
    return '#1f2937'
  }

  // active hours range (skip dead zones for compactness): show 0-23
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={CalendarIcon}
          title={t('an.heatmap')}
          subtitle={t('ac.heatmap.subtitle')}
          color="#ec4899"
          info={t('ac.heatmap.info')}
        />
      </div>
      <div className="p-4 space-y-2 overflow-x-auto">
        <div className="inline-flex flex-col gap-1 min-w-full">
          {/* Hour header */}
          <div className="flex gap-0.5 pl-8">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="w-6 text-[9px] text-center text-slate-600 font-mono">{h}</div>
            ))}
          </div>
          {/* Day rows */}
          {[1, 2, 3, 4, 5, 6, 0].map(day => (
            <div key={day} className="flex items-center gap-0.5">
              <div className="w-7 text-[10px] text-slate-500 font-medium">{weekdayLabels[day]}</div>
              <div className="w-1" />
              {grid[day].map(cell => (
                <div
                  key={cell.hour}
                  className="w-6 h-6 rounded-sm flex items-center justify-center text-[8px] font-mono font-bold border border-[#1f2937]"
                  style={{ backgroundColor: cellColor(cell), color: cell.count > 0 ? '#fff' : '#374151' }}
                  title={cell.count > 0
                    ? `${weekdayLabels[day]} ${cell.hour}:00\n${cell.count} Trades · WR ${cell.winRate?.toFixed(0)}% · Ø $${cell.avgPnl.toFixed(0)}`
                    : 'Keine Trades'}
                >
                  {cell.count > 0 ? cell.count : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(16,185,129,0.6)' }} />
            Gewinnzone
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(239,68,68,0.6)' }} />
            Verlustzone
          </span>
          <span className="text-slate-600">Zahl = Trade-Count</span>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * 6. MFE/MAE — Capture-Rate
 * ============================================================ */
function MfeMaeCard({ trades, mfeArchive, riskAmount }) {
  const { t } = useLanguage()
  const data = useMemo(() => buildMfeMaeAnalysis(trades, mfeArchive, riskAmount), [trades, mfeArchive, riskAmount])
  const hasData = data.sampleSize > 0

  if (!hasData) {
    return (
      <div className="card">
        <div className="card-header">
          <SectionTitle
            icon={Activity}
            title={t('an.mfe_mae')}
            subtitle={t('ac.mfemae.subtitle_empty')}
            color="#f97316"
          />
        </div>
        <div className="p-5">
          <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[#f97316]/8 border border-[#f97316]/20 text-xs text-slate-300">
            <Info size={14} className="text-[#f97316] flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-semibold text-[#f97316] mb-1">Datenerfassung läuft</p>
              <p>
                Das Backend zeichnet ab sofort den live P&L jeder offenen Position auf und merkt sich Maximum (MFE)
                + Minimum (MAE) während der Trade-Laufzeit. Sobald die ersten Trades nach diesem Update geschlossen werden,
                erscheint hier deine Capture-Rate.
              </p>
              <p className="text-slate-500 mt-2 font-mono text-[10px]">
                Capture = realisierter Gewinn / MFE  ·  &lt; 40% = zu früh raus  ·  &gt; 80% = zu gierig
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const captureColor = data.overallCapture == null ? '#6b7280'
    : data.overallCapture >= 0.7 ? '#10b981'
    : data.overallCapture >= 0.4 ? '#f59e0b'
    : '#ef4444'
  const verdict = data.overallCapture == null ? '—'
    : data.overallCapture >= 0.8 ? 'Eventuell zu gierig'
    : data.overallCapture >= 0.5 ? 'Solide'
    : data.overallCapture >= 0.3 ? 'Lässt Geld liegen'
    : 'Massiv zu früh raus'

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Activity}
          title={t('an.mfe_mae')}
          subtitle={`Wie viel vom verfügbaren Peak-Gewinn realisierst du? · ${data.sampleSize} getrackte Trades`}
          color="#f97316"
          info={t('ac.mfemae.info')}
        />
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Pill
            label="Capture-Rate"
            value={data.overallCapture != null ? (data.overallCapture * 100).toFixed(0) + '%' : '—'}
            color={captureColor}
            sub={verdict}
          />
          <Pill
            label="Realisiert"
            value={'$' + data.totalRealized.toFixed(0)}
            color="#10b981"
          />
          <Pill
            label="MFE (Peak-Summe)"
            value={'$' + data.totalMfe.toFixed(0)}
            color="#3b82f6"
          />
          <Pill
            label="Verschenkt"
            value={'$' + data.giveBackTotal.toFixed(0)}
            color="#ef4444"
            sub="MFE − realisiert (nur Gewinner)"
          />
        </div>

        {/* Scatter: Realized vs MFE */}
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              type="number" dataKey="mfe" name="MFE"
              tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => '$' + v.toFixed(0)}
            />
            <YAxis
              type="number" dataKey="realized" name="Realisiert"
              tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={50}
              tickFormatter={v => '$' + v.toFixed(0)}
            />
            <ReferenceLine y={0} stroke="#374151" />
            <Tooltip
              cursor={{ stroke: '#374151', strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                const cap = d.mfe > 0 ? (d.realized / d.mfe) * 100 : null
                return (
                  <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-300 font-semibold">{d.symbol}</p>
                    <p className="font-mono text-[#3b82f6]">MFE: ${d.mfe.toFixed(2)}</p>
                    <p className="font-mono text-[#ef4444]">MAE: ${d.mae.toFixed(2)}</p>
                    <p className="font-mono" style={{ color: d.realized >= 0 ? '#10b981' : '#ef4444' }}>
                      Realisiert: {d.realized >= 0 ? '+' : ''}${d.realized.toFixed(2)}
                    </p>
                    {cap != null && <p className="font-mono text-slate-400">Capture: {cap.toFixed(0)}%</p>}
                  </div>
                )
              }}
            />
            <Scatter data={data.rows}>
              {data.rows.map((d, i) => (
                <Cell key={i} fill={d.realized >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.7} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500">
          Jeder Punkt = ein abgeschlossener Trade. X = höchster unrealisierter Gewinn (MFE), Y = was du wirklich genommen hast.
          Eine perfekte Diagonal-Linie wäre 100% Capture — alles darunter ist Geld, das du am Höhepunkt hattest und wieder hergegeben hast.
        </p>
      </div>
    </div>
  )
}

/* ============================================================
 * 14. Best vs Worst Auto-Comparison
 * ============================================================ */
function BestVsWorstCard({ trades }) {
  const { t } = useLanguage()
  const data = useMemo(() => buildBestVsWorst(trades, 10), [trades])
  if (!data) {
    return (
      <div className="card">
        <div className="card-header">
          <SectionTitle
            icon={Crosshair}
            title={t('an.best_vs_worst').split('—')[0].trim()}
            subtitle={t('ac.bestworst.subtitle_empty')}
            color="#06b6d4"
          />
        </div>
        <div className="p-5 text-xs text-slate-500 flex items-center gap-2">
          <Info size={14} />
          <span>Mindestens 20 Trades nötig für aussagekräftigen Vergleich.</span>
        </div>
      </div>
    )
  }

  const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  const insights = []
  if (data.top.avgHold > data.bottom.avgHold * 1.5) {
    insights.push(`Top-Trades hältst du im Schnitt ${(data.top.avgHold / 60).toFixed(1)}h, Bottom-Trades nur ${(data.bottom.avgHold / 60).toFixed(1)}h — du steigst aus Verlierern zu schnell aus oder hältst Gewinner gut.`)
  } else if (data.bottom.avgHold > data.top.avgHold * 1.5) {
    insights.push(`Du hältst Verlierer (${(data.bottom.avgHold / 60).toFixed(1)}h) länger als Gewinner (${(data.top.avgHold / 60).toFixed(1)}h) — klassisches Loser-Riding-Muster.`)
  }
  if (data.top.topSymbol !== data.bottom.topSymbol) {
    insights.push(`Stärkstes Symbol oben: ${data.top.topSymbol} (${data.top.topSymbolPct.toFixed(0)}%). Schwächstes: ${data.bottom.topSymbol} (${data.bottom.topSymbolPct.toFixed(0)}%).`)
  }
  if (data.top.topDay != null && data.bottom.topDay != null && data.top.topDay !== data.bottom.topDay) {
    insights.push(`Gewinner-Cluster am ${WEEKDAYS[data.top.topDay]}, Verlierer-Cluster am ${WEEKDAYS[data.bottom.topDay]}.`)
  }
  if (data.bottom.avgVolume > data.top.avgVolume * 1.3) {
    const pct = ((data.bottom.avgVolume / data.top.avgVolume - 1) * 100).toFixed(0)
    insights.push(`Bei Verlierern handelst du ${pct}% größer als bei Gewinnern — Position-Sizing kippt invers zu deiner Edge.`)
  }

  function Block({ title, stats, accent }) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: accent + '40', backgroundColor: accent + '08' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] uppercase tracking-wider font-bold" style={{ color: accent }}>{title}</span>
          <span className="font-mono font-bold text-sm" style={{ color: accent }}>
            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(0)}
          </span>
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Win Rate</span>
            <span className="font-mono text-slate-300">{stats.winRate.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Ø Hold</span>
            <span className="font-mono text-slate-300">{stats.avgHold < 60 ? stats.avgHold.toFixed(0) + 'm' : (stats.avgHold / 60).toFixed(1) + 'h'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Top Symbol</span>
            <span className="font-mono text-slate-300">{stats.topSymbol} ({stats.topSymbolPct.toFixed(0)}%)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">BUY %</span>
            <span className="font-mono text-slate-300">{stats.typeBuyPct.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Bevorzugter Tag</span>
            <span className="font-mono text-slate-300">{stats.topDay != null ? WEEKDAYS[stats.topDay] : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Ø Volumen</span>
            <span className="font-mono text-slate-300">{stats.avgVolume.toFixed(2)}</span>
          </div>
          {stats.tags.length > 0 && (
            <div className="pt-1">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Top Tags</div>
              <div className="flex flex-wrap gap-1">
                {stats.tags.map(([t, c]) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#8b5cf6]/15 text-[#8b5cf6]">{t} ({c})</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Crosshair}
          title={t('an.best_vs_worst')}
          subtitle={t('ac.bestworst.subtitle')}
          color="#06b6d4"
          info={t('ac.bestworst.info')}
        />
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Block title="Top 10 Gewinner" stats={data.top} accent="#10b981" />
          <Block title="Bottom 10 Verlierer" stats={data.bottom} accent="#ef4444" />
        </div>
        {insights.length > 0 && (
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#06b6d4]/8 border border-[#06b6d4]/20 text-xs text-slate-300">
                <Sparkles size={13} className="text-[#06b6d4] flex-shrink-0 mt-0.5" />
                <span>{ins}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================
 * 15. GitHub-Style Yearly Heatmap
 * ============================================================ */
function YearlyHeatmapCard({ trades }) {
  const { t } = useLanguage()
  const cells = useMemo(() => buildYearlyHeatmap(trades, 365), [trades])
  const populated = cells.filter(c => c.count > 0)
  const maxAbs = Math.max(0.01, ...populated.map(c => Math.abs(c.pnl)))

  function cellColor(c) {
    if (!c.count) return '#0d1117'
    if (c.pnl > 0) {
      const i = Math.min(1, Math.abs(c.pnl) / maxAbs)
      return `rgba(16, 185, 129, ${0.18 + i * 0.7})`
    } else if (c.pnl < 0) {
      const i = Math.min(1, Math.abs(c.pnl) / maxAbs)
      return `rgba(239, 68, 68, ${0.18 + i * 0.7})`
    }
    return '#1f2937'
  }

  // organize into weeks (columns of 7 days). Start with the first cell's weekday.
  const firstDay = cells[0].dayOfWeek
  const padStart = (firstDay + 6) % 7   // align to Monday-first
  const grid = []
  let currentWeek = Array(padStart).fill(null)
  cells.forEach(c => {
    const idxInWeek = (c.dayOfWeek + 6) % 7
    if (currentWeek.length === 7) {
      grid.push(currentWeek)
      currentWeek = []
    }
    while (currentWeek.length < idxInWeek) currentWeek.push(null)
    currentWeek.push(c)
  })
  if (currentWeek.length > 0) grid.push(currentWeek)

  const positiveDays = populated.filter(c => c.pnl > 0).length
  const negativeDays = populated.filter(c => c.pnl < 0).length

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={CalendarIcon}
          title={t('an.yearly')}
          subtitle={t('ac.yearly.subtitle', { days: populated.length, greens: positiveDays, reds: negativeDays })}
          color="#10b981"
          info={t('ac.yearly.info')}
        />
      </div>
      <div className="p-4 overflow-x-auto">
        <div className="flex gap-0.5">
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((cell, di) => (
                <div
                  key={di}
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: cell ? cellColor(cell) : 'transparent' }}
                  title={cell
                    ? cell.count > 0
                      ? `${cell.date}: ${cell.count} Trade${cell.count !== 1 ? 's' : ''}, ${cell.pnl >= 0 ? '+' : ''}$${cell.pnl.toFixed(2)}`
                      : `${cell.date}: keine Trades`
                    : ''}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
          <span>Weniger</span>
          <div className="flex gap-0.5">
            {[0.2, 0.4, 0.6, 0.85].map(i => (
              <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(16,185,129,${i})` }} />
            ))}
          </div>
          <span>Mehr Gewinn</span>
          <span className="ml-4">·</span>
          <div className="flex gap-0.5">
            {[0.2, 0.4, 0.6, 0.85].map(i => (
              <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(239,68,68,${i})` }} />
            ))}
          </div>
          <span>Mehr Verlust</span>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * 16. Volatility-Normalized Returns
 * ============================================================ */
function VolNormCard({ trades }) {
  const { t } = useLanguage()
  const rows = useMemo(() => buildVolatilityNormalized(trades), [trades])
  if (!rows.length) return null
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Scale}
          title={t('an.vol_norm')}
          subtitle={t('ac.volnorm.subtitle')}
          color="#8b5cf6"
          info={t('ac.volnorm.info')}
        />
      </div>
      <div className="p-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-[#1f2937]">
              <th className="text-left py-2">Symbol</th>
              <th className="text-right py-2">Trades</th>
              <th className="text-right py-2">Ø P&L</th>
              <th className="text-right py-2">Std-Abw.</th>
              <th className="text-right py-2">WR</th>
              <th className="text-right py-2">Sharpe-like</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.symbol} className="border-b border-[#1f2937]/50">
                <td className="py-2 font-mono font-semibold text-slate-200">{r.symbol}</td>
                <td className="text-right text-slate-400">{r.trades}</td>
                <td className={`text-right font-mono ${r.mean >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  {r.mean >= 0 ? '+' : ''}${r.mean.toFixed(0)}
                </td>
                <td className="text-right font-mono text-slate-500">${r.std.toFixed(0)}</td>
                <td className="text-right font-mono text-slate-400">{r.winRate.toFixed(0)}%</td>
                <td className={`text-right font-mono font-bold ${
                  r.sharpeLike >= 0.3 ? 'text-[#10b981]' : r.sharpeLike >= 0 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                }`}>
                  {r.sharpeLike.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-500 mt-3">
          Sharpe-like = Ø P&L / Std-Abw. — Werte &gt; 0.3 bedeuten konsistente Edge, negativ = Roulette mit Verlust-Schlagseite.
        </p>
      </div>
    </div>
  )
}

/* ============================================================
 * 17. Recovery Factor
 * ============================================================ */
function RecoveryCard({ trades, accountBalance }) {
  const { t } = useLanguage()
  const rf = useMemo(() => calcRecoveryFactor(trades, accountBalance || 10000), [trades, accountBalance])
  if (rf.recoveryFactor == null) return null
  const value = rf.recoveryFactor
  const color = value >= 5 ? '#10b981' : value >= 3 ? '#22c55e' : value >= 1 ? '#f59e0b' : '#ef4444'
  const verdict = value >= 5 ? 'Elite' : value >= 3 ? 'Stark' : value >= 1 ? 'Akzeptabel' : 'Schlecht'
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={ShieldCheck}
          title={t('an.recovery')}
          subtitle={t('ac.recovery.subtitle')}
          color="#10b981"
          info={t('ac.recovery.info')}
        />
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2">
        <Pill label="Recovery Factor" value={value.toFixed(2)} color={color} sub={verdict} />
        <Pill label="Net P&L" value={(rf.totalPnl >= 0 ? '+' : '') + '$' + rf.totalPnl.toFixed(0)} color={rf.totalPnl >= 0 ? '#10b981' : '#ef4444'} />
        <Pill label="Max Drawdown" value={'$' + rf.maxDd.toFixed(0)} color="#ef4444" sub={rf.maxDdPct.toFixed(1) + '% vom Konto'} />
      </div>
    </div>
  )
}

/* ============================================================
 * 18. Mistake Cost Analysis
 * ============================================================ */
function MistakeCostCard({ trades }) {
  const { t } = useLanguage()
  const data = useMemo(() => buildMistakeAnalysis(trades), [trades])
  if (data.tradesWithMistakes === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <SectionTitle
            icon={Bug}
            title={t('an.mistakes')}
            subtitle={t('ac.mistakes.subtitle_empty')}
            color="#ef4444"
          />
        </div>
        <div className="p-5 text-xs text-slate-500 flex items-center gap-2">
          <Info size={14} />
          <span>Noch keine Trade mit Fehler-Tag versehen. Im Trade-Detail-Modal pro Trade die Fehler-Kategorien anhaken — diese Auswertung lebt auf, sobald Daten reinkommen.</span>
        </div>
      </div>
    )
  }
  const wrDelta = data.cleanWinRate - (data.dirtyAvg >= 0 ? 0 : 0)   // not used, keep visual
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Bug}
          title={t('an.mistakes')}
          subtitle={`${data.tradesWithMistakes} Trades mit Fehler-Tag · "saubere" Trades: ${data.cleanTrades}`}
          color="#ef4444"
          info={t('ac.mistakes.info')}
        />
      </div>
      <div className="p-4 space-y-4">
        {/* Clean vs Dirty comparison */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#10b981]/40 bg-[#10b981]/8 p-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-[#10b981] mb-1.5">Saubere Trades</div>
            <div className="text-lg font-mono font-bold text-[#10b981]">
              {data.cleanAvg >= 0 ? '+' : ''}${data.cleanAvg.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">WR {data.cleanWinRate.toFixed(0)}% · {data.cleanTrades}T</div>
          </div>
          <div className="rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/8 p-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-[#ef4444] mb-1.5">Mit Fehler markiert</div>
            <div className="text-lg font-mono font-bold text-[#ef4444]">
              {data.dirtyAvg >= 0 ? '+' : ''}${data.dirtyAvg.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Realisiert: {data.realizedFromMistakes >= 0 ? '+' : ''}${data.realizedFromMistakes.toFixed(0)}</div>
          </div>
        </div>

        {/* Per-mistake breakdown */}
        <div>
          <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mb-2">Kosten pro Fehler-Kategorie</p>
          <div className="space-y-1.5">
            {data.rows.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[#1f2937] bg-[#0d1117]">
                <span className="text-base">{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-300 font-medium">{m.label}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {m.count}T · WR {m.winRate.toFixed(0)}% · Ø {m.avgPnl >= 0 ? '+' : ''}${m.avgPnl.toFixed(0)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-mono font-bold`} style={{ color: m.color }}>
                    {m.totalCost.toFixed(0) === '0' ? '$0' : '$' + m.totalCost.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-slate-600">Gesamt-Kosten</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * 19. Coach Mode — Weekly Report
 * ============================================================ */
function WeeklyReportCard({ trades }) {
  const { t } = useLanguage()
  const data = useMemo(() => buildWeeklyReport(trades), [trades])
  const cur = data.current
  const prev = data.previous
  const positive = cur.pnl >= 0
  const better   = data.pnlDelta >= 0
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Award}
          title={t('an.coach')}
          subtitle={t('ac.weekly.subtitle', { date: data.weekStart })}
          color="#3b82f6"
          info={t('ac.weekly.info')}
        />
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Pill
            label="Diese Woche P&L"
            value={(positive ? '+' : '') + '$' + cur.pnl.toFixed(0)}
            color={positive ? '#10b981' : '#ef4444'}
            sub={`${cur.count} Trade${cur.count !== 1 ? 's' : ''}`}
          />
          <Pill
            label="Δ vs Vorwoche"
            value={(better ? '+' : '') + '$' + data.pnlDelta.toFixed(0)}
            color={better ? '#10b981' : '#ef4444'}
            sub={`${prev.count}T → ${cur.count}T`}
          />
          <Pill
            label="Win Rate"
            value={cur.winRate.toFixed(0) + '%'}
            color={cur.winRate >= 50 ? '#10b981' : '#ef4444'}
            sub={`Vorher: ${prev.winRate.toFixed(0)}%`}
          />
          <Pill
            label="Fehler-Trades"
            value={data.mistakeTrades}
            color={data.mistakeTrades === 0 ? '#10b981' : '#f59e0b'}
            sub={data.mistakeCost < 0 ? '$' + data.mistakeCost.toFixed(0) : '—'}
          />
        </div>

        <div className="space-y-2">
          {cur.best && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#10b981]/8 border border-[#10b981]/20 text-xs">
              <Trophy size={13} className="text-[#10b981] flex-shrink-0 mt-0.5" />
              <span className="text-slate-300">
                <strong className="text-[#10b981]">Bester Trade:</strong> {cur.best.symbol} {cur.best.type} →{' '}
                <span className="font-mono font-bold text-[#10b981]">+${(cur.best.profit + (cur.best.commission || 0) + (cur.best.swap || 0)).toFixed(2)}</span>
              </span>
            </div>
          )}
          {cur.worst && cur.worst.profit < 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#ef4444]/8 border border-[#ef4444]/20 text-xs">
              <AlertTriangle size={13} className="text-[#ef4444] flex-shrink-0 mt-0.5" />
              <span className="text-slate-300">
                <strong className="text-[#ef4444]">Größter Verlust:</strong> {cur.worst.symbol} {cur.worst.type} →{' '}
                <span className="font-mono font-bold text-[#ef4444]">${(cur.worst.profit + (cur.worst.commission || 0) + (cur.worst.swap || 0)).toFixed(2)}</span>
              </span>
            </div>
          )}
          {data.topSymbol && data.topSymbol[1] > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#3b82f6]/8 border border-[#3b82f6]/20 text-xs">
              <Sparkles size={13} className="text-[#3b82f6] flex-shrink-0 mt-0.5" />
              <span className="text-slate-300">
                <strong className="text-[#3b82f6]">Stärke:</strong> {data.topSymbol[0]} (+${data.topSymbol[1].toFixed(0)})
                {data.worstSymbol && data.worstSymbol[1] < 0 &&
                  <> · <strong className="text-[#ef4444]">Schwäche:</strong> {data.worstSymbol[0]} (${data.worstSymbol[1].toFixed(0)})</>
                }
              </span>
            </div>
          )}
          {data.mistakeTrades > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#f59e0b]/8 border border-[#f59e0b]/20 text-xs">
              <Bug size={13} className="text-[#f59e0b] flex-shrink-0 mt-0.5" />
              <span className="text-slate-300">
                <strong className="text-[#f59e0b]">Disziplin-Hinweis:</strong> {data.mistakeTrades} Trades mit Fehler-Tag —
                Kosten ${Math.abs(data.mistakeCost).toFixed(0)}. Eliminiere das, und deine Woche wäre{' '}
                <span className="font-mono font-bold text-[#10b981]">+${(cur.pnl - data.mistakeCost).toFixed(0)}</span>.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 * 7. ULCER INDEX
 * ============================================================ */
function UlcerCard({ trades, accountBalance }) {
  const { t } = useLanguage()
  const u = useMemo(() => calcUlcerIndex(trades, accountBalance || 10000), [trades, accountBalance])
  if (!trades.length) return null
  // qualitative scale
  const ulcerLevel = u.ulcer < 2 ? 'gering' : u.ulcer < 5 ? 'moderat' : u.ulcer < 10 ? 'hoch' : 'kritisch'
  const ulcerColor = u.ulcer < 2 ? '#10b981' : u.ulcer < 5 ? '#f59e0b' : u.ulcer < 10 ? '#f97316' : '#ef4444'
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Heart}
          title={t('an.ulcer')}
          subtitle={t('ac.ulcer.subtitle')}
          color="#ef4444"
          info={t('ac.ulcer.info')}
        />
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        <Pill label="Ulcer Index" value={u.ulcer.toFixed(2)} color={ulcerColor} sub={`Belastung: ${ulcerLevel}`} />
        <Pill label="Max Drawdown" value={u.maxDD.toFixed(2) + '%'} color="#ef4444" />
        <Pill label="Längste Underwater-Phase" value={`${u.longestUnderwaterDays.toFixed(0)}d`} color="#f97316" sub={`${u.longestUnderwaterTrades} Trades`} />
        <Pill label="Aktuell unter Peak?" value={u.longestUnderwaterTrades > 0 ? 'ja' : 'nein'} color={u.longestUnderwaterTrades > 0 ? '#ef4444' : '#10b981'} />
      </div>
    </div>
  )
}

/* ============================================================
 * 8 + 9. RISK OF RUIN + KELLY
 * ============================================================ */
function RiskOfRuinCard({ trades, accountBalance }) {
  const { t } = useLanguage()
  const baseRiskPct = parseFloat(localStorage.getItem(RISK_KEY) || '1')
  const [riskPct, setRiskPct] = useState(baseRiskPct)
  const stats = useMemo(() => calcStats(trades), [trades])
  const winRate     = stats.winRate / 100
  const payoffRatio = stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : stats.avgWin > 0 ? 99 : 0
  const ror = calcRiskOfRuin({ winRate, payoffRatio, riskPerTrade: riskPct / 100, ruinThreshold: 0.5 })
  const kelly = calcKelly({ winRate, payoffRatio })
  const kellyQuarter = kelly / 4
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={AlertTriangle}
          title={t('an.ror')}
          subtitle={t('ac.ror.subtitle')}
          color="#f59e0b"
          info={t('ac.ror.info')}
        />
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Pill label="Win Rate" value={(winRate * 100).toFixed(0) + '%'} color="#3b82f6" />
          <Pill label="Avg-Win / Avg-Loss" value={payoffRatio.toFixed(2)} color="#8b5cf6" />
          <Pill label="Kelly (voll)" value={kelly.toFixed(1) + '%'} color="#10b981" sub="Mathematisch optimal" />
          <Pill label="Kelly / 4 (empfohlen)" value={kellyQuarter.toFixed(2) + '%'} color="#10b981" sub="Realitäts-Buffer" />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1.5">
            Risiko pro Trade simulieren: <span className="font-mono text-slate-300">{riskPct.toFixed(2)}%</span>
          </label>
          <input
            type="range" min={0.1} max={10} step={0.1}
            value={riskPct}
            onChange={e => setRiskPct(Number(e.target.value))}
            className="w-full accent-[#f59e0b]"
          />
        </div>
        <div className="rounded-xl border p-3" style={{
          borderColor: ror > 20 ? '#ef444460' : ror > 5 ? '#f59e0b60' : '#10b98160',
          backgroundColor: ror > 20 ? '#ef44440a' : ror > 5 ? '#f59e0b0a' : '#10b9810a',
        }}>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Risk of Ruin (50% Drawdown)</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-mono font-bold" style={{
              color: ror > 20 ? '#ef4444' : ror > 5 ? '#f59e0b' : '#10b981',
            }}>
              {ror.toFixed(2)}%
            </span>
            <span className="text-[11px] text-slate-500">
              Wahrscheinlichkeit, irgendwann 50% deines Accounts zu verlieren bei {riskPct.toFixed(1)}% pro Trade
            </span>
          </div>
        </div>
        {kelly === 0 && (
          <p className="text-[11px] text-[#ef4444]">
            ⚠ Aktuelle Edge ist nicht positiv (WR × R) — Kelly wäre 0. Keine Position-Sizing-Optimierung möglich, bis die Strategie profitabel wird.
          </p>
        )}
      </div>
    </div>
  )
}

/* ============================================================
 * 10. SEQUENTIAL BIAS (REVENGE TRADING)
 * ============================================================ */
function SequentialCard({ trades }) {
  const { t } = useLanguage()
  const s = useMemo(() => calcSequentialBias(trades), [trades])
  if (!s) return null
  const wrLossDelta = s.afterLoss.winRate - s.baseline.winRate
  const wrWinDelta  = s.afterWin.winRate  - s.baseline.winRate
  const revenge = wrLossDelta < -10 && s.afterLoss.count >= 5
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Flame}
          title={t('an.sequence')}
          subtitle={t('ac.sequence.subtitle')}
          color="#ef4444"
          info={t('ac.sequence.info')}
        />
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'baseline',  label: 'Alle Trades',          data: s.baseline,   color: '#3b82f6' },
            { key: 'afterWin',  label: 'Nach Gewinn',          data: s.afterWin,   color: '#10b981' },
            { key: 'afterLoss', label: 'Nach Verlust',         data: s.afterLoss,  color: '#ef4444' },
          ].map(({ key, label, data, color }) => {
            const delta = key === 'afterLoss' ? wrLossDelta : key === 'afterWin' ? wrWinDelta : 0
            return (
              <div key={key} className="rounded-xl border p-3" style={{ borderColor: color + '30', backgroundColor: color + '08' }}>
                <div className="text-[10px] uppercase tracking-wide font-semibold mb-1.5" style={{ color }}>{label}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-mono font-bold text-slate-200">{data.winRate.toFixed(0)}%</span>
                  {key !== 'baseline' && Math.abs(delta) >= 1 && (
                    <span className={`text-[10px] font-mono ${delta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                      {delta >= 0 ? '+' : ''}{delta.toFixed(0)}pp
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">WR · {data.count} Trades</div>
                <div className={`text-[11px] font-mono mt-1 ${data.avgPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  Ø {data.avgPnl >= 0 ? '+' : ''}${data.avgPnl.toFixed(0)}
                </div>
              </div>
            )
          })}
        </div>
        {revenge && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 text-xs text-slate-300">
            <Flame size={14} className="text-[#ef4444] flex-shrink-0 mt-0.5" />
            <span>
              <strong className="text-[#ef4444]">Revenge-Trading-Muster:</strong> Nach Verlusten fällt deine WR um {Math.abs(wrLossDelta).toFixed(0)} Prozentpunkte.
              Lege eine Cool-Down-Regel fest (kein Trade in den nächsten 30min nach Loss).
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================
 * 11. TAG-COMBO MATRIX
 * ============================================================ */
function TagComboCard({ trades }) {
  const { t } = useLanguage()
  const { tags, matrix } = useMemo(() => buildTagComboMatrix(trades, 2), [trades])
  if (tags.length < 2) {
    return (
      <div className="card">
        <div className="card-header">
          <SectionTitle
            icon={Layers}
            title={t('an.tag_matrix')}
            subtitle={t('ac.tags.subtitle_empty')}
            color="#8b5cf6"
          />
        </div>
        <div className="p-5 text-xs text-slate-500 flex items-center gap-2">
          <Info size={14} />
          <span>Mindestens 2 unterschiedliche Tags nötig — taggle deine Trades konsequent (Setup-Typ, Session, Bias…), dann lebt diese Matrix auf.</span>
        </div>
      </div>
    )
  }

  // colors based on avgPnl
  const allValues = tags.flatMap(a => tags.map(b => matrix[a][b])).filter(Boolean).map(c => c.avgPnl)
  const maxV = Math.max(0, ...allValues)
  const minV = Math.min(0, ...allValues)
  function cellBg(v) {
    if (v == null) return '#0d1117'
    if (v.avgPnl > 0) return `rgba(16, 185, 129, ${0.15 + (v.avgPnl / Math.max(maxV, 1)) * 0.6})`
    if (v.avgPnl < 0) return `rgba(239, 68, 68, ${0.15 + (v.avgPnl / Math.min(minV, -1)) * 0.6})`
    return '#1f2937'
  }
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Layers}
          title={t('an.tag_matrix')}
          subtitle={t('ac.tags.subtitle')}
          color="#8b5cf6"
          info={t('ac.tags.info')}
        />
      </div>
      <div className="p-4 overflow-x-auto">
        <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="w-24" />
              {tags.map(t => (
                <th key={t} className="text-[10px] text-slate-500 font-medium px-1 rotate-[-25deg] origin-left whitespace-nowrap pb-3">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tags.map(a => (
              <tr key={a}>
                <td className="text-[10px] text-slate-500 font-medium pr-2 text-right whitespace-nowrap">{a}</td>
                {tags.map(b => {
                  const cell = matrix[a][b]
                  return (
                    <td key={b}>
                      <div
                        className="w-12 h-10 rounded flex flex-col items-center justify-center"
                        style={{ backgroundColor: cellBg(cell) }}
                        title={cell ? `${a} × ${b}: ${cell.count}T · WR ${cell.winRate.toFixed(0)}% · Ø $${cell.avgPnl.toFixed(0)}` : 'Zu wenig Daten'}
                      >
                        {cell ? (
                          <>
                            <span className="text-[10px] font-mono font-bold text-white">
                              {cell.avgPnl >= 0 ? '+' : ''}{cell.avgPnl.toFixed(0)}
                            </span>
                            <span className="text-[8px] text-slate-300">{cell.count}T</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-700">—</span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ============================================================
 * 12. CONSISTENCY
 * ============================================================ */
function ConsistencyCard({ trades }) {
  const { t } = useLanguage()
  const c = useMemo(() => calcConsistency(trades), [trades])
  if (!c) return null
  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={BarChart3}
          title={t('an.consistency')}
          subtitle={t('ac.consistency.subtitle')}
          color="#10b981"
          info={t('ac.consistency.info')}
        />
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        <Pill label="Monate gewinnend / verlierend" value={`${c.positiveMonths} / ${c.negativeMonths}`} color="#3b82f6" sub={`${c.monthCount} Monate gesamt`} />
        <Pill label="Ø Monatsergebnis" value={(c.meanMonthly >= 0 ? '+' : '') + '$' + c.meanMonthly.toFixed(0)} color={c.meanMonthly >= 0 ? '#10b981' : '#ef4444'} />
        <Pill label="Streuung (Std-Abw.)" value={'$' + c.stdMonthly.toFixed(0)} color="#f59e0b" sub={c.cv != null ? `CV: ${c.cv.toFixed(2)}` : ''} />
        <Pill
          label="Sharpe-like"
          value={c.sharpe != null ? c.sharpe.toFixed(2) : '—'}
          color={c.sharpe == null ? '#6b7280' : c.sharpe >= 1 ? '#10b981' : c.sharpe >= 0 ? '#f59e0b' : '#ef4444'}
          sub={c.sharpe >= 1 ? 'Sehr konsistent' : c.sharpe >= 0.5 ? 'Akzeptabel' : c.sharpe >= 0 ? 'Volatil' : 'Sehr volatil'}
        />
      </div>
    </div>
  )
}

/* ============================================================
 * SIZING-KONSISTENZ — Riskiere ich nach Verlusten mehr?
 * ============================================================ */
const SIZING_BUCKET_META = {
  opening:      { labelKey: 'sc.bucket.opening',      color: '#3b82f6' },
  afterWin:     { labelKey: 'sc.bucket.afterWin',     color: '#10b981' },
  afterLoss:    { labelKey: 'sc.bucket.afterLoss',    color: '#f59e0b' },
  after2Loss:   { labelKey: 'sc.bucket.after2Loss',   color: '#ef4444' },
  afterBigLoss: { labelKey: 'sc.bucket.afterBigLoss', color: '#ec4899' },
}

function SizingConsistencyCard({ trades }) {
  const { t } = useLanguage()
  const data = useMemo(() => buildSizingConsistency(trades), [trades])
  if (!data) return null

  const dev = data.maxDeviation.toFixed(0)
  const verdict = data.maxDeviation > 25
    ? { color: '#ef4444', label: t('sc.verdict.bad.title'),  msg: t('sc.verdict.bad.body',  { dev }) }
    : data.maxDeviation > 10
      ? { color: '#f59e0b', label: t('sc.verdict.warn.title'), msg: t('sc.verdict.warn.body', { dev }) }
      : { color: '#10b981', label: t('sc.verdict.good.title'), msg: t('sc.verdict.good.body', { dev }) }

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Scaling}
          title={t('sc.title')}
          subtitle={t('sc.subtitle', { dev })}
          color="#ec4899"
          info={t('sc.info')}
        />
      </div>
      <div className="p-4 space-y-4">
        {/* Verdict */}
        <div
          className="rounded-lg border p-3"
          style={{ backgroundColor: verdict.color + '15', borderColor: verdict.color + '40' }}
        >
          <p className="text-[12px] font-semibold mb-1" style={{ color: verdict.color }}>{verdict.label}</p>
          <p className="text-[12px] text-slate-300 leading-relaxed">{verdict.msg}</p>
        </div>

        {/* Buckets als Bars */}
        <div className="space-y-2">
          {data.buckets.filter(b => b.count > 0).map(b => {
            const meta = SIZING_BUCKET_META[b.id]
            const widthPct = data.overallAvgFactor > 0
              ? Math.min(100, (b.avgFactor / (data.overallAvgFactor * 2)) * 100)
              : 50
            const devColor = Math.abs(b.deviationPct) > 25 ? '#ef4444' : Math.abs(b.deviationPct) > 10 ? '#f59e0b' : '#10b981'
            return (
              <div key={b.id} className="rounded-lg border border-[#1f2937] bg-[#0d1117] p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[12px] font-semibold" style={{ color: meta.color }}>{t(meta.labelKey)}</span>
                    <span className="text-[10px] text-slate-500">{t('sc.trades_count', { n: b.count, plural: b.count !== 1 ? 's' : '' })}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[12px] text-slate-300">{t('sc.size_factor', { n: b.avgFactor.toFixed(2) })}</span>
                    {b.count >= 3 && (
                      <span className="font-mono text-[11px] font-semibold" style={{ color: devColor }}>
                        {b.deviationPct >= 0 ? '+' : ''}{b.deviationPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-[#1f2937] rounded-full overflow-hidden relative">
                  <div className="h-full rounded-full" style={{ width: `${widthPct}%`, backgroundColor: meta.color, opacity: 0.7 }} />
                  <div className="absolute top-0 bottom-0 w-px bg-slate-500" style={{ left: '50%' }} />
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-slate-600">
                  <span>{t('sc.wr')} {b.winRate.toFixed(0)}%</span>
                  <span className={b.pnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}>
                    {b.pnl >= 0 ? '+' : ''}${b.pnl.toFixed(0)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-slate-500">{t('sc.legend')}</p>
      </div>
    </div>
  )
}

/* ============================================================
 * KONKURRIERENDE POSITIONEN — Korrelations-Cluster
 * ============================================================ */
function ConcurrentPositionsCard({ trades }) {
  const { t } = useLanguage()
  const data = useMemo(() => buildConcurrentPositions(trades), [trades])
  if (!data) return null

  const avg  = data.avgConcurrent.toFixed(1)
  const max  = data.maxConcurrent
  const solo = data.soloTradesPct.toFixed(0)
  const verdict = data.avgConcurrent < 0.5
    ? { color: '#10b981', label: t('cp.verdict.good.title'), msg: t('cp.verdict.good.body', { avg, solo }) }
    : data.avgConcurrent < 2
      ? { color: '#f59e0b', label: t('cp.verdict.warn.title'), msg: t('cp.verdict.warn.body', { avg, max }) }
      : { color: '#ef4444', label: t('cp.verdict.bad.title'),  msg: t('cp.verdict.bad.body',  { avg, max }) }

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Link2}
          title={t('cp.title')}
          subtitle={t('cp.subtitle', { avg, max, solo })}
          color="#06b6d4"
          info={t('cp.info')}
        />
      </div>
      <div className="p-4 space-y-4">
        <div
          className="rounded-lg border p-3"
          style={{ backgroundColor: verdict.color + '15', borderColor: verdict.color + '40' }}
        >
          <p className="text-[12px] font-semibold mb-1" style={{ color: verdict.color }}>{verdict.label}</p>
          <p className="text-[12px] text-slate-300 leading-relaxed">{verdict.msg}</p>
        </div>

        {data.topPairs.length > 0 ? (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">
              {t('cp.top_pairs')}
            </p>
            <div className="space-y-1.5">
              {data.topPairs.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-[#1f2937] bg-[#0d1117] px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[12px] text-slate-200">{p.symbolA}</span>
                    <span className="text-slate-600">×</span>
                    <span className="font-mono text-[12px] text-slate-200">{p.symbolB}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 shrink-0">
                    <span>{t('cp.overlap_times', { count: p.count })}</span>
                    <span>{t('cp.overlap_hours', { hours: p.overlapHours.toFixed(1) })}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">{t('cp.tip')}</p>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500">{t('cp.no_overlap')}</p>
        )}
      </div>
    </div>
  )
}

/* ============================================================
 * TRADING-FREQUENZ-TREND — Overtrading-Erkennung
 * ============================================================ */
function TradingFrequencyCard({ trades }) {
  const { t } = useLanguage()
  const data = useMemo(() => buildTradingFrequency(trades), [trades])
  if (!data || !data.rows.length) return null

  const freq    = Math.abs(data.freqTrendPct).toFixed(0)
  const wr      = Math.abs(data.wrTrendPct).toFixed(1)
  const wr_sign = data.wrTrendPct >= 0 ? '+' : '-'

  const verdict = data.overtradingFlag
    ? { color: '#ef4444', label: t('tf.verdict.overtrading.title'), msg: t('tf.verdict.overtrading.body', { freq, wr }) }
    : data.freqTrendPct > 15
      ? { color: '#f59e0b', label: t('tf.verdict.rising.title'),  msg: t('tf.verdict.rising.body',  { freq, wr, wr_sign }) }
      : data.freqTrendPct < -15
        ? { color: '#3b82f6', label: t('tf.verdict.falling.title'), msg: t('tf.verdict.falling.body', { freq, wr, wr_sign }) }
        : { color: '#10b981', label: t('tf.verdict.stable.title'),  msg: t('tf.verdict.stable.body',  { freq }) }

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Zap}
          title={t('tf.title')}
          subtitle={t('tf.subtitle', { avg: data.avgTradesPerDay.toFixed(1), days: data.rows.length })}
          color="#f97316"
          info={t('tf.info')}
        />
      </div>
      <div className="p-4 space-y-3">
        <div
          className="rounded-lg border p-3 flex items-center justify-between gap-3"
          style={{ backgroundColor: verdict.color + '15', borderColor: verdict.color + '40' }}
        >
          <div className="min-w-0">
            <p className="text-[12px] font-semibold mb-0.5" style={{ color: verdict.color }}>{verdict.label}</p>
            <p className="text-[12px] text-slate-300 leading-relaxed">{verdict.msg}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-[#1f2937] bg-[#0d1117] p-2.5">
            <p className="text-slate-500 uppercase tracking-wide text-[10px] font-medium mb-1">{t('tf.first_half')}</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold text-slate-200">{data.firstHalfFreq.toFixed(1)}</span>
              <span className="text-slate-500 text-[10px]">{t('tf.trades_per_day')}</span>
            </div>
            <p className="text-slate-500 mt-1">WR: <span className="font-mono text-slate-300">{data.firstHalfWR.toFixed(0)}%</span></p>
          </div>
          <div className="rounded-lg border border-[#1f2937] bg-[#0d1117] p-2.5">
            <p className="text-slate-500 uppercase tracking-wide text-[10px] font-medium mb-1">{t('tf.second_half')}</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold text-slate-200">{data.secondHalfFreq.toFixed(1)}</span>
              <span className="text-slate-500 text-[10px]">{t('tf.trades_per_day')}</span>
            </div>
            <p className="text-slate-500 mt-1">WR: <span className="font-mono text-slate-300">{data.secondHalfWR.toFixed(0)}%</span></p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data.rows} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={d => d.slice(5)}
            />
            <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={40} unit="%" domain={[0, 100]} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-300 font-semibold">{label}</p>
                    <p className="text-[#f97316] font-mono">{d.trades} Trade{d.trades !== 1 ? 's' : ''} (Ø 7T: {d.rollingFreq.toFixed(1)})</p>
                    <p className="text-[#3b82f6] font-mono">WR-Tag: {d.winRate.toFixed(0)}% · WR-7T: {d.rollingWinRate.toFixed(0)}%</p>
                  </div>
                )
              }}
            />
            <Bar yAxisId="left" dataKey="trades" fill="#f97316" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
            <Line yAxisId="left" type="monotone" dataKey="rollingFreq" stroke="#f97316" strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="rollingWinRate" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="4 4" />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500">{t('tf.legend')}</p>
      </div>
    </div>
  )
}

/* ============================================================
 * HOLD-DURATION TREND — Ø Haltedauer pro Tag
 * ============================================================ */
const HOLD_RANGES = [
  { id: 'month', labelKey: 'hd.range.month', days: 30 },
  { id: 'year',  labelKey: 'hd.range.year',  days: 365 },
  { id: 'all',   labelKey: 'hd.range.all',   days: null },
]

function HoldRangeToggle({ range, setRange }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-0.5 bg-[#0d1117] border border-[#1f2937] rounded-lg p-0.5">
      {HOLD_RANGES.map(r => (
        <button
          key={r.id}
          onClick={() => setRange(r.id)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
            ${range === r.id
              ? 'bg-[#06b6d4]/15 text-[#06b6d4] border border-[#06b6d4]/30'
              : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t(r.labelKey)}
        </button>
      ))}
    </div>
  )
}

function HoldDurationTrendCard({ trades }) {
  const { t } = useLanguage()
  const [range, setRange] = useState('all')

  const filteredTrades = useMemo(() => {
    const cfg = HOLD_RANGES.find(r => r.id === range)
    if (!cfg?.days) return trades
    const cutoff = Date.now() - cfg.days * 86_400_000
    return trades.filter(t => t.closeTime && new Date(t.closeTime).getTime() >= cutoff)
  }, [trades, range])

  const data = useMemo(() => buildAvgHoldByDay(filteredTrades), [filteredTrades])
  if (!data.rows.length) {
    return (
      <div className="card">
        <div className="card-header">
          <SectionTitle
            icon={Clock}
            title={t('hd.title')}
            subtitle={t('hd.empty_subtitle')}
            color="#06b6d4"
          />
        </div>
        <div className="p-4 flex items-center justify-between">
          <HoldRangeToggle range={range} setRange={setRange} />
          <p className="text-xs text-slate-500">{t('hd.empty_hint')}</p>
        </div>
      </div>
    )
  }

  const trendUp     = data.trendPct > 5
  const trendDown   = data.trendPct < -5
  const trendColor  = trendUp ? '#f59e0b' : trendDown ? '#3b82f6' : '#10b981'
  const trendKey    = trendUp ? 'hd.trend.up' : trendDown ? 'hd.trend.down' : 'hd.trend.stable'
  const trendLabel  = t(trendKey, { pct: Math.abs(data.trendPct).toFixed(0) })

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Clock}
          title={t('hd.title')}
          subtitle={t('hd.subtitle', { days: data.rows.length, avg: formatDuration(data.overallAvg) })}
          color="#06b6d4"
          info={t('hd.info')}
        />
      </div>
      <div className="p-4 space-y-3">
        {/* Zeit-Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">{t('hd.range_label')}</span>
          <HoldRangeToggle range={range} setRange={setRange} />
          <span className="text-[11px] text-slate-600 ml-auto">{t('hd.trades_count', { n: filteredTrades.length })}</span>
        </div>

        {/* Trend-Statement */}
        <div
          className="rounded-lg border p-3 flex items-center justify-between gap-3"
          style={{ backgroundColor: trendColor + '15', borderColor: trendColor + '40' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">{t('hd.first_half')}</div>
            <div className="font-mono text-sm font-semibold text-slate-200">{formatDuration(data.firstHalfAvg)}</div>
            <div className="text-slate-600">→</div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">{t('hd.second_half')}</div>
            <div className="font-mono text-sm font-semibold text-slate-200">{formatDuration(data.secondHalfAvg)}</div>
          </div>
          <div className="font-mono text-sm font-bold shrink-0" style={{ color: trendColor }}>
            {data.trendPct >= 0 ? '+' : ''}{data.trendPct.toFixed(1)}%
          </div>
        </div>
        <p className="text-[12px] text-slate-400">{trendLabel}</p>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data.rows} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={d => d.slice(5)}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={55}
              tickFormatter={v => formatDuration(v)}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const day = payload[0].payload
                return (
                  <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 text-xs">
                    <p className="text-slate-300 font-semibold">{label}</p>
                    <p className="text-[#06b6d4] font-mono">{t('hd.tooltip.day', { value: formatDuration(day.avgMinutes) })}</p>
                    <p className="text-[#f59e0b] font-mono">{t('hd.tooltip.rolling', { value: formatDuration(day.rolling7) })}</p>
                    <p className="text-slate-500 text-[11px] mt-1">{day.count} {day.count === 1 ? t('common.trade') : t('common.trades')}</p>
                  </div>
                )
              }}
            />
            <ReferenceLine y={data.overallAvg} stroke="#475569" strokeDasharray="4 4" />
            <Bar dataKey="avgMinutes" fill="#06b6d4" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="rolling7" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-slate-500">{t('hd.legend')}</p>
      </div>
    </div>
  )
}

/* ============================================================
 * AI COACH — Aggregierte Insights
 * ============================================================ */
const SEVERITY_STYLE = {
  good: { color: '#10b981', bg: '#10b98115', border: '#10b98140', labelKey: 'coach.severity.good' },
  warn: { color: '#f59e0b', bg: '#f59e0b15', border: '#f59e0b40', labelKey: 'coach.severity.warn' },
  bad:  { color: '#ef4444', bg: '#ef444415', border: '#ef444440', labelKey: 'coach.severity.bad' },
  tip:  { color: '#3b82f6', bg: '#3b82f615', border: '#3b82f640', labelKey: 'coach.severity.tip' },
}

function buildCoachNarrative(insights, totalTrades, t) {
  if (!insights.length) return null
  const good = insights.filter(i => i.severity === 'good')
  const bad  = insights.filter(i => i.severity === 'bad' || i.severity === 'warn')
  const tips = insights.filter(i => i.severity === 'tip')

  const resolveMsg = (ins) => t(ins.messageKey, ins.vars)
  const resolveTitle = (ins) => t(ins.titleKey).toLowerCase()

  const intro = t('coach.intro', { count: totalTrades })

  let positive
  if (good.length) {
    const headlines = good.map(resolveTitle).join(', ')
    const closeKey  = good.length === 1 ? 'coach.positive_close.single' : 'coach.positive_close.multi'
    positive = `${t('coach.positive_lead')} ${good.map(resolveMsg).join(' ')} ${t(closeKey, { n: good.length, headlines })}`
  } else {
    positive = t('coach.positive_none')
  }

  let critical
  if (bad.length) {
    critical = `${t('coach.critical_lead')} ${bad.map(resolveMsg).join(' ')} ${t('coach.critical_close')}`
  } else {
    critical = t('coach.critical_none')
  }

  let outlook = ''
  if (tips.length) {
    outlook = `${t('coach.outlook_lead')} ${tips.map(resolveMsg).join(' ')}`
  }

  return [intro, positive, critical, outlook].filter(Boolean).join('\n\n')
}

function renderNarrative(text) {
  // Sehr leichtgewichtiger Markdown-Parser nur für **fett**.
  return text.split('\n\n').map((para, i) => {
    const parts = para.split(/(\*\*[^*]+\*\*)/g)
    return (
      <p key={i} className="text-[13px] text-slate-300 leading-relaxed">
        {parts.map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={j} className="text-white font-semibold">{p.slice(2, -2)}</strong>
          }
          return <span key={j}>{p}</span>
        })}
      </p>
    )
  })
}

function CoachCard({ trades, accountBalance, mfeArchive }) {
  const { t } = useLanguage()

  const insights = useMemo(() => {
    const stats = calcStats(trades)
    const pareto = buildParetoContribution(trades)
    const streak = buildStreakStats(trades)
    const sequence = calcSequentialBias(trades)
    const consistency = calcConsistency(trades)
    const recovery = calcRecoveryFactor(trades, accountBalance || 10000)
    const mfeMae = buildMfeMaeAnalysis(trades, mfeArchive || {})
    const wr = stats.winRate / 100
    const payoff = stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : 0
    const riskPct = parseFloat(localStorage.getItem(RISK_KEY) || '1') / 100
    const rorPct = calcRiskOfRuin({ winRate: wr, payoffRatio: payoff, riskPerTrade: riskPct })
    const ror = { ror: rorPct / 100 }
    return buildCoachInsights(trades, { stats, pareto, streak, mfeMae, sequence, consistency, recovery, ror })
  }, [trades, accountBalance, mfeArchive])

  const narrative = useMemo(() => buildCoachNarrative(insights, trades.length, t), [insights, trades.length, t])

  const counts = useMemo(() => {
    const c = { good: 0, warn: 0, bad: 0, tip: 0 }
    insights.forEach(i => { c[i.severity] = (c[i.severity] || 0) + 1 })
    return c
  }, [insights])

  return (
    <div className="card">
      <div className="card-header">
        <SectionTitle
          icon={Sparkles}
          title={t('coach.title')}
          subtitle={t('coach.subtitle', {
            count: insights.length,
            good:  counts.good,
            bad:   counts.warn + counts.bad,
            tip:   counts.tip,
          })}
          color="#8b5cf6"
          info={t('coach.info')}
        />
      </div>
      <div className="p-4 space-y-4">
        {insights.length === 0 ? (
          <p className="text-sm text-slate-500">{t('coach.no_data')}</p>
        ) : (
          <>
            {/* Narrative — der Coach erzählt */}
            {narrative && (
              <div className="rounded-xl border border-[#8b5cf6]/30 bg-[#8b5cf6]/5 p-4 space-y-3">
                {renderNarrative(narrative)}
              </div>
            )}

            {/* Kernpunkte als kompakte Severity-Pills */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">{t('coach.core_points')}</p>
              <div className="flex flex-wrap gap-2">
                {insights.map((ins, i) => {
                  const s = SEVERITY_STYLE[ins.severity] || SEVERITY_STYLE.tip
                  const title = t(ins.titleKey)
                  const message = t(ins.messageKey, ins.vars)
                  return (
                    <div
                      key={i}
                      className="inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border"
                      style={{ backgroundColor: s.bg, borderColor: s.border }}
                      title={message}
                    >
                      <span
                        className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                        style={{ backgroundColor: s.color, color: '#0d1117' }}
                      >
                        {t(s.labelKey)}
                      </span>
                      <span className="text-[12px] font-medium" style={{ color: s.color }}>{title}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ============================================================
 * MAIN PAGE
 * ============================================================ */
export default function AnalysePage() {
  const { effectiveTrades } = useTrades()
  const { accountBalance }  = usePrivacyMode()
  const { mfeMae }          = useLiveSync()
  const { t }               = useLanguage()
  const trades = useMemo(() => effectiveTrades.filter(t => t.closeTime), [effectiveTrades])

  const riskPct = parseFloat(localStorage.getItem(RISK_KEY) || '1')
  const riskAmount = (accountBalance || 10000) * (riskPct / 100)
  const mfeArchive = mfeMae?.archive || {}

  if (!trades.length) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-white mb-2">{t('an.title')}</h1>
        <p className="text-sm text-slate-500">{t('an.empty')}</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">{t('an.title')}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {t('an.subtitle', { count: 12, trades: trades.length })}
        </p>
      </div>

      {/* AI Coach — ganz oben für schnellen Überblick */}
      <CoachCard trades={trades} accountBalance={accountBalance} mfeArchive={mfeArchive} />

      {/* Prognose + Coach */}
      <ForecastCard trades={trades} accountBalance={accountBalance} />
      <WeeklyReportCard trades={trades} />

      {/* Jahres-Heatmap */}
      <YearlyHeatmapCard trades={trades} />

      {/* Edge */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ParetoCard trades={trades} />
        <WhatIfCard trades={trades} />
      </div>
      <HoldTimeScatterCard trades={trades} riskAmount={riskAmount} />
      <HoldDurationTrendCard trades={trades} />

      {/* Best vs Worst */}
      <BestVsWorstCard trades={trades} />

      {/* Verhalten */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <StreakStatsCard trades={trades} />
        <SequentialCard trades={trades} />
      </div>
      <SizingConsistencyCard trades={trades} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ConcurrentPositionsCard trades={trades} />
        <TradingFrequencyCard trades={trades} />
      </div>
      <HeatmapCard trades={trades} />

      {/* MFE/MAE + Fehler */}
      <MfeMaeCard trades={trades} mfeArchive={mfeArchive} riskAmount={riskAmount} />
      <MistakeCostCard trades={trades} />

      {/* Risiko */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <UlcerCard trades={trades} accountBalance={accountBalance} />
        <RecoveryCard trades={trades} accountBalance={accountBalance} />
        <ConsistencyCard trades={trades} />
      </div>
      <RiskOfRuinCard trades={trades} accountBalance={accountBalance} />

      {/* Mustererkennung */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TagComboCard trades={trades} />
        <VolNormCard trades={trades} />
      </div>
    </div>
  )
}
