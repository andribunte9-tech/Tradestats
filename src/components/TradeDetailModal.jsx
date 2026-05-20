import { useState, useEffect } from 'react'
import { X, Save, Trash2, Plus, Clock, TrendingUp, TrendingDown, Bug } from 'lucide-react'
import { useTrades } from '../hooks/useTrades'
import { useSetups } from '../hooks/useSetups'
import { useLanguage } from '../hooks/useLanguage'
import { format, differenceInMinutes } from 'date-fns'
import { formatDuration } from '../utils/calculations'
import { MISTAKE_CATEGORIES } from '../utils/analytics'

export default function TradeDetailModal({ trade, onClose }) {
  const { updateTrade, deleteTrade, allTags, addCustomTag, getTagStyle } = useTrades()
  const { setups } = useSetups()
  const { t } = useLanguage()
  const [notes, setNotes]     = useState(trade.notes || '')
  const [tags, setTags]       = useState(trade.tags || [])
  const [mistakes, setMistakes] = useState(trade.mistakes || [])
  const [setupId, setSetupId] = useState(trade.setupId || '')
  const [newTag, setNewTag]   = useState('')
  const [saved, setSaved]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const duration = trade.openTime && trade.closeTime
    ? differenceInMinutes(new Date(trade.closeTime), new Date(trade.openTime))
    : null

  function handleSave() {
    updateTrade(trade.id, { notes, tags, mistakes, setupId: setupId || null })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function toggleMistake(id) {
    setMistakes(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    )
  }

  function toggleTag(tagName) {
    setTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    )
  }

  function handleAddCustomTag() {
    const name = newTag.trim()
    if (!name) return
    addCustomTag(name)
    if (!tags.includes(name)) setTags(prev => [...prev, name])
    setNewTag('')
  }

  function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    deleteTrade(trade.id)
    onClose()
  }

  const netPnl = trade.profit + (trade.commission || 0) + (trade.swap || 0)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-2xl fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937]">
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
              trade.type === 'BUY' ? 'bg-[#10b981]/15 text-[#10b981]' : 'bg-[#ef4444]/15 text-[#ef4444]'
            }`}>{trade.type}</span>
            <h2 className="text-white font-bold text-lg font-mono">{trade.symbol}</h2>
            <span className={`text-base font-mono font-bold ${netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
              {netPnl >= 0 ? '+' : ''}{netPnl.toFixed(2)}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Trade Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: t('modal.opening'),     value: trade.openPrice?.toFixed(5)  },
              { label: t('modal.closing'),     value: trade.closePrice?.toFixed(5) },
              { label: t('common.volume'),     value: trade.volume + ' ' + t('modal.lot') },
              { label: t('common.duration'),   value: duration != null ? formatDuration(duration) : '—' },
              { label: t('modal.stop_loss'),   value: trade.sl ? trade.sl.toFixed(5) : '—' },
              { label: t('modal.take_profit'), value: trade.tp ? trade.tp.toFixed(5) : '—' },
              { label: t('modal.commission'),  value: (trade.commission || 0).toFixed(2)   },
              { label: t('modal.swap'),        value: (trade.swap || 0).toFixed(2)         },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#0d1117] rounded-lg p-3">
                <div className="text-xs text-slate-500 mb-1">{label}</div>
                <div className="text-sm font-mono font-medium text-slate-200">{value}</div>
              </div>
            ))}
          </div>

          {/* P&L Breakdown */}
          <div className="bg-[#0d1117] rounded-lg p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-500">{t('modal.gross_profit')}</span>
              <span className={`font-mono font-semibold ${trade.profit >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(2)}
              </span>
            </div>
            {trade.commission !== 0 && (
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-500">{t('modal.commission')}</span>
                <span className="font-mono text-[#ef4444]">{(trade.commission || 0).toFixed(2)}</span>
              </div>
            )}
            {trade.swap !== 0 && (
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-500">{t('modal.swap')}</span>
                <span className="font-mono text-slate-400">{(trade.swap || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm border-t border-[#1f2937] pt-2 mt-2">
              <span className="text-slate-300 font-medium">{t('modal.net_pnl')}</span>
              <span className={`font-mono font-bold text-base ${netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                {netPnl >= 0 ? '+' : ''}{netPnl.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Times */}
          <div className="flex gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Clock size={12} />
              <span>{t('modal.opened')}: </span>
              <span className="text-slate-300 font-mono">
                {trade.openTime ? format(new Date(trade.openTime), 'dd.MM.yyyy HH:mm') : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={12} />
              <span>{t('modal.closed')}: </span>
              <span className="text-slate-300 font-mono">
                {trade.closeTime ? format(new Date(trade.closeTime), 'dd.MM.yyyy HH:mm') : '—'}
              </span>
            </div>
          </div>

          {/* Setup */}
          {setups.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-2">{t('modal.setup_label')}</label>
              <select value={setupId} onChange={e => setSetupId(e.target.value)} className="select w-full text-sm">
                <option value="">{t('modal.no_setup')}</option>
                {setups.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({t('modal.setup_target_rr')} {s.targetRR})</option>
                ))}
              </select>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-2">{t('common.tags')}</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {allTags.map(tag => {
                const active = tags.includes(tag.name)
                return (
                  <button
                    key={tag.name}
                    onClick={() => toggleTag(tag.name)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all border"
                    style={{
                      backgroundColor: active ? tag.bg : 'transparent',
                      color:           active ? tag.color : '#6b7280',
                      borderColor:     active ? tag.color + '50' : '#374151',
                    }}
                  >
                    {tag.name}
                  </button>
                )
              })}
            </div>
            {/* Add custom tag */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCustomTag()}
                placeholder={t('modal.new_tag')}
                className="input text-xs flex-1 h-8"
              />
              <button onClick={handleAddCustomTag} className="btn-secondary h-8 px-3 text-xs">
                <Plus size={12} /> {t('common.tag')}
              </button>
            </div>
          </div>

          {/* Mistakes */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-2 flex items-center gap-1.5">
              <Bug size={12} className="text-[#ef4444]" />
              {t('modal.mark_mistakes')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MISTAKE_CATEGORIES.map(m => {
                const active = mistakes.includes(m.id)
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMistake(m.id)}
                    className="px-2 py-1 rounded-md text-[11px] font-medium transition-all border flex items-center gap-1"
                    style={{
                      backgroundColor: active ? m.color + '20' : 'transparent',
                      color:           active ? m.color : '#6b7280',
                      borderColor:     active ? m.color + '60' : '#374151',
                    }}
                  >
                    <span>{m.emoji}</span>
                    {m.label}
                  </button>
                )
              })}
            </div>
            {mistakes.length > 0 && (
              <p className="text-[10px] text-slate-600 mt-2">
                {t('modal.mistakes_hint')}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-2">{t('common.notes')}</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('modal.notes_placeholder')}
              rows={4}
              className="input w-full resize-none text-sm leading-relaxed"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleDelete}
              className={`btn-danger text-xs transition-all ${confirmDel ? 'ring-1 ring-[#ef4444]' : ''}`}
            >
              <Trash2 size={13} />
              {confirmDel ? t('common.confirm_q') : t('journal.delete_trade')}
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary text-xs">{t('common.cancel')}</button>
              <button onClick={handleSave} className="btn-primary text-xs">
                <Save size={13} />
                {saved ? `${t('common.saved')} ✓` : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
