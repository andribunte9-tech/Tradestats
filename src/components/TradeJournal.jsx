import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Search, Plus, Filter, MessageSquare, X, ChevronUp, ChevronDown,
  Layers, Unlink, Link, GripVertical, Ban, RotateCcw, Trash2, RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import { useTrades } from '../hooks/useTrades'
import TradeDetailModal from './TradeDetailModal'
import AddTradeModal from './AddTradeModal'
import { getSymbolCategory } from '../utils/calculations'
import { buildTradeGroups } from '../utils/tradeGrouping'
import { Pvt } from '../hooks/usePrivacyMode'
import { useToast } from '../hooks/useToast'
import { useLiveSync } from '../hooks/useLiveSync'
import { useLanguage } from '../hooks/useLanguage'

/* ─── Kategorie-Konfiguration ───────────────────────────────── */
const CATEGORIES = [
  { id: 'alle',        key: 'journal.cat_all',         color: '#6b7280' },
  { id: 'forex',       key: 'journal.cat_forex',       color: '#3b82f6' },
  { id: 'commodities', key: 'journal.cat_commodities', color: '#f59e0b' },
  { id: 'indices',     key: 'journal.cat_indices',     color: '#8b5cf6' },
  { id: 'crypto',      key: 'journal.cat_crypto',      color: '#06b6d4' },
  { id: 'aktien',      key: 'journal.cat_stocks',      color: '#10b981' },
]
const getCatConfig = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[0]

/* ─── Kategorie-Badge ───────────────────────────────────────── */
function CatBadge({ symbol }) {
  const cat = getCatConfig(getSymbolCategory(symbol))
  if (cat.id === 'alle') return null
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ml-1"
      style={{ backgroundColor: cat.color + '22', color: cat.color }}>
      {cat.label}
    </span>
  )
}

/* ─── Tag Badge ─────────────────────────────────────────────── */
function TagBadge({ name, style }) {
  return (
    <span className="tag text-[10px]" style={{ backgroundColor: style.bg, color: style.color }}>
      {name}
    </span>
  )
}

