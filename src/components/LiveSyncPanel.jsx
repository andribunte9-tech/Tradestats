/**
 * LiveSyncPanel
 * Shows in the main content area (top of Dashboard / any page):
 *  - Account bar: balance, equity, open P&L
 *  - Open positions table with live P&L
 *
 * LiveStatusBadge – small inline badge used in the Sidebar header
 * ImportToast     – transient notification when trades are auto-imported
 */

import { useState, useMemo, Fragment } from 'react'
import { format } from 'date-fns'
import {
  Wifi, WifiOff, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, RefreshCw, CheckCircle, Layers,
  MessageSquare, X, Plus,
} from 'lucide-react'
import { useLiveSync } from '../hooks/useLiveSync'
import { usePositionNotes } from '../hooks/usePositionNotes'
import { useTrades } from '../hooks/useTrades'
import { useLanguage } from '../hooks/useLanguage'
import { formatDuration } from '../utils/calculations'
import { differenceInMinutes } from 'date-fns'

/* ─── Helpers ───────────────────────────────────────────── */
function PnlCell({ value, className = '' }) {
  const color = value > 0 ? 'text-[#10b981]' : value < 0 ? 'text-[#ef4444]' : 'text-slate-400'
  return (
    <span className={`font-mono font-semibold ${color} ${className}`}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}
    </span>
  )
}

/* ─── Account Bar ────────────────────────────────────────── */
function AccountBar({ account }) {
  const { t } = useLanguage()
  if (!account) return null
  const profitColor = account.profit > 0 ? 'text-[#10b981]' : account.profit < 0 ? 'text-[#ef4444]' : 'text-slate-400'

  return (
    <div className="flex flex-wrap items-center gap-4 bg-[#0d1117] border border-[#1f2937] rounded-xl px-5 py-3">
      <div>
        <span className="text-xs text-slate-500">{t('live.account')}</span>
        <p className="text-sm font-mono font-semibold text-slate-200">
          {account.name} <span className="text-slate-500 text-xs">#{account.login}</span>
        </p>
      </div>
      <div className="h-8 w-px bg-[#1f2937]" />
      <div>
        <span className="text-xs text-slate-500">{t('live.balance')}</span>
        <p className="text-sm font-mono font-bold text-slate-200">
          {account.balance.toFixed(2)} <span className="text-slate-500 text-xs">{account.currency}</span>
        </p>
      </div>
      <div>
        <span className="text-xs text-slate-500">{t('live.equity')}</span>
        <p className="text-sm font-mono font-bold text-slate-200">
          {account.equity.toFixed(2)} <span className="text-slate-500 text-xs">{account.currency}</span>
        </p>
      </div>
      <div>
        <span className="text-xs text-slate-500">{t('live.open_pnl')}</span>
        <p className={`text-sm font-mono font-bold ${profitColor}`}>
          {account.profit >= 0 ? '+' : ''}{account.profit.toFixed(2)}
        </p>
      </div>
      {account.marginLevel > 0 && (
        <div>
          <span className="text-xs text-slate-500">{t('live.margin_level')}</span>
          <p className={`text-sm font-mono font-bold ${
            account.marginLevel > 200 ? 'text-[#10b981]' : account.marginLevel > 100 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
          }`}>
            {account.marginLevel.toFixed(0)}%
          </p>
        </div>
      )}
      <div className="ml-auto text-right">
        <span className="text-xs text-slate-500">{account.server}</span>
        <p className="text-xs text-slate-600">1:{account.leverage}</p>
      </div>
    </div>
  )
}

