import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { ShieldAlert, TrendingDown, BarChart2, Settings2, Flame, AlertOctagon, Info, Activity, Anchor, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { useTrades } from '../hooks/useTrades'
import { usePrivacyMode, Pvt } from '../hooks/usePrivacyMode'
import { useLiveSync } from '../hooks/useLiveSync'
import { useLanguage } from '../hooks/useLanguage'
import { buildMaeRiskStats, buildMarginExposure } from '../utils/analytics'

const RISK_KEY = 'tradestats_risk_percent'

/* ─── R-Multiple Farbe ───────────────────────────────────── */
function rColor(r) {
  if (r >= 2)  return '#10b981'
  if (r >= 0)  return '#f59e0b'
  return '#ef4444'
}

/* ─── Tilt-Detector ──────────────────────────────────────── */
/**
 * Group trades by the number of consecutive losers immediately before each trade.
 * Buckets: 0 (after a win or first trade), 1, 2, 3+
 * For each bucket: count, win rate, avg volume, avg P&L, avg R-multiple.
 * Compared against baseline (bucket 0) → reveals if you're tilting after losers.
 */
function buildTiltStats(trades, riskAmount) {
  // sort oldest → newest
  const sorted = [...trades]
    .filter(t => t.closeTime)
    .sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime))

  const buckets = {
    0: { label: 'Normalzustand', desc: 'Nach Gewinn / Start', trades: [] },
    1: { label: '1 Loser davor', desc: 'Erste Niederlage',     trades: [] },
    2: { label: '2 Loser davor', desc: 'Frust zone',           trades: [] },
    3: { label: '3+ Loser davor', desc: 'Tilt-Bereich',        trades: [] },
  }

  let streak = 0
  for (const t of sorted) {
    const key = streak >= 3 ? 3 : streak
    buckets[key].trades.push(t)
    streak = t.profit < 0 ? streak + 1 : 0
  }

  function stats(arr) {
    if (!arr.length) return { count: 0, winRate: 0, avgVol: 0, avgPnl: 0, avgR: 0, totalPnl: 0 }
    const wins = arr.filter(t => t.profit > 0).length
    const vol  = arr.reduce((s, t) => s + (t.volume || 0), 0) / arr.length
    const pnl  = arr.reduce((s, t) => s + (t.profit || 0), 0)
    const r    = riskAmount > 0 ? arr.reduce((s, t) => s + (t.profit / riskAmount), 0) / arr.length : 0
    return {
      count:    arr.length,
      winRate:  (wins / arr.length) * 100,
      avgVol:   vol,
      avgPnl:   pnl / arr.length,
      totalPnl: pnl,
      avgR:     r,
    }
  }

  return [0, 1, 2, 3].map(k => ({ streak: k, ...buckets[k], ...stats(buckets[k].trades) }))
}

