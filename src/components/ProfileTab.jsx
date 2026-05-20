import { useState, useMemo, useRef } from 'react'
import { Copy, Check, FileDown, Share2, Database, Upload, AlertTriangle, MessageSquare, Brain, ChevronLeft, ChevronRight, CalendarDays, Image as ImageIcon, Clipboard } from 'lucide-react'
import { toBlob, toPng } from 'html-to-image'
import TSLogo from '../assets/TSLogo'
import { format } from 'date-fns'
import { useTrades } from '../hooks/useTrades'
import { useSetups } from '../hooks/useSetups'
import { useLiveSync } from '../hooks/useLiveSync'
import { usePrivacyMode } from '../hooks/usePrivacyMode'
import { useToast } from '../hooks/useToast'
import { useLanguage } from '../hooks/useLanguage'
import { buildMentorBrief } from '../utils/mentorBrief'

const RISK_KEY_ACTIVE = 'tradestats_risk_percent'

const BACKUP_KEYS = [
  'tradestats_trades',
  'tradestats_tags',
  'tradestats_manual_groups',
  'tradestats_position_notes',
  'tradestats_account_balance',
  'tradestats_privacy_mode',
]
const BACKUP_VERSION = 1

function buildBackup() {
  const data = {}
  for (const k of BACKUP_KEYS) {
    const v = localStorage.getItem(k)
    if (v != null) data[k] = v
  }
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'TradeStats',
    data,
  }
}

function applyBackup(backup) {
  if (!backup || backup.app !== 'TradeStats' || !backup.data) {
    throw new Error('Ungültiges Backup-Format')
  }
  for (const [k, v] of Object.entries(backup.data)) {
    if (!BACKUP_KEYS.includes(k)) continue   // skip unknown keys for safety
    localStorage.setItem(k, v)
  }
}

/* ─── Stat-Badge ─────────────────────────────────────────── */
function Badge({ label, value, color = '#e2e8f0', accent }) {
  return (
    <div
      className="flex flex-col items-center justify-center p-4 rounded-xl border"
      style={{ borderColor: accent + '30', backgroundColor: accent + '08' }}
    >
      <span className="text-2xl font-bold font-mono" style={{ color }}>{value}</span>
      <span className="text-[11px] text-slate-500 mt-1 font-medium tracking-wide uppercase">{label}</span>
    </div>
  )
}

/* ─── Period Helpers ──────────────────────────────────────── */
const PERIODS = [
  { id: 'day',    labelKey: 'common.day',      scopeKey: 'profile.review_day' },
  { id: 'week',   labelKey: 'common.week',     scopeKey: 'profile.review_week' },
  { id: 'month',  labelKey: 'common.month',    scopeKey: 'profile.review_month' },
  { id: 'year',   labelKey: 'common.year',     scopeKey: 'profile.review_year' },
  { id: 'all',    labelKey: 'common.all_time', scopeKey: 'profile.review_all' },
]
const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTHS_DE   = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