/* ─── Spalten-Header ─────────────────────────────────────────── */
function ColHeader({ label, field, sort, onSort, className = '' }) {
  const active = sort.field === field
  return (
    <th className={`px-4 py-3 text-left text-xs text-slate-500 font-medium cursor-pointer hover:text-slate-300 select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(field)}>
      <span className="flex items-center gap-1">
        {label}
        {active
          ? sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
          : <span className="opacity-20"><ChevronUp size={11} /></span>}
      </span>
    </th>
  )
}

/* ─── Kategorie-Filterleiste ────────────────────────────────── */
function CatFilterBar({ trades, activeCat, setActiveCat, activeSym, setActiveSym }) {
  const { t } = useLanguage()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setDropdownOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const countByCat = useMemo(() => {
    const c = {}
    trades.forEach(t => { const cat = getSymbolCategory(t.symbol); c[cat] = (c[cat] || 0) + 1 })
    return c
  }, [trades])

  const symbolsInCat = useMemo(() => {
    if (activeCat === 'alle') return []
    const s = new Set()
    trades.forEach(t => { if (getSymbolCategory(t.symbol) === activeCat) s.add(t.symbol) })
    return [...s].sort()
  }, [trades, activeCat])

  function handleCatClick(id) {
    if (id === 'alle') { setActiveCat('alle'); setActiveSym(null); setDropdownOpen(false); return }
    if (activeCat === id) { setDropdownOpen(p => !p) }
    else { setActiveCat(id); setActiveSym(null); setDropdownOpen(true) }
  }
  const activeCatObj = getCatConfig(activeCat)

  return (
    <div className="flex items-center gap-2 flex-wrap" ref={ref}>
      {CATEGORIES.map(cat => {
        const isActive = activeCat === cat.id
        const count    = cat.id === 'alle' ? trades.length : (countByCat[cat.id] || 0)
        const isEmpty  = cat.id !== 'alle' && count === 0
        const showDrop = dropdownOpen && isActive && symbolsInCat.length > 0
        const label    = t(cat.key)
        return (
          <div key={cat.id} className="relative">
            <button
              onClick={() => !isEmpty && handleCatClick(cat.id)}
              disabled={isEmpty}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                transition-all duration-150 border
                ${isActive ? 'text-white border-transparent'
                  : isEmpty ? 'text-slate-700 border-[#1a2030] bg-[#0f1724] cursor-not-allowed'
                  : 'text-slate-400 border-[#2d3748] bg-[#131c2e] hover:text-slate-200 hover:border-slate-600'}`}
              style={isActive ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
            >
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono
                ${isActive ? 'bg-black/20 text-white' : isEmpty ? 'bg-[#1a2030] text-slate-700' : 'bg-[#1f2937] text-slate-500'}`}>
                {count}
              </span>
              {!isEmpty && cat.id !== 'alle' && (
                <ChevronDown size={11} className={`transition-transform duration-150 ${showDrop ? 'rotate-180' : ''}`} />
              )}
            </button>
            {showDrop && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-[#131c2e] border border-[#2d3748] rounded-xl shadow-2xl p-2 min-w-[180px]">
                <p className="text-[10px] text-slate-600 uppercase tracking-wider px-2 pb-2 font-medium">{t('journal.symbol_choose')}</p>
                <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto">
                  {symbolsInCat.map(sym => (
                    <button key={sym}
                      onClick={() => { setActiveSym(sym === activeSym ? null : sym); setDropdownOpen(false) }}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-colors text-left
                        ${activeSym === sym ? '' : 'text-slate-300 hover:bg-[#1f2937]'}`}
                      style={activeSym === sym ? { backgroundColor: cat.color + '33', color: cat.color } : {}}>
                      <span>{sym}</span>
                      <span className="text-[10px] text-slate-600 ml-4">{trades.filter(t => t.symbol === sym).length}T</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
      {activeSym && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-semibold text-white"
          style={{ backgroundColor: activeCatObj.color }}>
          {activeSym}
          <button onClick={() => setActiveSym(null)} className="hover:bg-black/20 rounded-full p-0.5 transition-colors">
            <X size={10} />
          </button>
        </div>
      )}
      {(activeCat !== 'alle' || activeSym) && !activeSym && (
        <button onClick={() => { setActiveCat('alle'); setActiveSym(null); setDropdownOpen(false) }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
          <X size={11} /> {t('common.reset')}
        </button>
      )}
    </div>
  )
}