/* ─── Open Positions Grouping ────────────────────────────── */
function buildPositionGroups(positions) {
  const bySymbol = {}
  for (const p of positions) {
    if (!bySymbol[p.symbol]) bySymbol[p.symbol] = []
    bySymbol[p.symbol].push(p)
  }
  return Object.entries(bySymbol).map(([symbol, members]) => {
    const totalVol = members.reduce((s, p) => s + (p.volume || 0), 0)
    const buyVol   = members.filter(p => p.type === 'BUY') .reduce((s, p) => s + (p.volume || 0), 0)
    const sellVol  = members.filter(p => p.type === 'SELL').reduce((s, p) => s + (p.volume || 0), 0)
    const avgEntry = totalVol > 0
      ? members.reduce((s, p) => s + (p.openPrice || 0) * (p.volume || 0), 0) / totalVol
      : (members[0]?.openPrice || 0)
    // Volume-weighted avg TP/SL — only counting members that have one set
    const withTp = members.filter(p => p.tp && p.tp > 0)
    const tpVol  = withTp.reduce((s, p) => s + (p.volume || 0), 0)
    const avgTp  = tpVol > 0
      ? withTp.reduce((s, p) => s + p.tp * (p.volume || 0), 0) / tpVol
      : 0
    const withSl = members.filter(p => p.sl && p.sl > 0)
    const slVol  = withSl.reduce((s, p) => s + (p.volume || 0), 0)
    const avgSl  = slVol > 0
      ? withSl.reduce((s, p) => s + p.sl * (p.volume || 0), 0) / slVol
      : 0
    const totalPnl = members.reduce((s, p) => s + (p.netPnl || 0), 0)
    const earliestOpen = members
      .map(p => p.openTime ? new Date(p.openTime).getTime() : Infinity)
      .reduce((a, b) => Math.min(a, b), Infinity)
    return {
      key: symbol,
      symbol,
      members,
      isSingle: members.length === 1,
      type:     buyVol === 0 ? 'SELL' : sellVol === 0 ? 'BUY' : 'MIXED',
      volume:   parseFloat(totalVol.toFixed(2)),
      avgEntry,
      avgTp,
      avgSl,
      // True only if ALL members in the same direction have a TP set
      tpCoversAll: tpVol > 0 && tpVol === totalVol,
      slCoversAll: slVol > 0 && slVol === totalVol,
      currentPrice: members[0]?.currentPrice ?? 0,
      totalPnl,
      openTime: isFinite(earliestOpen) ? new Date(earliestOpen).toISOString() : null,
    }
  })
}