function getPeriodRange(periodId, offset = 0, refDate = new Date(), tr = null) {
  // tr = optional translation function for prefix words
  const tx = tr || ((k) => k.replace('common.', ''))
  // Shift refDate based on period + offset (offset = 0 means current, -1 = previous, +1 = next)
  const shifted = new Date(refDate)
  if (periodId === 'day')   shifted.setDate(shifted.getDate()   + offset)
  if (periodId === 'week')  shifted.setDate(shifted.getDate()   + offset * 7)
  if (periodId === 'month') shifted.setMonth(shifted.getMonth() + offset)
  if (periodId === 'year')  shifted.setFullYear(shifted.getFullYear() + offset)
  const d = new Date(shifted)
  d.setHours(0, 0, 0, 0)

  if (periodId === 'day') {
    const from = new Date(d)
    const to   = new Date(d); to.setHours(23, 59, 59, 999)
    let label = format(d, 'dd.MM.yyyy')
    if (offset === 0)  label = `${tx('common.today')} · ${label}`
    if (offset === -1) label = `${tx('common.yesterday')} · ${label}`
    return { from, to, label, shortLabel: format(d, 'dd.MM.') }
  }
  if (periodId === 'week') {
    const dow = d.getDay()
    const offsetToMonday = (dow + 6) % 7
    const from = new Date(d); from.setDate(d.getDate() - offsetToMonday)
    const to   = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999)
    const tmp = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()))
    const dayNum = (tmp.getUTCDay() + 6) % 7
    tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3)
    const firstThursday = tmp.getTime()
    tmp.setUTCMonth(0, 1)
    if (tmp.getUTCDay() !== 4) tmp.setUTCMonth(0, 1 + ((4 - tmp.getUTCDay()) + 7) % 7)
    const weekNum = 1 + Math.round((firstThursday - tmp.getTime()) / (7 * 86400000))
    let label = `KW ${weekNum} · ${format(from, 'dd.MM.')} – ${format(to, 'dd.MM.yyyy')}`
    if (offset === 0)  label = `${tx('common.this_week')} · ${label}`
    if (offset === -1) label = `${tx('common.last_week')} · ${label}`
    return { from, to, label, shortLabel: `KW${weekNum}` }
  }
  if (periodId === 'month') {
    const from = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
    const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
    let label = `${MONTHS_DE[from.getMonth()]} ${from.getFullYear()}`
    if (offset === 0)  label = `${tx('common.this_month')} · ${label}`
    if (offset === -1) label = `${tx('common.last_month')} · ${label}`
    return { from, to, label, shortLabel: format(from, 'MM.yyyy') }
  }
  if (periodId === 'year') {
    const from = new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0)
    const to   = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999)
    let label = `${tx('common.year')} ${from.getFullYear()}`
    if (offset === 0)  label = `${tx('common.this_year')} · ${label}`
    if (offset === -1) label = `${tx('common.last_year')} · ${label}`
    return { from, to, label, shortLabel: String(from.getFullYear()) }
  }
  return { from: null, to: null, label: tx('common.all_times'), shortLabel: 'alle' }
}

const netPnlOf = (t) => (t.profit || 0) + (t.commission || 0) + (t.swap || 0)

function buildPeriodStats(trades, range, accountBalance) {
  const closed = trades.filter(t => t.closeTime)
  const inRange = range.from
    ? closed.filter(t => {
        const d = new Date(t.closeTime)
        return d >= range.from && d <= range.to
      })
    : closed

  if (!inRange.length) {
    return {
      count: 0, winRate: 0, roi: 0, profitFactor: 0,
      bestTrade: null, worstTrade: null,
      tradingDays: 0, totalPnl: 0,
      bestTradePct: 0, worstTradePct: 0,
    }
  }

  const wins   = inRange.filter(t => netPnlOf(t) > 0)
  const losses = inRange.filter(t => netPnlOf(t) < 0)
  const totalWin  = wins.reduce((s, t) => s + netPnlOf(t), 0)
  const totalLoss = Math.abs(losses.reduce((s, t) => s + netPnlOf(t), 0))
  const totalPnl  = totalWin - totalLoss
  const uniqueDays = new Set(inRange.map(t => t.closeTime.slice(0, 10))).size
  const roi = accountBalance > 0 ? (totalPnl / accountBalance) * 100 : 0

  // Top 3 winning trades
  const topTrades = [...inRange]
    .filter(t => netPnlOf(t) > 0)
    .sort((a, b) => netPnlOf(b) - netPnlOf(a))
    .slice(0, 3)
    .map(t => ({
      symbol: t.symbol,
      type:   t.type,
      pnlPct: accountBalance > 0 ? (netPnlOf(t) / accountBalance) * 100 : 0,
    }))

  return {
    count:        inRange.length,
    winRate:      (wins.length / inRange.length) * 100,
    roi,
    profitFactor: totalLoss > 0 ? Math.min(totalWin / totalLoss, 99.9) : (totalWin > 0 ? 99.9 : 0),
    topTrades,
    tradingDays:  uniqueDays,
    totalPnl,
  }
}