function TiltDetectorSection({ trades, riskAmount }) {
  const stats = useMemo(() => buildTiltStats(trades, riskAmount), [trades, riskAmount])
  const baseline = stats[0]
  const enoughData = baseline.count >= 5
  const tiltBuckets = stats.slice(2).filter(b => b.count >= 3)

  // tilt diagnostics
  const insights = []
  for (const b of tiltBuckets) {
    const wrDelta = b.winRate - baseline.winRate
    const volDelta = baseline.avgVol > 0 ? ((b.avgVol - baseline.avgVol) / baseline.avgVol) * 100 : 0
    const pnlDelta = b.avgPnl - baseline.avgPnl
    if (wrDelta < -10 || volDelta > 20 || pnlDelta < -baseline.avgPnl * 0.5) {
      insights.push({
        bucket: b,
        wrDelta,
        volDelta,
        pnlDelta,
        severity: wrDelta < -20 || volDelta > 40 ? 'high' : 'medium',
      })
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Flame size={14} className="text-[#ef4444]" />
          <h3 className="text-sm font-semibold text-slate-200">Tilt-Detektor</h3>
        </div>
        <span className="text-xs text-slate-500">Verhalten nach Verlust-Serien</span>
      </div>
      <div className="p-4 space-y-4">
        {!enoughData ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-[#0d1117] border border-[#1f2937] rounded-lg p-3">
            <Info size={14} />
            <span>Mindestens 5 Trades nach Gewinn-Phasen nötig, um eine Baseline zu berechnen — aktuell {baseline.count}.</span>
          </div>
        ) : (
          <>
            {/* 4 Bucket-Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {stats.map((b) => {
                const isBaseline = b.streak === 0
                const volDelta = baseline.avgVol > 0
                  ? ((b.avgVol - baseline.avgVol) / baseline.avgVol) * 100
                  : 0
                const wrDelta  = b.winRate - baseline.winRate
                const hasData  = b.count >= 3
                const accent   = isBaseline ? '#3b82f6'
                  : b.streak === 1 ? '#f59e0b'
                  : b.streak === 2 ? '#f97316'
                  : '#ef4444'
                return (
                  <div
                    key={b.streak}
                    className="rounded-xl border p-3.5"
                    style={{
                      borderColor: accent + (hasData ? '40' : '20'),
                      backgroundColor: accent + (hasData ? '0a' : '00'),
                      opacity: hasData ? 1 : 0.55,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
                        {b.label}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{b.count}T</span>
                    </div>
                    <p className="text-[10px] text-slate-600 mb-3">{b.desc}</p>
                    {hasData ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500">Win Rate</span>
                          <div className="flex items-baseline gap-1">
                            <span className={`text-sm font-mono font-bold ${b.winRate >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                              {b.winRate.toFixed(0)}%
                            </span>
                            {!isBaseline && Math.abs(wrDelta) >= 1 && (
                              <span className={`text-[9px] font-mono ${wrDelta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                                {wrDelta >= 0 ? '+' : ''}{wrDelta.toFixed(0)}pp
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500">Ø Volumen</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-mono font-bold text-slate-300">
                              {b.avgVol.toFixed(2)}
                            </span>
                            {!isBaseline && Math.abs(volDelta) >= 1 && (
                              <span className={`text-[9px] font-mono ${volDelta >= 0 ? 'text-[#ef4444]' : 'text-[#10b981]'}`}>
                                {volDelta >= 0 ? '+' : ''}{volDelta.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500">Ø P&L</span>
                          <span className={`text-sm font-mono font-bold ${b.avgPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                            <Pvt value={b.avgPnl} />
                          </span>
                        </div>
                        {riskAmount > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-500">Ø R</span>
                            <span className={`text-sm font-mono font-bold`} style={{ color: rColor(b.avgR) }}>
                              {b.avgR >= 0 ? '+' : ''}{b.avgR.toFixed(2)}R
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-700 italic mt-3">Zu wenig Daten</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Erkenntnisse */}
            {insights.length > 0 ? (
              <div className="space-y-2">
                {insights.map((ins, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2.5 rounded-lg border"
                    style={{
                      borderColor: ins.severity === 'high' ? '#ef444460' : '#f9731660',
                      backgroundColor: ins.severity === 'high' ? '#ef44440a' : '#f973160a',
                    }}
                  >
                    <AlertOctagon
                      size={14}
                      className="flex-shrink-0 mt-0.5"
                      style={{ color: ins.severity === 'high' ? '#ef4444' : '#f97316' }}
                    />
                    <div className="text-xs text-slate-300 leading-relaxed">
                      <span className="font-semibold">{ins.bucket.label}:</span>{' '}
                      {ins.volDelta > 20 && (
                        <>Position-Größe steigt um <span className="font-mono font-bold text-[#ef4444]">+{ins.volDelta.toFixed(0)}%</span>. </>
                      )}
                      {ins.wrDelta < -10 && (
                        <>Win-Rate fällt von <span className="font-mono">{baseline.winRate.toFixed(0)}%</span> auf{' '}
                        <span className="font-mono font-bold text-[#ef4444]">{ins.bucket.winRate.toFixed(0)}%</span>. </>
                      )}
                      {ins.bucket.avgPnl < 0 && baseline.avgPnl > 0 && (
                        <>Ø P&L kippt ins Negative. </>
                      )}
                      <span className="text-slate-500">→ klassisches Tilt-Muster.</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#10b981]/8 border border-[#10b981]/20 text-xs text-[#10b981]">
                <ShieldAlert size={13} />
                <span>Kein Tilt-Muster erkennbar — du behältst die Disziplin nach Verlust-Serien. Stark.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ─── MAE-Risiko-Card (Konzept A) ─────────────────────────── */
function MaeRiskCard({ trades, mfeArchive, accountBalance }) {
  const { t } = useLanguage()
  const data = useMemo(
    () => buildMaeRiskStats(trades, mfeArchive, accountBalance || 10000),
    [trades, mfeArchive, accountBalance]
  )

  if (!data || data.sampleSize < 3) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[#06b6d4]" />
            <h3 className="text-sm font-semibold text-slate-200">{t('rt.mae.title')}</h3>
          </div>
          <span className="text-xs text-slate-500">{t('rt.mae.empty')}</span>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">{t('rt.mae.empty_body', { count: data?.sampleSize || 0 })}</p>
        </div>
      </div>
    )
  }

  const p95 = data.p95MaePct.toFixed(1)
  const abs = data.p95MaeAbs.toFixed(0)
  const verdict = data.p95MaePct > 5
    ? { color: '#ef4444', label: t('rt.mae.verdict.bad.title'),  msg: t('rt.mae.verdict.bad.body',  { p95, abs }) }
    : data.p95MaePct > 2
      ? { color: '#f59e0b', label: t('rt.mae.verdict.warn.title'), msg: t('rt.mae.verdict.warn.body', { p95 }) }
      : { color: '#10b981', label: t('rt.mae.verdict.good.title'), msg: t('rt.mae.verdict.good.body', { p95 }) }

  const recoveryColor = data.recoveryRate >= 30 ? '#10b981' : data.recoveryRate >= 15 ? '#f59e0b' : '#ef4444'
  const giveBackColor = data.giveBackRate <= 15 ? '#10b981' : data.giveBackRate <= 30 ? '#f59e0b' : '#ef4444'

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[#06b6d4]" />
          <h3 className="text-sm font-semibold text-slate-200">{t('rt.mae.title')}</h3>
          <span title={t('rt.mae.info')}>
            <Info size={11} className="text-slate-500 cursor-help" />
          </span>
        </div>
        <span className="text-xs text-slate-500">{t('rt.mae.subtitle', { count: data.sampleSize })}</span>
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

        {/* Kernzahlen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1 font-medium">{t('rt.mae.avg_mae')}</p>
            <p className="text-lg font-mono font-bold text-slate-200"><Pvt value={data.avgMaeAbs} sign={false} /></p>
            <p className="text-[10px] text-slate-600 font-mono">{t('rt.mae.pct_account', { pct: data.avgMaePct.toFixed(2) })}</p>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1 font-medium">{t('rt.mae.median')}</p>
            <p className="text-lg font-mono font-bold text-slate-200"><Pvt value={data.p50MaeAbs} sign={false} /></p>
            <p className="text-[10px] text-slate-600 font-mono">{t('rt.mae.pct_account', { pct: data.p50MaePct.toFixed(2) })}</p>
          </div>
          <div className="rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-3">
            <p className="text-[10px] text-[#f59e0b] uppercase tracking-wide mb-1 font-medium">{t('rt.mae.p95')}</p>
            <p className="text-lg font-mono font-bold text-[#f59e0b]"><Pvt value={data.p95MaeAbs} sign={false} /></p>
            <p className="text-[10px] text-[#f59e0b]/80 font-mono">{t('rt.mae.pct_account', { pct: data.p95MaePct.toFixed(2) })}</p>
          </div>
          <div className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/5 p-3">
            <p className="text-[10px] text-[#ef4444] uppercase tracking-wide mb-1 font-medium">{t('rt.mae.worst')}</p>
            <p className="text-lg font-mono font-bold text-[#ef4444]"><Pvt value={data.maxMaeAbs} sign={false} /></p>
            <p className="text-[10px] text-[#ef4444]/80 font-mono">{t('rt.mae.pct_account', { pct: data.maxMaePct.toFixed(2) })}</p>
          </div>
        </div>

        {/* Verteilung */}
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">{t('rt.mae.distribution')}</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.histogram} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const total = data.sampleSize
                  const pct = (payload[0].value / total * 100).toFixed(0)
                  return (
                    <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 shadow-xl text-xs">
                      <p className="text-slate-400 mb-1">{label} MAE</p>
                      <p className="text-white font-mono font-semibold">{t('rt.mae.tooltip', { count: payload[0].value, pct })}</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {data.histogram.map((entry, i) => (
                  <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recovery / Give-Back */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('rt.mae.recovery')}</span>
              <span className="text-base font-mono font-bold" style={{ color: recoveryColor }}>{data.recoveryRate.toFixed(0)}%</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">{t('rt.mae.recovery_hint')}</p>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('rt.mae.giveback')}</span>
              <span className="text-base font-mono font-bold" style={{ color: giveBackColor }}>{data.giveBackRate.toFixed(0)}%</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">{t('rt.mae.giveback_hint')}</p>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('rt.mae.rmae')}</span>
              <span className="text-base font-mono font-bold" style={{ color: data.avgRMae >= 1 ? '#10b981' : data.avgRMae >= 0 ? '#f59e0b' : '#ef4444' }}>
                {data.avgRMae >= 0 ? '+' : ''}{data.avgRMae.toFixed(2)}R
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">{t('rt.mae.rmae_hint')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Margin-Exposure-Card (Konzept B) ────────────────────── */
function MarginExposureCard({ trades, leverage, accountBalance }) {
  const { t } = useLanguage()
  const data = useMemo(
    () => buildMarginExposure(trades, { leverage: leverage || 100, accountBalance: accountBalance || 10000 }),
    [trades, leverage, accountBalance]
  )

  if (!data || data.sampleSize < 3) return null

  const avg = data.avgMarginPct.toFixed(0)
  const max = data.maxConcurrentMarginPct.toFixed(0)
  const verdict = data.avgMarginPct > 50
    ? { color: '#ef4444', label: t('rt.margin.verdict.bad.title'),  msg: t('rt.margin.verdict.bad.body',  { avg }) }
    : data.avgMarginPct > 20
      ? { color: '#f59e0b', label: t('rt.margin.verdict.warn.title'), msg: t('rt.margin.verdict.warn.body', { avg, max }) }
      : { color: '#10b981', label: t('rt.margin.verdict.good.title'), msg: t('rt.margin.verdict.good.body', { avg }) }

  const liqColor = data.liquidationMovePct > 10 ? '#10b981' : data.liquidationMovePct > 3 ? '#f59e0b' : '#ef4444'
  const cvColor  = data.volumeCV < 0.6 ? '#10b981' : data.volumeCV < 1.2 ? '#f59e0b' : '#ef4444'

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Anchor size={14} className="text-[#8b5cf6]" />
          <h3 className="text-sm font-semibold text-slate-200">{t('rt.margin.title')}</h3>
          <span title={t('rt.margin.info')}>
            <Info size={11} className="text-slate-500 cursor-help" />
          </span>
        </div>
        <span className="text-xs text-slate-500">{t('rt.margin.leverage', { lev: data.leverage })}</span>
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

        {/* Kernzahlen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1 font-medium">{t('rt.margin.avg')}</p>
            <p className="text-lg font-mono font-bold text-slate-200"><Pvt value={data.avgMargin} sign={false} /></p>
            <p className="text-[10px] text-slate-600 font-mono">{t('rt.mae.pct_account', { pct: data.avgMarginPct.toFixed(1) })}</p>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1 font-medium">{t('rt.margin.p95')}</p>
            <p className="text-lg font-mono font-bold text-slate-200"><Pvt value={data.p95Margin} sign={false} /></p>
            <p className="text-[10px] text-slate-600 font-mono">{t('rt.margin.p95_hint')}</p>
          </div>
          <div className="rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-3">
            <p className="text-[10px] text-[#f59e0b] uppercase tracking-wide mb-1 font-medium">{t('rt.margin.max_parallel')}</p>
            <p className="text-lg font-mono font-bold text-[#f59e0b]"><Pvt value={data.maxConcurrentMargin} sign={false} /></p>
            <p className="text-[10px] text-[#f59e0b]/80 font-mono">{t('rt.margin.max_parallel_hint', { pct: data.maxConcurrentMarginPct.toFixed(1) })}</p>
          </div>
          <div className="rounded-xl border p-3" style={{ borderColor: liqColor + '40', backgroundColor: liqColor + '0a' }}>
            <p className="text-[10px] uppercase tracking-wide mb-1 font-medium" style={{ color: liqColor }}>{t('rt.margin.liq_move')}</p>
            <p className="text-lg font-mono font-bold" style={{ color: liqColor }}>~{data.liquidationMovePct.toFixed(1)}%</p>
            <p className="text-[10px] font-mono" style={{ color: liqColor + 'b0' }}>{t('rt.margin.liq_move_hint')}</p>
          </div>
        </div>

        {/* Sekundäre Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('rt.margin.vol_cv')}</span>
              <span className="text-sm font-mono font-bold" style={{ color: cvColor }}>CV {data.volumeCV.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              {data.volumeCV < 0.6 ? t('rt.margin.vol_cv_low') : data.volumeCV < 1.2 ? t('rt.margin.vol_cv_med') : t('rt.margin.vol_cv_high')}
            </p>
          </div>
          <div className="rounded-xl border border-[#1f2937] bg-[#0d1117] p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">{t('rt.margin.margin_hours')}</span>
              <span className="text-sm font-mono font-bold text-slate-300">
                <Pvt value={data.totalMarginHours / 1000} sign={false} decimals={1} />K
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">{t('rt.margin.margin_hours_hint')}</p>
          </div>
        </div>

        <p className="text-[11px] text-slate-500">{t('rt.margin.footer')}</p>
      </div>
    </div>
  )
}

/* ─── R-Multiple Verteilung ──────────────────────────────── */
function buildRDist(trades, riskAmount) {
  const buckets = [
    { label: '< -2R',   min: -Infinity, max: -2,       count: 0, color: '#ef4444' },
    { label: '-2…-1R',  min: -2,        max: -1,       count: 0, color: '#f87171' },
    { label: '-1…0R',   min: -1,        max: 0,        count: 0, color: '#fca5a5' },
    { label: '0…1R',    min: 0,         max: 1,        count: 0, color: '#fbbf24' },
    { label: '1…2R',    min: 1,         max: 2,        count: 0, color: '#86efac' },
    { label: '> 2R',    min: 2,         max: Infinity, count: 0, color: '#10b981' },
  ]
  if (riskAmount <= 0) return buckets
  trades.forEach(t => {
    const r = t.profit / riskAmount
    const b = buckets.find(b => r >= b.min && r < b.max)
      || (r === Infinity ? buckets[buckets.length - 1] : buckets[0])
    b.count++
  })
  return buckets
}

/* ─── Summary Card ───────────────────────────────────────── */
function SCard({ icon: Icon, label, value, sub, color = 'text-white', iconColor = 'text-slate-500' }) {
  return (
    <div className="card p-5">
      <div className="p-2 rounded-lg bg-[#1a2233] w-fit mb-3">
        <Icon size={16} className={iconColor} />
      </div>
      <div className={`text-2xl font-bold font-mono ${color} mb-0.5`}>{value}</div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
    </div>
  )
}

/* ─── Risk Tab ───────────────────────────────────────────── */
export default function RiskTab() {
  const { effectiveTrades }               = useTrades()
  const { privacyMode, accountBalance }   = usePrivacyMode()
  const { mfeMae, status }                = useLiveSync()
  const { t }                             = useLanguage()
  const mfeArchive = mfeMae?.archive || {}
  const liveLeverage = status?.account?.leverage || 100

  const [riskPercent, setRiskPct] = useState(() => {
    const v = parseFloat(localStorage.getItem(RISK_KEY))
    return isNaN(v) || v <= 0 ? 1 : v
  })
  const [editingRisk, setEditingRisk] = useState(false)
  const [draftRisk,   setDraftRisk]   = useState(String(riskPercent))

  function saveRisk(e) {
    e.preventDefault()
    const v = parseFloat(draftRisk)
    if (!isNaN(v) && v > 0) {
      setRiskPct(v)
      localStorage.setItem(RISK_KEY, String(v))
    }
    setEditingRisk(false)
  }

  const riskAmount = accountBalance * riskPercent / 100

  /* Per-Trade Daten */
  const tradeRows = useMemo(() => {
    return [...effectiveTrades]
      .filter(t => t.closeTime)
      .sort((a, b) => new Date(b.closeTime) - new Date(a.closeTime))
      .map(t => ({
        ...t,
        riskDollar:  riskAmount,
        riskPct:     riskPercent,
        rMultiple:   riskAmount > 0 ? t.profit / riskAmount : 0,
        netPnl:      t.profit + (t.commission || 0) + (t.swap || 0),
      }))
  }, [effectiveTrades, riskAmount, riskPercent])

  /* Summary Stats */
  const avgRisk    = riskAmount
  const maxRisk    = riskAmount  // fixed risk model — same for all trades
  const avgRMult   = tradeRows.length
    ? tradeRows.reduce((s, t) => s + t.rMultiple, 0) / tradeRows.length
    : 0

  /* Verteilungs-Daten */
  const distData = useMemo(() => buildRDist(tradeRows, riskAmount), [tradeRows, riskAmount])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Risiko-Analyse</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Basierend auf {riskPercent}% Risiko pro Trade
            {!privacyMode && ` = `}
            {!privacyMode && <span className="text-slate-400 font-mono">${riskAmount.toFixed(0)}</span>}
          </p>
        </div>

        {/* Risiko konfigurieren */}
        <div className="relative">
          {editingRisk ? (
            <form onSubmit={saveRisk} className="flex items-center gap-2">
              <div className="relative">
                <input
                  autoFocus
                  type="number"
                  value={draftRisk}
                  onChange={e => setDraftRisk(e.target.value)}
                  onBlur={saveRisk}
                  className="input w-24 text-xs font-mono pr-5"
                  step="0.1" min="0.01" max="100"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
              </div>
              <button type="submit" className="btn-primary text-xs px-3 py-1.5">OK</button>
            </form>
          ) : (
            <button
              onClick={() => { setDraftRisk(String(riskPercent)); setEditingRisk(true) }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2d3748] bg-[#131c2e]
                text-xs text-slate-400 hover:text-slate-200 hover:border-[#374151] transition-colors"
            >
              <Settings2 size={13} />
              Risiko: {riskPercent}% / Trade
            </button>
          )}
        </div>
      </div>

      {/* ── Konzept A: MAE-basiertes realisiertes Risiko ── */}
      <MaeRiskCard trades={tradeRows} mfeArchive={mfeArchive} accountBalance={accountBalance} />

      {/* ── Konzept B: Margin- & Exposure-Risiko ── */}
      <MarginExposureCard trades={tradeRows} leverage={liveLeverage} accountBalance={accountBalance} />

      {/* ── Klassisches Risiko-Modell (theoretisch) ── */}
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 h-px bg-[#1f2937]" />
        <span className="text-[10px] uppercase tracking-wider text-slate-600 font-medium">{t('rt.classic_divider')}</span>
        <div className="flex-1 h-px bg-[#1f2937]" />
      </div>

      {/* ── 3 Summary Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SCard
          icon={ShieldAlert}
          label="Ø Risiko pro Trade"
          value={<Pvt value={avgRisk} sign={false} />}
          sub={`${riskPercent}% des Kontos`}
          color="text-[#f59e0b]"
          iconColor="text-[#f59e0b]"
        />
        <SCard
          icon={TrendingDown}
          label="Max. Risiko pro Trade"
          value={<Pvt value={maxRisk} sign={false} />}
          sub={`Fixiertes Risiko-Modell`}
          color="text-[#ef4444]"
          iconColor="text-[#ef4444]"
        />
        <SCard
          icon={BarChart2}
          label="Ø R-Multiple"
          value={avgRMult.toFixed(2) + 'R'}
          sub={avgRMult >= 1 ? 'Profitabler Erwartungswert' : 'Erwartungswert negativ'}
          color={avgRMult >= 1 ? 'text-[#10b981]' : avgRMult >= 0 ? 'text-[#f59e0b]' : 'text-[#ef4444]'}
          iconColor="text-[#8b5cf6]"
        />
      </div>

      {/* ── R-Multiple Verteilung ── */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-slate-200">R-Multiple Verteilung</h3>
          <span className="text-xs text-slate-500">{tradeRows.length} Trades</span>
        </div>
        <div className="p-4">
          {tradeRows.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={distData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className="bg-[#1a2233] border border-[#374151] rounded-lg px-3 py-2 shadow-xl text-xs">
                        <p className="text-slate-400 mb-1">{label}</p>
                        <p className="text-white font-mono font-semibold">{payload[0].value} Trades</p>
                      </div>
                    )
                  }}
                />
                <ReferenceLine x="0…1R" stroke="#374151" />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {distData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-slate-600 text-sm">
              Keine Trades vorhanden
            </div>
          )}
        </div>
      </div>

      {/* ── Tilt-Detektor ── */}
      <TiltDetectorSection trades={tradeRows} riskAmount={riskAmount} />

      {/* ── Trades Tabelle ── */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-slate-200">Alle Trades</h3>
          <span className="text-xs text-slate-500">Risiko-Details</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1f2937]">
                {['Datum', 'Symbol', 'Seite', 'Risiko $', 'Risiko %', 'R-Multiple', 'P&L'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs text-slate-500 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tradeRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-600">
                    Keine Trades vorhanden
                  </td>
                </tr>
              ) : (
                tradeRows.map(t => {
                  const rColor_ = rColor(t.rMultiple)
                  return (
                    <tr key={t.id} className="border-b border-[#1f2937]/50 hover:bg-[#1a2233] transition-colors">
                      <td className="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {t.closeTime ? format(new Date(t.closeTime), 'dd.MM.yy HH:mm') : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono font-semibold text-slate-200">{t.symbol}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          t.type === 'BUY'
                            ? 'bg-[#10b981]/10 text-[#10b981]'
                            : 'bg-[#ef4444]/10 text-[#ef4444]'
                        }`}>{t.type}</span>
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-400 text-xs">
                        <Pvt value={riskAmount} sign={false} />
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-400 text-xs">
                        {riskPercent.toFixed(2)}%
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold"
                          style={{ backgroundColor: rColor_ + '20', color: rColor_ }}
                        >
                          {t.rMultiple >= 0 ? '+' : ''}{t.rMultiple.toFixed(2)}R
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`font-mono font-semibold text-xs ${
                          t.netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
                        }`}>
                          <Pvt value={t.netPnl} />
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