/* ─── Einzelne Trade-Zeile (innerhalb einer Gruppe) ──────────── */
function SubTradeRow({ trade, getTagStyle, toggleNoAutoGroup, removeFromManualGroup, isInManualGroup, onDelete, selected, onToggleSelect }) {
  const { t } = useLanguage()
  const netPnl = trade.profit + (trade.commission || 0) + (trade.swap || 0)
  return (
    <tr className={`border-b border-[#1f2937]/30 hover:bg-[#0d1117] transition-colors ${selected ? 'bg-[#10b981]/5' : 'bg-[#080c14]'}`}>
      <td className="px-4 py-2.5 pl-8" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(trade.id)}
          className="accent-[#10b981] cursor-pointer"
        />
      </td>
      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
        {trade.closeTime ? format(new Date(trade.closeTime), 'dd.MM.yy HH:mm') : '—'}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs font-semibold text-slate-400">{trade.symbol}</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
          trade.type === 'BUY' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#ef4444]/10 text-[#ef4444]'}`}>
          {trade.type}
        </span>
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{trade.volume}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{trade.openPrice?.toFixed(5)}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{trade.closePrice?.toFixed(5)}</td>
      <td className="px-4 py-2.5">
        <span className={`font-mono text-xs font-semibold ${netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
          <Pvt value={netPnl} />
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1 max-w-[160px]">
          {(trade.tags || []).slice(0, 2).map(tag => (
            <TagBadge key={tag} name={tag} style={getTagStyle(tag)} />
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {/* Aus manueller Gruppe entfernen */}
          {isInManualGroup && (
            <button
              onClick={(e) => { e.stopPropagation(); removeFromManualGroup(trade.id) }}
              className="p-1 rounded text-slate-600 hover:text-[#f59e0b] hover:bg-[#f59e0b]/10 transition-colors"
              title={t('journal.remove_from_group')}
            >
              <Unlink size={11} />
            </button>
          )}
          {/* Auto-Group deaktivieren */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleNoAutoGroup(trade.id) }}
            className={`p-1 rounded transition-colors ${
              trade.noAutoGroup
                ? 'text-[#ef4444] bg-[#ef4444]/10'
                : 'text-slate-600 hover:text-slate-400 hover:bg-[#1f2937]'
            }`}
            title={trade.noAutoGroup ? t('journal.enable_autogroup') : t('journal.no_autogroup')}
          >
            {trade.noAutoGroup ? <RotateCcw size={11} /> : <Ban size={11} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(trade) }}
            className="p-1 rounded text-slate-600 hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
            title={t('journal.delete_trade')}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </td>
    </tr>
  )
}

/* ─── Gruppen-Zeile ─────────────────────────────────────────── */
function GroupRow({
  group, isExpanded, onToggle, onSelectTrade, getTagStyle,
  isDragOver, dragHandlers, toggleNoAutoGroup, dissolveManualGroup, removeFromManualGroup, onDelete,
  selectedIds, onToggleSelect, onToggleSelectGroup,
}) {
  const { t } = useLanguage()
  const { stats, trades, isManual, isSingle } = group
  const isGroup = !isSingle
  const netPnl  = stats.totalPnl
  const pnlColor = netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'

  const firstTrade = trades[0]

  // Selection state for the group (all trades in group selected?)
  const memberIds = trades.map(t => t.id)
  const selectedCount = memberIds.filter(id => selectedIds.has(id)).length
  const allSelected   = selectedCount === memberIds.length
  const someSelected  = selectedCount > 0 && !allSelected

  return (
    <>
      {/* ── Haupt-Zeile ── */}
      <tr
        className={`
          border-b border-[#1f2937]/50 transition-colors cursor-pointer
          ${isDragOver ? 'bg-[#10b981]/10 border-[#10b981]/30' : 'hover:bg-[#1a2233]'}
          ${selectedCount > 0 ? 'bg-[#10b981]/5' : isGroup ? 'bg-[#0d1117]' : ''}
        `}
        onClick={() => isSingle ? onSelectTrade(firstTrade) : onToggle()}
        {...dragHandlers}
      >
        {/* Checkbox */}
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected }}
            onChange={() => onToggleSelectGroup(memberIds, !allSelected)}
            className="accent-[#10b981] cursor-pointer"
          />
        </td>
        {/* Expand-Pfeil + Drag-Handle */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            {/* Drag Handle */}
            <div
              className="text-slate-700 hover:text-slate-500 cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => e.stopPropagation()}
              {...(dragHandlers.draggableProps || {})}
            >
              <GripVertical size={13} />
            </div>
            {/* Expand arrow (nur für echte Gruppen) */}
            {isGroup ? (
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
            ) : (
              <span className="w-[14px]" />
            )}
          </div>
        </td>

        {/* Datum */}
        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
          {stats.closeTime ? format(new Date(stats.closeTime), 'dd.MM.yy HH:mm') : '—'}
        </td>

        {/* Symbol + Gruppe-Badge */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-semibold text-slate-200">{stats.symbol}</span>
            <CatBadge symbol={stats.symbol} />
            {isGroup && (
              <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold
                bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/20">
                <Layers size={8} /> {stats.count}
              </span>
            )}
            {isManual && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold
                bg-[#8b5cf6]/15 text-[#8b5cf6] border border-[#8b5cf6]/20">
                {t('journal.manual')}
              </span>
            )}
          </div>
        </td>

        {/* Typ */}
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
            stats.type === 'BUY' ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-[#ef4444]/10 text-[#ef4444]'
          }`}>{stats.type}</span>
        </td>

        {/* Volumen */}
        <td className="px-4 py-3 font-mono text-slate-400">{stats.volume}</td>

        {/* Avg Entry */}
        <td className="px-4 py-3 font-mono text-slate-400">
          {isGroup
            ? <span title="Gewichteter Ø Entry">{stats.avgEntry.toFixed(5)}</span>
            : firstTrade.openPrice?.toFixed(5)
          }
        </td>

        {/* Avg Exit */}
        <td className="px-4 py-3 font-mono text-slate-400">
          {isGroup
            ? <span title="Gewichteter Ø Exit">{stats.avgExit.toFixed(5)}</span>
            : firstTrade.closePrice?.toFixed(5)
          }
        </td>

        {/* P&L */}
        <td className="px-4 py-3">
          <span className={`font-mono font-semibold ${pnlColor}`}>
            <Pvt value={netPnl} />
          </span>
        </td>

        {/* Tags (nur bei Singleton) */}
        <td className="px-4 py-3">
          {isSingle ? (
            <div className="flex flex-wrap gap-1 max-w-[160px]">
              {(firstTrade.tags || []).slice(0, 2).map(tag => (
                <TagBadge key={tag} name={tag} style={getTagStyle(tag)} />
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-slate-600">{trades.length} Trades</span>
          )}
        </td>

        {/* Aktionen */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            {isSingle && firstTrade.notes && (
              <MessageSquare size={13} className="text-[#3b82f6]" />
            )}
            {isManual && (
              <button
                onClick={() => dissolveManualGroup(stats.tradeIds)}
                className="p-1 rounded text-slate-600 hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
                title={t('journal.dissolve_group')}
              >
                <Unlink size={12} />
              </button>
            )}
            {isSingle && (
              <button
                onClick={() => onDelete(firstTrade)}
                className="p-1 rounded text-slate-600 hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
                title={t('journal.delete_trade')}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* ── Aufgeklappte Sub-Trades ── */}
      {isGroup && isExpanded && trades.map(trade => (
        <SubTradeRow
          key={trade.id}
          trade={trade}
          getTagStyle={getTagStyle}
          toggleNoAutoGroup={toggleNoAutoGroup}
          removeFromManualGroup={removeFromManualGroup}
          isInManualGroup={isManual}
          onDelete={onDelete}
          selected={selectedIds.has(trade.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </>
  )
}

/* ─── Trade Journal ─────────────────────────────────────────── */
export default function TradeJournal() {
  const {
    trades, allTags, getTagStyle,
    manualGroups, toggleNoAutoGroup, createManualGroup,
    dissolveManualGroup, removeFromManualGroup,
    deleteTrade, deleteTrades, restoreTrades,
  } = useTrades()
  const { showToast } = useToast()
  const { forceSync, status: liveStatus } = useLiveSync()
  const { t } = useLanguage()

  // Selection state
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    const res = await forceSync()
    setSyncing(false)
    if (!res.ok) {
      showToast({ type: 'error', title: t('journal.sync_failed'), description: res.error })
    } else if (res.added > 0 || res.updated > 0) {
      const parts = []
      if (res.added > 0)   parts.push(t('journal.sync_new',     { count: res.added }))
      if (res.updated > 0) parts.push(t('journal.sync_updated', { count: res.updated }))
      showToast({ type: 'info', title: t('journal.sync_done'), description: t('journal.sync_x_from_mt5', { parts: parts.join(' · ') }) })
    } else {
      showToast({ type: 'info', title: t('journal.sync_already_up_to_date'), description: t('journal.sync_x_in_backend', { count: res.histCount }) })
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleSelectGroup(ids, select) {
    setSelectedIds(prev => {
      const n = new Set(prev)
      ids.forEach(id => select ? n.add(id) : n.delete(id))
      return n
    })
  }
  function clearSelection() { setSelectedIds(new Set()) }

  function handleDeleteTrade(trade) {
    const snapshot = [trade]
    deleteTrade(trade.id)
    setSelectedIds(prev => { const n = new Set(prev); n.delete(trade.id); return n })
    showToast({
      type: 'undo',
      title: t('journal.trade_deleted'),
      description: `${trade.symbol} ${trade.type} ${trade.volume}`,
      duration: 6000,
      action: { label: t('journal.undo'), onClick: () => restoreTrades(snapshot) },
    })
  }

  function handleBulkDelete() {
    const ids = [...selectedIds]
    if (!ids.length) return
    const snapshot = trades.filter(tr => selectedIds.has(tr.id))
    deleteTrades(ids)
    clearSelection()
    showToast({
      type: 'undo',
      title: t('journal.trades_deleted', { count: snapshot.length }),
      description: t('journal.undo_hint'),
      duration: 8000,
      action: { label: t('journal.undo'), onClick: () => restoreTrades(snapshot) },
    })
  }

  const [selectedTrade, setSelectedTrade] = useState(null)
  const [showAddModal, setShowAddModal]   = useState(false)

  // Kategorie-Filter
  const [activeCat, setActiveCat] = useState('alle')
  const [activeSym, setActiveSym] = useState(null)

  // Erweiterte Filter
  const [search, setSearch]           = useState('')
  const [filterType, setFilterType]   = useState('ALL')
  const [filterTag, setFilterTag]     = useState('ALL')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')
  const [sort, setSort]               = useState({ field: 'closeTime', dir: 'desc' })
  const [showFilters, setShowFilters] = useState(false)

  // Gruppen: welche sind aufgeklappt
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  // Drag & Drop State
  const [dragSrcIds, setDragSrcIds]     = useState(null)   // tradeIds being dragged
  const [dragOverKey, setDragOverKey]   = useState(null)   // group key being hovered

  function handleSort(field) {
    setSort(prev => ({ field, dir: prev.field === field && prev.dir === 'asc' ? 'desc' : 'asc' }))
  }

  // Gefilterte Einzel-Trades
  const filtered = useMemo(() => {
    let result = [...trades]
    if (activeSym)           result = result.filter(t => t.symbol === activeSym)
    else if (activeCat !== 'alle') result = result.filter(t => getSymbolCategory(t.symbol) === activeCat)
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(s) ||
        (t.notes || '').toLowerCase().includes(s) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(s))
      )
    }
    if (filterType !== 'ALL') result = result.filter(t => t.type === filterType)
    if (filterTag !== 'ALL')  result = result.filter(t => (t.tags || []).includes(filterTag))
    if (dateFrom)             result = result.filter(t => t.closeTime >= dateFrom)
    if (dateTo)               result = result.filter(t => t.closeTime <= dateTo + 'T23:59:59')
    return result
  }, [trades, activeCat, activeSym, search, filterType, filterTag, dateFrom, dateTo])

  // Gruppierte Anzeige
  const groups = useMemo(() =>
    buildTradeGroups(filtered, manualGroups),
    [filtered, manualGroups]
  )

  // Sortierung auf Gruppen anwenden
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      let av = a.stats[sort.field] ?? (sort.field === 'profit' ? a.stats.totalPnl : null)
      let bv = b.stats[sort.field] ?? (sort.field === 'profit' ? b.stats.totalPnl : null)
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av == null) av = ''
      if (bv == null) bv = ''
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [groups, sort])

  // Summary
  const totalPnl   = filtered.reduce((s, t) => s + t.profit + (t.commission || 0) + (t.swap || 0), 0)
  const wins       = filtered.filter(t => t.profit > 0).length
  const wr         = filtered.length ? (wins / filtered.length * 100).toFixed(1) : '0.0'
  const groupCount = groups.filter(g => !g.isSingle).length

  const isFiltered = activeCat !== 'alle' || activeSym || filterType !== 'ALL' || filterTag !== 'ALL' || dateFrom || dateTo || search
  const hasAdvancedFilters = filterType !== 'ALL' || filterTag !== 'ALL' || dateFrom || dateTo

  function clearFilters() {
    setFilterType('ALL'); setFilterTag('ALL')
    setDateFrom(''); setDateTo('')
  }

  function toggleExpand(key) {
    setExpandedGroups(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  // ── Drag & Drop ──────────────────────────────────────────────
  function getDragHandlers(group) {
    return {
      draggable: true,
      onDragStart: (e) => {
        setDragSrcIds(group.stats.tradeIds)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', group.stats.tradeIds.join(','))
      },
      onDragEnd: () => { setDragSrcIds(null); setDragOverKey(null) },
      onDragOver: (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (group.key !== dragOverKey) setDragOverKey(group.key)
      },
      onDragLeave: () => setDragOverKey(null),
      onDrop: (e) => {
        e.preventDefault()
        const srcIds = e.dataTransfer.getData('text/plain').split(',')
        const dstIds = group.stats.tradeIds
        // Nicht auf sich selbst droppen
        if (srcIds.join(',') !== dstIds.join(',')) {
          createManualGroup([...new Set([...srcIds, ...dstIds])])
        }
        setDragSrcIds(null)
        setDragOverKey(null)
      },
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{t('journal.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isFiltered
              ? <>{t('journal.x_of_y_filtered', { shown: filtered.length, total: trades.length })}</>
              : <>{trades.length} {t('common.trades')}</>
            }
            {groupCount > 0 && (
              <span className="ml-2 text-[#3b82f6]">
                · {t(groupCount === 1 ? 'live.groups' : 'live.groups_plural', { count: groupCount })} {t('journal.groups_detected')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {liveStatus?.apiReachable && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2d3748] bg-[#131c2e]
                text-slate-300 hover:border-[#10b981]/40 hover:text-[#10b981] transition-colors
                text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              title={t('journal.sync')}
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? t('journal.syncing') : t('journal.sync')}
            </button>
          )}
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus size={15} /> {t('journal.add_trade')}
          </button>
        </div>
      </div>

      {/* Bulk-Action-Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#10b981]/10 border border-[#10b981]/30 rounded-xl fade-in">
          <span className="text-sm font-semibold text-[#10b981]">
            {t('journal.selected', { count: selectedIds.size })}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={clearSelection}
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
            >
              {t('journal.deselect')}
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ef4444]/15 text-[#ef4444]
                border border-[#ef4444]/30 text-xs font-semibold hover:bg-[#ef4444]/25 transition-colors"
            >
              <Trash2 size={12} /> {t('journal.bulk_delete')}
            </button>
          </div>
        </div>
      )}

      {/* Kategorie-Filter */}
      <CatFilterBar
        trades={trades}
        activeCat={activeCat} setActiveCat={setActiveCat}
        activeSym={activeSym} setActiveSym={setActiveSym}
      />

      {/* Summary */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: t('common.trades'),        value: filtered.length, color: 'text-slate-300' },
          { label: t('common.win_rate'),      value: wr + '%',        color: parseFloat(wr) >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]' },
          { label: t('common.pnl'),           value: <Pvt value={totalPnl} />,
                                              color: totalPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]' },
          { label: t('journal.groups'),       value: groupCount,      color: 'text-[#3b82f6]' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#111827] border border-[#1f2937] rounded-lg px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-slate-500">{label}</span>
            <span className={`text-sm font-mono font-bold ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('journal.search_placeholder')}
            className="input pl-8 w-full" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={14} />
            </button>
          )}
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary gap-2 ${hasAdvancedFilters ? 'border-[#10b981]/40 text-[#10b981]' : ''}`}>
          <Filter size={14} /> {t('journal.more_filters')}
          {hasAdvancedFilters && <span className="bg-[#10b981] text-white text-[10px] px-1.5 rounded-full">●</span>}
        </button>
        {hasAdvancedFilters && (
          <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
            <X size={12} /> {t('common.reset')}
          </button>
        )}
      </div>

      {/* Erweiterter Filter */}
      {showFilters && (
        <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 fade-in">
          <div>
            <label className="text-xs text-slate-500 block mb-1">{t('common.type')}</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="select w-full text-xs">
              <option value="ALL">{t('common.all')}</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">{t('common.tag')}</label>
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)} className="select w-full text-xs">
              <option value="ALL">{t('journal.tag_all')}</option>
              {allTags.map(tag => <option key={tag.name} value={tag.name}>{tag.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">{t('common.from')}</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input w-full text-xs" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">{t('common.to')}</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input w-full text-xs" />
          </div>
        </div>
      )}

      {/* Drag-Hinweis */}
      {groupCount === 0 && filtered.length > 1 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border border-[#1f2937] rounded-lg text-xs text-slate-500">
          <Link size={12} />
          <span>{t('journal.drag_hint')}</span>
        </div>
      )}

      {/* Tabelle */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1f2937]">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={sortedGroups.length > 0 && sortedGroups.every(g => g.trades.every(t => selectedIds.has(t.id)))}
                    ref={el => {
                      if (!el) return
                      const allIds = sortedGroups.flatMap(g => g.trades.map(t => t.id))
                      const sel = allIds.filter(id => selectedIds.has(id)).length
                      el.indeterminate = sel > 0 && sel < allIds.length
                    }}
                    onChange={(e) => {
                      const allIds = sortedGroups.flatMap(g => g.trades.map(t => t.id))
                      toggleSelectGroup(allIds, e.target.checked)
                    }}
                    className="accent-[#10b981] cursor-pointer"
                    title={t('journal.select_all')}
                  />
                </th>
                <th className="px-4 py-3 w-10" />
                <ColHeader label={t('common.date')}              field="closeTime"  sort={sort} onSort={handleSort} />
                <ColHeader label={t('common.symbol')}            field="symbol"     sort={sort} onSort={handleSort} />
                <ColHeader label={t('common.type')}              field="type"       sort={sort} onSort={handleSort} />
                <ColHeader label={t('common.volume')}            field="volume"     sort={sort} onSort={handleSort} />
                <ColHeader label={t('journal.col_avg_entry')}    field="openPrice"  sort={sort} onSort={handleSort} />
                <ColHeader label={t('journal.col_avg_exit')}     field="closePrice" sort={sort} onSort={handleSort} />
                <ColHeader label={t('common.pnl')}               field="profit"     sort={sort} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium">{t('common.tags')}</th>
                <th className="px-4 py-3 text-left text-xs text-slate-500 font-medium w-16" />
              </tr>
            </thead>
            <tbody>
              {sortedGroups.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-600">{t('common.no_trades_found')}</td>
                </tr>
              ) : (
                sortedGroups.map(group => (
                  <GroupRow
                    key={group.key}
                    group={group}
                    isExpanded={expandedGroups.has(group.key)}
                    onToggle={() => toggleExpand(group.key)}
                    onSelectTrade={setSelectedTrade}
                    getTagStyle={getTagStyle}
                    isDragOver={dragOverKey === group.key && dragSrcIds?.join(',') !== group.stats.tradeIds.join(',')}
                    dragHandlers={getDragHandlers(group)}
                    toggleNoAutoGroup={toggleNoAutoGroup}
                    dissolveManualGroup={dissolveManualGroup}
                    removeFromManualGroup={removeFromManualGroup}
                    onDelete={handleDeleteTrade}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectGroup={toggleSelectGroup}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {selectedTrade && (
        <TradeDetailModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
      )}
      {showAddModal && (
        <AddTradeModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  )
}