/* ─── Share Card (auch für Print) ───────────────────────── */
export function ShareCard({ data, id = 'share-card' }) {
  const { t } = useLanguage()
  const {
    periodScope = 'Performance', periodLabel = '',
    winRate = 0, roi = 0, profitFactor = 0,
    trades = 0, tradingDays = 0,
    topTrades = [],
    generatedAt,
  } = data

  const pfDisplay = profitFactor >= 99.9 ? '∞' : profitFactor.toFixed(2)
  const isEmpty = trades === 0

  return (
    <div
      id={id}
      className="bg-gradient-to-br from-[#0d1117] to-[#111827] border border-[#1f2937]
        rounded-2xl p-8 max-w-lg w-full shadow-2xl"
    >
      {/* Logo + Header */}
      <div className="flex items-center gap-3 mb-2">
        <TSLogo size={40} />
        <div className="flex-1">
          <div className="text-white font-bold text-lg tracking-tight">TradeStats</div>
          <div className="text-[11px] text-slate-500">
            {periodScope}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-600 uppercase tracking-wider">{t('common.timeframe')}</div>
          <div className="text-xs font-mono text-slate-300 mt-0.5">{periodLabel}</div>
        </div>
      </div>

      {generatedAt && (
        <div className="text-[10px] text-slate-600 mb-5">
          {t('common.generated_at')} {format(new Date(generatedAt), 'dd.MM.yyyy HH:mm')}
        </div>
      )}

      {isEmpty ? (
        <div className="py-8 text-center text-slate-500 text-sm border-2 border-dashed border-[#1f2937] rounded-xl">
          {t('profile.no_trades_in_period')}
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <Badge
              label={t('common.win_rate')}
              value={`${winRate.toFixed(1)}%`}
              color={winRate >= 50 ? '#10b981' : '#ef4444'}
              accent={winRate >= 50 ? '#10b981' : '#ef4444'}
            />
            <Badge
              label="ROI"
              value={`${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`}
              color={roi >= 0 ? '#10b981' : '#ef4444'}
              accent={roi >= 0 ? '#10b981' : '#ef4444'}
            />
            <Badge
              label={t('common.profit_factor')}
              value={pfDisplay}
              color={profitFactor >= 1 ? '#10b981' : '#ef4444'}
              accent={profitFactor >= 1 ? '#10b981' : '#ef4444'}
            />
            <Badge
              label={t('common.trades')}
              value={trades}
              color="#e2e8f0"
              accent="#3b82f6"
            />
            <Badge
              label={t('common.trading_days')}
              value={tradingDays}
              color="#e2e8f0"
              accent="#06b6d4"
            />
            <Badge
              label={t('profile.avg_trades_day')}
              value={tradingDays > 0 ? (trades / tradingDays).toFixed(1) : '—'}
              color="#e2e8f0"
              accent="#8b5cf6"
            />
          </div>

          {/* Top 3 Trades */}
          {topTrades.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] text-[#10b981] uppercase tracking-wider font-bold mb-2">
                🏆 {t(topTrades.length === 1 ? 'profile.top_n_trades' : 'profile.top_n_trades_plural', { count: topTrades.length })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {topTrades.map((tt, i) => (
                  <div key={i} className="rounded-xl border border-[#10b981]/30 bg-[#10b981]/08 p-3 text-center">
                    <div className="text-[10px] text-[#10b981]/80 font-bold mb-0.5">#{i + 1}</div>
                    <div className="font-mono font-bold text-slate-200 text-sm truncate">{tt.symbol}</div>
                    <div className="font-mono text-sm font-bold text-[#10b981] mt-0.5">
                      +{tt.pnlPct.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-[#1f2937] flex items-center justify-between">
        <span className="text-[10px] text-slate-600 font-mono">tradestats.app</span>
        <span className="text-[10px] text-slate-600">{t('profile.no_dollar')}</span>
      </div>
    </div>
  )
}

/* ─── Readonly Share View (wird per URL geöffnet) ────────── */
export function ReadonlyShareView({ data }) {
  const { t } = useLanguage()
  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col items-center justify-center p-6 gap-6">
      <ShareCard data={data} />
      <p className="text-xs text-slate-600">
        Shared with TradeStats
      </p>
      <button
        onClick={() => window.location.href = window.location.origin + window.location.pathname}
        className="px-4 py-2 rounded-lg bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30
          text-sm font-medium hover:bg-[#10b981]/25 transition-colors"
      >
        Open TradeStats
      </button>
    </div>
  )
}

/* ─── Print Helper ───────────────────────────────────────── */
function printShareCard() {
  const styleId = '__tradestats_print__'
  let el = document.getElementById(styleId)
  if (!el) {
    el = document.createElement('style')
    el.id = styleId
    document.head.appendChild(el)
  }
  el.textContent = `
    @media print {
      @page { margin: 15mm; size: A4 portrait; }
      body * { visibility: hidden !important; }
      #share-card, #share-card * { visibility: visible !important; }
      #share-card {
        position: fixed !important;
        top: 50% !important; left: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: 460px !important;
        box-shadow: none !important;
        border: 1px solid #1f2937 !important;
      }
    }
  `
  window.print()
  // Styles nach dem Print entfernen
  setTimeout(() => { el.textContent = '' }, 1000)
}

/* ─── Profil Tab ─────────────────────────────────────────── */
export default function ProfileTab() {
  const { effectiveTrades, trades }     = useTrades()
  const { setups }                      = useSetups()
  const { mfeMae }                      = useLiveSync()
  const { accountBalance }              = usePrivacyMode()
  const { showToast }                   = useToast()
  const { t }                           = useLanguage()

  // ── Mentor Brief state ──
  const today           = format(new Date(), 'yyyy-MM-dd')
  const sevenDaysAgo    = format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd')
  const [mbFrom,    setMbFrom]    = useState(sevenDaysAgo)
  const [mbTo,      setMbTo]      = useState(today)
  const [mbPrivacy, setMbPrivacy] = useState('relative')
  const [mbNotes,   setMbNotes]   = useState(true)
  const [mbFocus,   setMbFocus]   = useState('')
  const [mbPreview, setMbPreview] = useState(null)
  const [mbCopied,  setMbCopied]  = useState(false)

  const mbRiskPct = parseFloat(localStorage.getItem(RISK_KEY_ACTIVE) || '1')

  function generateMentorBrief() {
    const result = buildMentorBrief({
      trades: effectiveTrades,
      mfeArchive: mfeMae?.archive || {},
      setups,
      accountBalance,
      riskPercent: mbRiskPct,
      fromDate: mbFrom || null,
      toDate:   mbTo   || null,
      privacy:  mbPrivacy,
      includeNotes: mbNotes,
      focusAreas: mbFocus,
    })
    setMbPreview(result)
  }

  async function copyMentorBrief() {
    if (!mbPreview) return
    try {
      await navigator.clipboard.writeText(mbPreview.markdown)
      setMbCopied(true)
      setTimeout(() => setMbCopied(false), 2000)
      showToast({ type: 'info', title: 'In Zwischenablage kopiert', description: 'Bereit zum Einfügen in Chat/Discord' })
    } catch {
      showToast({ type: 'error', title: 'Kopieren fehlgeschlagen' })
    }
  }

  function downloadMentorBrief(asJson = false) {
    if (!mbPreview) return
    const content = asJson ? JSON.stringify(mbPreview.json, null, 2) : mbPreview.markdown
    const ext     = asJson ? 'json' : 'md'
    const mime    = asJson ? 'application/json' : 'text/markdown'
    const blob = new Blob([content], { type: mime })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `mentor-brief-${format(new Date(), 'yyyy-MM-dd-HHmm')}.${ext}`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  const [copied, setCopied]             = useState(false)
  const [imgCopied, setImgCopied]       = useState(false)
  const [exportingImg, setExportingImg] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(null)   // { backup, fileName } | null
  const fileInputRef                    = useRef(null)

  // ── Bild-Export der Share-Card ──
  const exportOptions = {
    pixelRatio:        2,                   // crisp on retina/HiDPI
    backgroundColor:   '#080c14',
    cacheBust:         true,
    skipFonts:         false,
    style:             { fontFamily: 'inherit' },
  }

  async function copyShareCardAsImage() {
    if (exportingImg) return
    const node = document.getElementById('share-card')
    if (!node) return
    setExportingImg(true)
    try {
      const blob = await toBlob(node, exportOptions)
      if (!blob) throw new Error('Konnte kein Bild erzeugen')
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
        setImgCopied(true)
        setTimeout(() => setImgCopied(false), 2200)
        showToast({
          type: 'info',
          title: 'Bild kopiert!',
          description: 'Mit Ctrl+V in Discord, Telegram, Twitter etc. einfügen.',
        })
      } else {
        throw new Error('Browser unterstützt keine Clipboard-Bild-API')
      }
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Kopieren fehlgeschlagen',
        description: err.message || 'Versuch stattdessen Download.',
      })
    } finally {
      setExportingImg(false)
    }
  }

  async function downloadShareCardAsImage() {
    if (exportingImg) return
    const node = document.getElementById('share-card')
    if (!node) return
    setExportingImg(true)
    try {
      const dataUrl = await toPng(node, exportOptions)
      const a = document.createElement('a')
      a.href = dataUrl
      const periodTag = sharePeriod === 'all' ? 'gesamt' : (range.shortLabel || sharePeriod)
        .replace(/[\s.·–]+/g, '-')
        .replace(/[^\w\-]/g, '')
      a.download = `tradestats-${periodTag}-${format(new Date(), 'yyyy-MM-dd-HHmm')}.png`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      showToast({ type: 'info', title: 'PNG heruntergeladen' })
    } catch (err) {
      showToast({ type: 'error', title: 'Export fehlgeschlagen', description: err.message })
    } finally {
      setExportingImg(false)
    }
  }

  function handleExport() {
    const backup = buildBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `tradestats-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast({ type: 'info', title: t('backup.export'), description: `${trades.length} ${t('common.trades')}` })
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result)
        if (backup.app !== 'TradeStats' || !backup.data) throw new Error()
        setConfirmRestore({ backup, fileName: file.name })
      } catch {
        showToast({ type: 'error', title: 'Import fehlgeschlagen', description: 'Datei ist kein gültiges TradeStats-Backup' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''   // allow same file again
  }

  function doRestore() {
    if (!confirmRestore) return
    try {
      applyBackup(confirmRestore.backup)
      showToast({ type: 'info', title: 'Backup wiederhergestellt', description: 'Seite wird neu geladen...' })
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      showToast({ type: 'error', title: 'Wiederherstellung fehlgeschlagen', description: err.message })
    }
    setConfirmRestore(null)
  }

  // ── Period selector for share card ──
  const [sharePeriod, setSharePeriod] = useState('week')
  const [periodOffset, setPeriodOffset] = useState(0)

  function changePeriod(id) {
    setSharePeriod(id)
    setPeriodOffset(0)   // reset when switching period type
  }

  const range = useMemo(() => getPeriodRange(sharePeriod, periodOffset, new Date(), t), [sharePeriod, periodOffset, t])
  const canNavigate = sharePeriod !== 'all'
  const canGoNext   = canNavigate && periodOffset < 0
  const periodScope = t(PERIODS.find(p => p.id === sharePeriod)?.scopeKey || 'profile.review_all')
  const periodStats = useMemo(
    () => buildPeriodStats(effectiveTrades, range, accountBalance),
    [effectiveTrades, range, accountBalance]
  )

  const shareData = {
    periodScope,
    periodLabel: range.label,
    winRate:      periodStats.winRate,
    roi:          periodStats.roi,
    profitFactor: periodStats.profitFactor,
    trades:       periodStats.count,
    tradingDays:  periodStats.tradingDays,
    topTrades:    periodStats.topTrades,
    generatedAt:  new Date().toISOString(),
  }

  /* URL generieren */
  function buildShareUrl() {
    try {
      const encoded = btoa(JSON.stringify(shareData))
      return `${window.location.origin}${window.location.pathname}?share=${encoded}`
    } catch {
      return window.location.href
    }
  }

  /* In Zwischenablage kopieren */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildShareUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = buildShareUrl()
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">{t('profile.title')}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {t('profile.subtitle')}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── Share Card Preview ── */}
        <div className="flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600 uppercase tracking-wider font-medium">{t('common.preview')}</p>
          </div>

          {/* Period Selector */}
          <div className="flex gap-0.5 bg-[#0d1117] border border-[#1f2937] rounded-lg p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => changePeriod(p.id)}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors
                  ${sharePeriod === p.id
                    ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                    : 'text-slate-500 hover:text-slate-300'}`}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>

          {/* Period Navigator (prev/next/today) */}
          {canNavigate && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPeriodOffset(o => o - 1)}
                title={t(sharePeriod === 'day' ? 'profile.prev_day' : sharePeriod === 'week' ? 'profile.prev_week' : sharePeriod === 'month' ? 'profile.prev_month' : 'profile.prev_year')}
                className="p-1.5 rounded-md border border-[#1f2937] bg-[#0d1117] text-slate-400
                  hover:text-slate-200 hover:border-[#374151] transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <div className="flex-1 text-center px-2 py-1 rounded-md bg-[#0d1117] border border-[#1f2937]
                text-[11px] font-mono text-slate-300 truncate">
                {range.label}
              </div>
              <button
                onClick={() => setPeriodOffset(o => o + 1)}
                disabled={!canGoNext}
                title={periodOffset >= 0 ? t('profile.future') : t('profile.next_period')}
                className="p-1.5 rounded-md border border-[#1f2937] bg-[#0d1117] text-slate-400
                  hover:text-slate-200 hover:border-[#374151] transition-colors
                  disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:border-[#1f2937]"
              >
                <ChevronRight size={14} />
              </button>
              {periodOffset !== 0 && (
                <button
                  onClick={() => setPeriodOffset(0)}
                  title={t('profile.go_to_today')}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-[#10b981]/30
                    bg-[#10b981]/10 text-[#10b981] text-[11px] font-medium hover:bg-[#10b981]/15
                    transition-colors"
                >
                  <CalendarDays size={12} /> {t('common.today')}
                </button>
              )}
            </div>
          )}

          <ShareCard data={shareData} />
        </div>

        {/* ── Actions + Info ── */}
        <div className="flex-1 space-y-4 min-w-0">

          {/* Action Buttons */}
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">{t('profile.share_export')}</h3>

            {/* Copy as Image */}
            <button
              onClick={copyShareCardAsImage}
              disabled={exportingImg}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border
                transition-all duration-200 text-sm font-medium disabled:opacity-60 disabled:cursor-wait
                ${imgCopied
                  ? 'bg-[#10b981]/15 border-[#10b981]/30 text-[#10b981]'
                  : 'bg-[#8b5cf6]/10 border-[#8b5cf6]/30 text-[#c4b5fd] hover:bg-[#8b5cf6]/20 hover:text-white'
                }`}
            >
              {imgCopied ? <Check size={16} /> : <Clipboard size={16} />}
              <div className="text-left flex-1">
                <div className="font-semibold">
                  {imgCopied ? t('profile.image_copied') : exportingImg ? t('profile.creating_image') : t('profile.copy_image')}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {imgCopied ? t('profile.paste_hint') : t('profile.copy_image_hint')}
                </div>
              </div>
            </button>

            {/* Download PNG */}
            <button
              onClick={downloadShareCardAsImage}
              disabled={exportingImg}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border
                bg-[#131c2e] border-[#2d3748] text-slate-300
                hover:border-[#374151] hover:text-white transition-all duration-200 text-sm font-medium
                disabled:opacity-60 disabled:cursor-wait"
            >
              <ImageIcon size={16} />
              <div className="text-left flex-1">
                <div className="font-semibold">{t('profile.download_png')}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {t('profile.download_png_hint')}
                </div>
              </div>
            </button>

            {/* Copy Link */}
            <button
              onClick={copyLink}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border
                transition-all duration-200 text-sm font-medium
                ${copied
                  ? 'bg-[#10b981]/15 border-[#10b981]/30 text-[#10b981]'
                  : 'bg-[#131c2e] border-[#2d3748] text-slate-300 hover:border-[#374151] hover:text-white'
                }`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <div className="text-left">
                <div className="font-semibold">{copied ? t('profile.link_copied') : t('profile.copy_link')}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {t('profile.copy_link_hint')}
                </div>
              </div>
            </button>

            {/* PDF Export */}
            <button
              onClick={printShareCard}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border
                bg-[#131c2e] border-[#2d3748] text-slate-300
                hover:border-[#374151] hover:text-white transition-all duration-200 text-sm font-medium"
            >
              <FileDown size={16} />
              <div className="text-left">
                <div className="font-semibold">{t('profile.export_pdf')}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {t('profile.export_pdf_hint')}
                </div>
              </div>
            </button>

            <div className="flex items-center gap-2 pt-1">
              <Share2 size={12} className="text-slate-600" />
              <span className="text-[11px] text-slate-600">
                {t('profile.share_safe_hint')}
              </span>
            </div>
          </div>

          {/* Mentor-Brief Generator */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-[#8b5cf6]" />
              <div>
                <h3 className="text-sm font-semibold text-slate-200">{t('mb.title')}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t('mb.subtitle')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">{t('common.from')}</label>
                <input type="date" value={mbFrom} onChange={e => setMbFrom(e.target.value)} className="input w-full text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">{t('common.to')}</label>
                <input type="date" value={mbTo} onChange={e => setMbTo(e.target.value)} className="input w-full text-xs" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 block mb-1.5">{t('mb.privacy_mode')}</label>
              <div className="flex gap-0.5 bg-[#0d1117] border border-[#1f2937] rounded-lg p-0.5">
                {[
                  { id: 'full',      label: t('mb.privacy_full'),      desc: t('mb.privacy_full_desc') },
                  { id: 'relative',  label: t('mb.privacy_relative'),  desc: t('mb.privacy_relative_desc') },
                  { id: 'anonymous', label: t('mb.privacy_anonymous'), desc: t('mb.privacy_anonymous_desc') },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setMbPrivacy(p.id)}
                    title={p.desc}
                    className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors
                      ${mbPrivacy === p.id
                        ? 'bg-[#8b5cf6]/15 text-[#8b5cf6] border border-[#8b5cf6]/30'
                        : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={mbNotes} onChange={e => setMbNotes(e.target.checked)} className="accent-[#8b5cf6]" />
              {t('mb.share_notes')}
            </label>

            <div>
              <label className="text-[10px] text-slate-500 block mb-1 flex items-center gap-1">
                <MessageSquare size={11} /> {t('mb.focus_label')}
              </label>
              <textarea
                value={mbFocus}
                onChange={e => setMbFocus(e.target.value)}
                placeholder={t('mb.focus_placeholder')}
                rows={3}
                className="input w-full text-xs resize-none"
              />
            </div>

            <button
              onClick={generateMentorBrief}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#8b5cf6]/15
                text-[#8b5cf6] border border-[#8b5cf6]/30 text-sm font-semibold hover:bg-[#8b5cf6]/25 transition-colors"
            >
              <Brain size={14} /> {t('mb.generate')}
            </button>

            {mbPreview && (
              <div className="space-y-2 pt-2 border-t border-[#1f2937]">
                <div className="flex gap-2">
                  <button
                    onClick={copyMentorBrief}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors
                      ${mbCopied
                        ? 'bg-[#10b981]/15 border-[#10b981]/30 text-[#10b981]'
                        : 'bg-[#131c2e] border-[#2d3748] text-slate-300 hover:text-white hover:border-[#374151]'}`}
                  >
                    {mbCopied ? <Check size={12} /> : <Copy size={12} />}
                    {mbCopied ? t('mb.copy_md_done') : t('mb.copy_md')}
                  </button>
                  <button
                    onClick={() => downloadMentorBrief(false)}
                    className="px-3 py-2 rounded-lg border bg-[#131c2e] border-[#2d3748] text-slate-300
                      hover:text-white hover:border-[#374151] transition-colors text-xs font-medium flex items-center gap-1.5"
                  >
                    <FileDown size={12} /> .md
                  </button>
                  <button
                    onClick={() => downloadMentorBrief(true)}
                    className="px-3 py-2 rounded-lg border bg-[#131c2e] border-[#2d3748] text-slate-300
                      hover:text-white hover:border-[#374151] transition-colors text-xs font-medium flex items-center gap-1.5"
                  >
                    <FileDown size={12} /> .json
                  </button>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-300 py-1">
                    {t('mb.show_preview')} ({mbPreview.json.meta.tradeCount} {t('common.trades')})
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-[#0d1117] border border-[#1f2937] text-[10px]
                    text-slate-400 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {mbPreview.markdown}
                  </pre>
                </details>
              </div>
            )}
          </div>

          {/* Backup & Restore */}
          <div className="card p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">{t('backup.title')}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('backup.subtitle')}
              </p>
            </div>
            <button
              onClick={handleExport}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border bg-[#131c2e] border-[#2d3748]
                text-slate-300 hover:border-[#374151] hover:text-white transition-all duration-200 text-sm font-medium"
            >
              <Database size={16} className="text-[#10b981]" />
              <div className="text-left flex-1">
                <div className="font-semibold">{t('backup.export')}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {t('backup.export_hint', { trades: trades.length, notes: Object.keys(JSON.parse(localStorage.getItem('tradestats_position_notes') || '{}')).length })}
                </div>
              </div>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border bg-[#131c2e] border-[#2d3748]
                text-slate-300 hover:border-[#374151] hover:text-white transition-all duration-200 text-sm font-medium"
            >
              <Upload size={16} className="text-[#3b82f6]" />
              <div className="text-left flex-1">
                <div className="font-semibold">{t('backup.restore')}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {t('backup.restore_hint')}
                </div>
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
          </div>

          {/* Info über enthaltene Metriken */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200">{t('profile.included_metrics')}</h3>
              <span className="text-[10px] text-slate-500 font-mono">{range.label}</span>
            </div>
            <div className="space-y-2">
              {periodStats.count === 0 ? (
                <p className="text-xs text-slate-500 py-2">{t('profile.no_trades_in_period')}.</p>
              ) : (
                [
                  [t('common.win_rate'),       `${periodStats.winRate.toFixed(1)}%`,                                   periodStats.winRate >= 50],
                  [t('dash.roi'),              `${periodStats.roi >= 0 ? '+' : ''}${periodStats.roi.toFixed(2)}%`,     periodStats.roi >= 0],
                  [t('common.profit_factor'),  periodStats.profitFactor >= 99.9 ? '∞' : periodStats.profitFactor.toFixed(2), periodStats.profitFactor >= 1],
                  [t('common.trades'),         String(periodStats.count), true],
                  [t('common.trading_days'),   String(periodStats.tradingDays), true],
                  ...(periodStats.topTrades.length > 0
                    ? periodStats.topTrades.map((tt, i) => [
                        `Top ${i + 1} ${t('common.trade')}`,
                        `${tt.symbol} +${tt.pnlPct.toFixed(2)}%`,
                        true,
                      ])
                    : []),
                ].map(([label, val, good]) => (
                  <div key={label} className="flex items-center justify-between py-1.5
                    border-b border-[#1f2937]/40 last:border-0">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className={`text-xs font-mono font-bold ${good ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                      {val}
                    </span>
                  </div>
                ))
              )}
            </div>
            <p className="text-[10px] text-slate-700 mt-3">
              ⚠ {t('profile.share_safe_hint')}
            </p>
          </div>

        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {confirmRestore && (
        <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4 fade-in"
          onClick={() => setConfirmRestore(null)}>
          <div className="bg-[#111827] border border-[#ef4444]/30 rounded-2xl shadow-2xl w-full max-w-md"
            onClick={e => e.stopPropagation()}>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-[#ef4444]" />
                <h3 className="text-sm font-semibold text-slate-200">{t('backup.restore_confirm')}</h3>
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <p>{t('backup.restore_file')}: <span className="font-mono text-slate-300">{confirmRestore.fileName}</span></p>
                <p>{t('backup.restore_exported')}: <span className="font-mono text-slate-300">
                  {confirmRestore.backup.exportedAt
                    ? format(new Date(confirmRestore.backup.exportedAt), 'dd.MM.yyyy HH:mm')
                    : '—'}
                </span></p>
                <p>{t('backup.restore_trades_in_backup')}: <span className="font-mono text-slate-300">
                  {(() => {
                    try { return JSON.parse(confirmRestore.backup.data['tradestats_trades'] || '[]').length }
                    catch { return '?' }
                  })()}
                </span></p>
              </div>
              <p className="text-[11px] text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg p-2.5">
                {t('backup.restore_warning')}
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#1f2937]">
              <button onClick={() => setConfirmRestore(null)}
                className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5">
                {t('common.cancel')}
              </button>
              <button onClick={doRestore}
                className="text-xs px-4 py-1.5 rounded-lg bg-[#ef4444]/15 text-[#ef4444]
                  border border-[#ef4444]/30 font-semibold hover:bg-[#ef4444]/25 transition-colors">
                {t('backup.restore_action')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