/* ─── Position Notes Modal ───────────────────────────────── */
function PositionNotesModal({ pos, onClose }) {
  const { get, set, remove } = usePositionNotes()
  const { allTags } = useTrades()
  const { t } = useLanguage()
  const existing = get(pos.id)
  const [notes, setNotes]   = useState(existing.notes || '')
  const [tags,  setTags]    = useState(existing.tags  || [])
  const [tagInput, setTagInput] = useState('')

  function addTag(name) {
    const n = name.trim()
    if (!n || tags.includes(n)) return
    setTags(prev => [...prev, n])
    setTagInput('')
  }
  function removeTag(name) { setTags(prev => prev.filter(t => t !== name)) }

  function save() {
    if (!notes.trim() && tags.length === 0) remove(pos.id)
    else set(pos.id, { notes: notes.trim(), tags })
    onClose()
  }

  const suggestedTags = allTags.filter(t => !tags.includes(t.name)).slice(0, 8)

  return (
    <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4 fade-in" onClick={onClose}>
      <div className="bg-[#111827] border border-[#2d3748] rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2937]">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">{t('live.position_note')}</h3>
            <p className="text-[11px] text-slate-500 font-mono">{pos.symbol} · {pos.type} · {pos.volume}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">{t('common.notes')}</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('live.note_placeholder')}
              rows={5}
              className="input w-full text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">{t('common.tags')}</label>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[24px]">
              {tags.map(name => (
                <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#8b5cf6]/15 text-[#8b5cf6] text-xs">
                  {name}
                  <button onClick={() => removeTag(name)} className="hover:text-white"><X size={10} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }}
                placeholder={t('live.add_tag')}
                className="input flex-1 text-xs"
              />
              <button onClick={() => addTag(tagInput)} className="btn-secondary text-xs px-2"><Plus size={12} /></button>
            </div>
            {suggestedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {suggestedTags.map(sg => (
                  <button key={sg.name} onClick={() => addTag(sg.name)} className="text-[10px] px-2 py-0.5 rounded-full text-slate-500 hover:text-slate-200 border border-[#2d3748] hover:border-slate-500 transition-colors">
                    + {sg.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#1f2937]">
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5">{t('common.cancel')}</button>
          <button onClick={save} className="btn-primary text-xs px-4 py-1.5">{t('common.save')}</button>
        </div>
      </div>
    </div>
  )
}

/* ─── Risk distance helper ───────────────────────────────── */
function priceDistancePct(from, to) {
  if (!from || !to) return null
  return ((to - from) / from) * 100
}

/**
 * Backend transformiert die Live-MFE/MAE-Keys von "pos-{ticket}" zu
 * "mt5-{ticket}" (siehe sync.py /mfe-mae endpoint). Hier mappen wir das
 * zurück: position.id ist "pos-...", live-map-key ist "mt5-...".
 */
function lookupMfeLive(mfeLiveMap, pos) {
  if (!mfeLiveMap || !pos) return null
  const archiveKey = pos.id ? pos.id.replace(/^pos-/, 'mt5-') : null
  return mfeLiveMap[archiveKey] || mfeLiveMap[pos.id] || null
}

/**
 * Berechnet die "signierte Prozentzahl in Richtung TP" und konvertiert die
 * MFE/MAE-Dollar-Werte in dieselbe Einheit. Positiv = Richtung TP,
 * Negativ = Richtung Verlust. Werte sind bereits auf ±100 geklammert.
 *
 * Gibt null zurück, wenn keine sinnvolle Skala ableitbar ist (kein TP,
 * gerade exakt break-even ohne Daten zum Umrechnen, etc.).
 */
function computeTpProgress({ openPrice, currentPrice, tp, type, netPnl }, mfeMaeLive) {
  if (!tp || tp <= 0 || !openPrice) return null
  const dirSign = type === 'BUY' ? 1 : -1
  const signedCurrDist = (currentPrice - openPrice) * dirSign
  const tpDist = Math.abs(tp - openPrice)
  if (tpDist <= 0) return null

  const signedPct = (signedCurrDist / tpDist) * 100   // kann negativ sein

  let mfePct = null
  let maePct = null
  // Konversion $ → % via netPnl-Skala (nur möglich wenn beide nicht 0 sind).
  if (mfeMaeLive && netPnl && Math.abs(signedCurrDist) > 1e-12) {
    const factor = signedPct / netPnl   // % pro $
    if (mfeMaeLive.mfe != null) mfePct = Math.max(0, Math.min(100, mfeMaeLive.mfe * factor))
    if (mfeMaeLive.mae != null) maePct = Math.max(-100, Math.min(0, mfeMaeLive.mae * factor))
  }

  return {
    signedPct: Math.max(-100, Math.min(100, signedPct)),
    mfePct,   // positiv (oder null)
    maePct,   // negativ (oder null)
  }
}

/**
 * Zwei-seitige TP-Progress-Bar mit Ghost-Trail für MFE (max Gewinn-Ausschlag)
 * und MAE (max Verlust-Ausschlag). Aufbau:
 *
 *   [---ghost-rot MAE---|--solid-rot current---] mitte [--solid-grün current---|---ghost-grün MFE---]
 *
 * Jede Hälfte deckt maximal 50% der Bar-Breite ab — 100% Richtung TP = volle Hälfte.
 * Kein Prozent-Label; Hover-Tooltip zeigt die Zahlen.
 */
function TpProgressBar({ progress }) {
  if (!progress) return <span className="text-[10px] text-slate-700">—</span>
  const { signedPct, mfePct, maePct } = progress
  const half = (n) => Math.max(0, Math.min(50, Math.abs(n) / 2))   // jede Seite max 50% der Bar

  const tipParts = []
  tipParts.push(`${signedPct >= 0 ? '+' : ''}${signedPct.toFixed(0)}% → TP`)
  if (mfePct != null && mfePct > 0) tipParts.push(`MFE: +${mfePct.toFixed(0)}%`)
  if (maePct != null && maePct < 0) tipParts.push(`MAE: ${maePct.toFixed(0)}%`)

  return (
    <div
      className="relative h-1.5 bg-[#1f2937] rounded-full overflow-hidden min-w-[60px] max-w-[100px]"
      title={tipParts.join('  ·  ')}
    >
      {/* Center-Divider */}
      <div className="absolute top-0 bottom-0 w-px bg-slate-600" style={{ left: '50%' }} />

      {/* Ghost-MFE — heller grüner Schweif, zeigt wie weit der Trade mal vorn war */}
      {mfePct != null && mfePct > 0 && (
        <div
          className="absolute top-0 bottom-0 bg-[#10b981]"
          style={{ left: '50%', width: `${half(mfePct)}%`, opacity: 0.25 }}
        />
      )}
      {/* Ghost-MAE — heller roter Schweif, zeigt wie tief im Minus es mal war */}
      {maePct != null && maePct < 0 && (
        <div
          className="absolute top-0 bottom-0 bg-[#ef4444]"
          style={{ right: '50%', width: `${half(maePct)}%`, opacity: 0.25 }}
        />
      )}
      {/* Solid: aktueller Stand (überlagert die Ghosts) */}
      {signedPct > 0 && (
        <div
          className="absolute top-0 bottom-0 bg-[#10b981] transition-all"
          style={{ left: '50%', width: `${half(signedPct)}%` }}
        />
      )}
      {signedPct < 0 && (
        <div
          className="absolute top-0 bottom-0 bg-[#ef4444] transition-all"
          style={{ right: '50%', width: `${half(signedPct)}%` }}
        />
      )}
    </div>
  )
}

function RiskBar({ pos, mfeLive }) {
  const progress = computeTpProgress(pos, mfeLive)
  return <TpProgressBar progress={progress} />
}

function SlTpCell({ pos, kind }) {
  const price = kind === 'sl' ? pos.sl : pos.tp
  if (!price) return <span className="font-mono text-slate-700 text-xs">—</span>
  const distPct = priceDistancePct(pos.currentPrice, price)
  const isLoss = kind === 'sl'
  return (
    <div className="flex flex-col">
      <span className="font-mono text-slate-400 text-xs">{price.toFixed(5)}</span>
      <span className={`font-mono text-[9px] ${isLoss ? 'text-[#ef4444]' : 'text-[#10b981]'}`}>
        {distPct >= 0 ? '+' : ''}{distPct?.toFixed(2)}%
      </span>
    </div>
  )
}

/* ─── Open Positions Table ───────────────────────────────── */
function PositionRow({ pos, indent = false, onOpenNotes, mfeLive }) {
  const { get } = usePositionNotes()
  const note = get(pos.id)
  const hasNote = !!(note.notes || note.tags?.length)
  const duration = pos.openTime
    ? differenceInMinutes(new Date(), new Date(pos.openTime))
    : null
  const priceChange = pos.currentPrice - pos.openPrice
  const isUp = pos.type === 'BUY' ? priceChange > 0 : priceChange < 0
  return (
    <tr className={`border-b border-[#1f2937]/30 hover:bg-[#0d1117] transition-colors ${indent ? 'bg-[#080c14]' : ''}`}>
      <td className={`px-4 py-2.5 ${indent ? 'pl-12' : ''}`}>
        <div className="flex items-center gap-1.5">
          <span className={`font-mono ${indent ? 'text-xs font-semibold text-slate-400' : 'font-bold text-slate-200'}`}>{pos.symbol}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenNotes(pos) }}
            className={`p-0.5 rounded transition-colors ${hasNote ? 'text-[#3b82f6]' : 'text-slate-700 hover:text-slate-400'}`}
            title={hasNote ? 'Notiz bearbeiten' : 'Notiz hinzufügen'}
          >
            <MessageSquare size={11} />
          </button>
          {note.tags?.slice(0, 2).map(name => (
            <span key={name} className="text-[9px] px-1 py-0 rounded bg-[#8b5cf6]/15 text-[#8b5cf6]">{name}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
          pos.type === 'BUY' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#ef4444]/10 text-[#ef4444]'
        }`}>{pos.type}</span>
      </td>
      <td className="px-4 py-2.5 font-mono text-slate-400 text-xs">{pos.volume}</td>
      <td className="px-4 py-2.5 font-mono text-slate-400 text-xs">{pos.openPrice?.toFixed(5)}</td>
      <td className="px-4 py-2.5 font-mono text-xs">
        <span className={isUp ? 'text-[#10b981]' : 'text-[#ef4444]'}>{pos.currentPrice?.toFixed(5)}</span>
      </td>
      <td className="px-4 py-2.5"><SlTpCell pos={pos} kind="sl" /></td>
      <td className="px-4 py-2.5"><SlTpCell pos={pos} kind="tp" /></td>
      <td className="px-4 py-2.5 min-w-[100px]"><RiskBar pos={pos} mfeLive={mfeLive} /></td>
      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
        {duration != null ? formatDuration(duration) : '—'}
      </td>
      <td className="px-4 py-2.5"><PnlCell value={pos.netPnl} /></td>
    </tr>
  )
}

function GroupRiskBar({ group, mfeLiveMap }) {
  // Behandle den Group wie eine virtuelle Position mit Volumen-gewichtetem Mittel.
  const { avgEntry, avgTp, currentPrice, type, members, totalPnl } = group
  if (avgTp <= 0 || type === 'MIXED') return <span className="text-[10px] text-slate-700">—</span>

  // MFE/MAE des Groups = Summe der Live-Werte aller Mitglieder (in $)
  let mfeSum = 0
  let maeSum = 0
  let hasMfe = false
  let hasMae = false
  for (const m of members) {
    const live = lookupMfeLive(mfeLiveMap, m)
    if (!live) continue
    if (live.mfe != null) { mfeSum += live.mfe; hasMfe = true }
    if (live.mae != null) { maeSum += live.mae; hasMae = true }
  }
  const aggregated = (hasMfe || hasMae) ? { mfe: hasMfe ? mfeSum : null, mae: hasMae ? maeSum : null } : null

  const progress = computeTpProgress(
    { openPrice: avgEntry, currentPrice, tp: avgTp, type, netPnl: totalPnl },
    aggregated
  )
  return <TpProgressBar progress={progress} />
}

function PositionGroupRow({ group, isExpanded, onToggle, mfeLiveMap }) {
  const duration = group.openTime
    ? differenceInMinutes(new Date(), new Date(group.openTime))
    : null
  const priceChange = group.currentPrice - group.avgEntry
  const isUp = group.type === 'BUY' ? priceChange > 0 : group.type === 'SELL' ? priceChange < 0 : group.totalPnl >= 0
  const hasTp = group.avgTp > 0
  const hasSl = group.avgSl > 0
  // Distance % from current to avg TP/SL for the small labels under the prices
  const tpDistPct = hasTp ? ((group.avgTp - group.currentPrice) / group.currentPrice) * 100 : null
  const slDistPct = hasSl ? ((group.avgSl - group.currentPrice) / group.currentPrice) * 100 : null
  return (
    <tr
      className="border-b border-[#1f2937]/50 bg-[#0d1117] hover:bg-[#1a2233] transition-colors cursor-pointer"
      onClick={onToggle}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <ChevronDown size={13} className={`text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
          <span className="font-mono font-bold text-slate-200">{group.symbol}</span>
          <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold
            bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/20">
            <Layers size={8} /> {group.members.length}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
          group.type === 'BUY'  ? 'bg-[#10b981]/10 text-[#10b981]'
          : group.type === 'SELL' ? 'bg-[#ef4444]/10 text-[#ef4444]'
          : 'bg-[#8b5cf6]/10 text-[#8b5cf6]'
        }`}>{group.type}</span>
      </td>
      <td className="px-4 py-3 font-mono text-slate-400 text-xs">{group.volume}</td>
      <td className="px-4 py-3 font-mono text-slate-400 text-xs" title="Gewichteter Ø Entry">
        {group.avgEntry.toFixed(5)}
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        <span className={isUp ? 'text-[#10b981]' : 'text-[#ef4444]'}>{group.currentPrice?.toFixed(5)}</span>
      </td>
      {/* SL (volume-weighted avg) */}
      <td className="px-4 py-3">
        {hasSl ? (
          <div className="flex flex-col">
            <span className="font-mono text-slate-400 text-xs">{group.avgSl.toFixed(5)}</span>
            <span className="font-mono text-[9px] text-[#ef4444]">
              {slDistPct >= 0 ? '+' : ''}{slDistPct.toFixed(2)}%
            </span>
          </div>
        ) : (
          <span className="font-mono text-slate-600 text-xs">—</span>
        )}
      </td>
      {/* TP (volume-weighted avg) */}
      <td className="px-4 py-3">
        {hasTp ? (
          <div className="flex flex-col">
            <span className="font-mono text-slate-400 text-xs">{group.avgTp.toFixed(5)}</span>
            <span className="font-mono text-[9px] text-[#10b981]">
              {tpDistPct >= 0 ? '+' : ''}{tpDistPct.toFixed(2)}%
            </span>
          </div>
        ) : (
          <span className="font-mono text-slate-600 text-xs">—</span>
        )}
      </td>
      {/* Risk/Reward Progress */}
      <td className="px-4 py-3 min-w-[100px]"><GroupRiskBar group={group} mfeLiveMap={mfeLiveMap} /></td>
      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
        {duration != null ? formatDuration(duration) : '—'}
      </td>
      <td className="px-4 py-3"><PnlCell value={group.totalPnl} /></td>
    </tr>
  )
}

function PositionsTable({ positions, mfeLiveMap }) {
  const totalPnl = positions.reduce((s, p) => s + p.netPnl, 0)
  const groups = useMemo(() => buildPositionGroups(positions), [positions])
  const groupCount = groups.filter(g => !g.isSingle).length
  const [expanded, setExpanded] = useState(new Set())
  const [notesPos, setNotesPos] = useState(null)
  const { t } = useLanguage()
  function toggleGroup(key) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
          <h3 className="text-sm font-semibold text-slate-200">
            {t('live.open_positions')}
          </h3>
          <span className="bg-[#10b981]/15 text-[#10b981] text-xs px-2 py-0.5 rounded-full font-medium">
            {positions.length}
          </span>
          {groupCount > 0 && (
            <span className="bg-[#3b82f6]/15 text-[#3b82f6] text-xs px-2 py-0.5 rounded-full font-medium">
              {t(groupCount === 1 ? 'live.groups' : 'live.groups_plural', { count: groupCount })}
            </span>
          )}
        </div>
        <PnlCell value={totalPnl} className="text-sm" />
      </div>

      {positions.length === 0 ? (
        <div className="p-6 text-center text-slate-600 text-sm">
          {t('live.no_positions')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1f2937]">
                {[t('common.symbol'), t('common.type'), t('common.volume_short'), t('common.open'), t('common.current'), 'SL', 'TP', t('live.col_risk_reward'), t('common.duration'), t('common.pnl')].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs text-slate-500 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                group.isSingle ? (
                  <PositionRow
                    key={group.key}
                    pos={group.members[0]}
                    onOpenNotes={setNotesPos}
                    mfeLive={lookupMfeLive(mfeLiveMap, group.members[0])}
                  />
                ) : (
                  <Fragment key={group.key}>
                    <PositionGroupRow
                      group={group}
                      isExpanded={expanded.has(group.key)}
                      onToggle={() => toggleGroup(group.key)}
                      mfeLiveMap={mfeLiveMap}
                    />
                    {expanded.has(group.key) && group.members.map(pos => (
                      <PositionRow
                        key={pos.id}
                        pos={pos}
                        indent
                        onOpenNotes={setNotesPos}
                        mfeLive={lookupMfeLive(mfeLiveMap, pos)}
                      />
                    ))}
                  </Fragment>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
      {notesPos && <PositionNotesModal pos={notesPos} onClose={() => setNotesPos(null)} />}
    </div>
  )
}

/* ─── Main LiveSyncPanel (used in Dashboard) ─────────────── */
export function LiveSyncPanel() {
  const { status, positions, mfeMae } = useLiveSync()
  const { t } = useLanguage()
  const [collapsed, setCollapsed] = useState(false)
  const mfeLiveMap = mfeMae?.live || {}

  // Don't render if backend is not reachable
  if (!status.apiReachable) return null

  return (
    <div className="space-y-3 fade-in">
      {/* Connection banner */}
      <div className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border text-sm ${
        status.connected
          ? 'bg-[#10b981]/8 border-[#10b981]/20'
          : 'bg-[#ef4444]/8 border-[#ef4444]/20'
      }`}>
        {status.connected ? (
          <Wifi size={14} className="text-[#10b981] flex-shrink-0" />
        ) : (
          <WifiOff size={14} className="text-[#ef4444] flex-shrink-0" />
        )}
        <span className={status.connected ? 'text-[#10b981]' : 'text-[#ef4444]'}>
          {status.connected
            ? `${t('live.mt5_connected')} · ${status.posCount} ${status.posCount === 1 ? t('common.position') : t('common.positions')} · ${status.histCount} ${t('common.trades')}`
            : status.error || t('live.mt5_not_connected')}
        </span>
        {status.lastUpdate && (
          <span className="ml-auto text-slate-600 text-xs font-mono">
            {format(new Date(status.lastUpdate), 'HH:mm:ss')}
          </span>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-2 text-slate-500 hover:text-slate-300 flex-shrink-0"
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!collapsed && status.connected && (
        <>
          <AccountBar account={status.account} />
          <PositionsTable positions={positions} mfeLiveMap={mfeLiveMap} />
        </>
      )}
    </div>
  )
}

/* ─── Compact status badge for Sidebar ──────────────────── */
export function LiveStatusBadge() {
  const { status, positions } = useLiveSync()
  const { t } = useLanguage()

  if (!status.apiReachable) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#1f2937]/50">
        <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
        <span className="text-[10px] text-slate-600">{t('nav.offline')}</span>
      </div>
    )
  }

  if (!status.connected) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#ef4444]/10">
        <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
        <span className="text-[10px] text-[#ef4444]">{t('nav.mt5_disconnected')}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#10b981]/10">
      <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
      <span className="text-[10px] text-[#10b981] font-medium">
        {t('nav.live')} · {positions.length}P
      </span>
    </div>
  )
}

/* ─── Auto-Import Toast ──────────────────────────────────── */
export function ImportToast() {
  const { toast } = useLiveSync()
  const { t } = useLanguage()
  if (!toast) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 fade-in">
      <div className="bg-[#111827] border border-[#10b981]/30 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3">
        <CheckCircle size={16} className="text-[#10b981] flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-[#10b981]">
            {t(toast.count === 1 ? 'live.x_imported' : 'live.x_imported_plural', { count: toast.count })}
          </p>
          <p className="text-xs text-slate-500">{t('live.auto_imported')}</p>
        </div>
      </div>
    </div>
  )
}
