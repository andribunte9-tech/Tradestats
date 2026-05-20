import { useState, useMemo } from 'react'
import { BookOpen, Plus, Edit2, Trash2, X, Check, Save, TrendingUp, Target, Shield } from 'lucide-react'
import { useSetups } from '../hooks/useSetups'
import { useTrades } from '../hooks/useTrades'
import { useLanguage } from '../hooks/useLanguage'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

const netPnl = (t) => (t.profit || 0) + (t.commission || 0) + (t.swap || 0)

function SetupEditor({ existing, onSave, onCancel }) {
  const { t } = useLanguage()
  const [name, setName]         = useState(existing?.name || '')
  const [description, setDesc]  = useState(existing?.description || '')
  const [entryRules, setEntry]  = useState(existing?.entryRules || [''])
  const [exitRules, setExit]    = useState(existing?.exitRules || [''])
  const [targetRR, setTargetRR] = useState(existing?.targetRR ?? 2)
  const [maxRiskPct, setRisk]   = useState(existing?.maxRiskPct ?? 1)
  const [color, setColor]       = useState(existing?.color || COLORS[0])

  function updateList(list, setList, idx, value) {
    const copy = [...list]
    copy[idx] = value
    setList(copy)
  }
  function addRule(list, setList) { setList([...list, '']) }
  function removeRule(list, setList, idx) { setList(list.filter((_, i) => i !== idx)) }

  function handleSubmit() {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      description: description.trim(),
      entryRules: entryRules.filter(r => r.trim()),
      exitRules:  exitRules.filter(r => r.trim()),
      targetRR: Number(targetRR),
      maxRiskPct: Number(maxRiskPct),
      color,
    })
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">
          {existing ? t('setups.edit_setup') : t('setups.new_setup')}
        </h3>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-300">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">{t('setups.field_name')} *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="London Breakout" className="input w-full text-sm" />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">{t('setups.field_color')}</label>
          <div className="flex gap-1.5 items-center h-9">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? 'scale-110 border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="text-[11px] text-slate-500 block mb-1">{t('setups.field_description')}</label>
        <textarea value={description} onChange={e => setDesc(e.target.value)}
          placeholder={t('setups.desc_placeholder')}
          rows={2}
          className="input w-full text-sm resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">{t('setups.field_target_rr')}</label>
          <input type="number" step="0.5" value={targetRR} onChange={e => setTargetRR(e.target.value)} className="input w-full text-sm" />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">{t('setups.field_max_risk')}</label>
          <input type="number" step="0.1" value={maxRiskPct} onChange={e => setRisk(e.target.value)} className="input w-full text-sm" />
        </div>
      </div>

      <RuleList title={t('setups.entry_rules')} rules={entryRules} setRules={setEntry}
        onUpdate={(i, v) => updateList(entryRules, setEntry, i, v)}
        onAdd={() => addRule(entryRules, setEntry)}
        onRemove={(i) => removeRule(entryRules, setEntry, i)}
        placeholder={t('setups.entry_placeholder')} />

      <RuleList title={t('setups.exit_rules')} rules={exitRules} setRules={setExit}
        onUpdate={(i, v) => updateList(exitRules, setExit, i, v)}
        onAdd={() => addRule(exitRules, setExit)}
        onRemove={(i) => removeRule(exitRules, setExit, i)}
        placeholder={t('setups.exit_placeholder')} />

      <div className="flex justify-end gap-2 pt-2 border-t border-[#1f2937]">
        <button onClick={onCancel} className="btn-secondary text-xs">{t('common.cancel')}</button>
        <button onClick={handleSubmit} className="btn-primary text-xs">
          <Save size={13} /> {existing ? t('common.save') : t('setups.create')}
        </button>
      </div>
    </div>
  )
}

function RuleList({ title, rules, onUpdate, onAdd, onRemove, placeholder }) {
  const { t } = useLanguage()
  return (
    <div>
      <label className="text-[11px] text-slate-500 block mb-1.5">{title}</label>
      <div className="space-y-1.5">
        {rules.map((r, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-[10px] font-mono text-slate-600 w-4">{i + 1}.</span>
            <input value={r} onChange={e => onUpdate(i, e.target.value)} placeholder={placeholder} className="input flex-1 text-xs" />
            <button onClick={() => onRemove(i)} className="text-slate-600 hover:text-[#ef4444]">
              <X size={13} />
            </button>
          </div>
        ))}
        <button onClick={onAdd} className="text-xs text-[#3b82f6] hover:text-[#60a5fa] flex items-center gap-1">
          <Plus size={11} /> {t('setups.add_rule')}
        </button>
      </div>
    </div>
  )
}

function SetupCard({ setup, stats, onEdit, onDelete }) {
  const { t } = useLanguage()
  const winRate = stats.count > 0 ? (stats.wins / stats.count) * 100 : 0
  const pnlColor = stats.pnl >= 0 ? '#10b981' : '#ef4444'
  return (
    <div className="card p-5 space-y-3" style={{ borderColor: setup.color + '30' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: setup.color }} />
            <h3 className="text-sm font-semibold text-slate-200 truncate">{setup.name}</h3>
          </div>
          {setup.description && (
            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{setup.description}</p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-[#1f2937] text-slate-500 hover:text-slate-300">
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-[#ef4444]/10 text-slate-500 hover:text-[#ef4444]">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Target size={11} /> {t('setups.field_target_rr')}: <span className="font-mono text-slate-300">{setup.targetRR}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <Shield size={11} /> {t('setups.risk')}: <span className="font-mono text-slate-300">{setup.maxRiskPct}%</span>
        </div>
      </div>

      {(setup.entryRules.length > 0 || setup.exitRules.length > 0) && (
        <div className="text-[10px] space-y-1">
          {setup.entryRules.length > 0 && (
            <div>
              <span className="text-slate-600 uppercase font-medium">{t('setups.entry_section')}</span>
              <ul className="mt-0.5 space-y-0.5">
                {setup.entryRules.slice(0, 3).map((r, i) => (
                  <li key={i} className="text-slate-400 pl-3">• {r}</li>
                ))}
                {setup.entryRules.length > 3 && <li className="text-slate-600 pl-3">{t('setups.more_rules', { count: setup.entryRules.length - 3 })}</li>}
              </ul>
            </div>
          )}
          {setup.exitRules.length > 0 && (
            <div>
              <span className="text-slate-600 uppercase font-medium">{t('setups.exit_section')}</span>
              <ul className="mt-0.5 space-y-0.5">
                {setup.exitRules.slice(0, 3).map((r, i) => (
                  <li key={i} className="text-slate-400 pl-3">• {r}</li>
                ))}
                {setup.exitRules.length > 3 && <li className="text-slate-600 pl-3">{t('setups.more_rules', { count: setup.exitRules.length - 3 })}</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1f2937]">
        <div>
          <div className="text-[10px] text-slate-500 uppercase">{t('common.trades')}</div>
          <div className="text-sm font-mono font-bold text-slate-200">{stats.count}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase">{t('common.win_rate')}</div>
          <div className={`text-sm font-mono font-bold ${winRate >= 50 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
            {stats.count > 0 ? winRate.toFixed(0) + '%' : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase">{t('common.pnl')}</div>
          <div className="text-sm font-mono font-bold" style={{ color: stats.count > 0 ? pnlColor : '#6b7280' }}>
            {stats.count > 0 ? (stats.pnl >= 0 ? '+' : '') + '$' + stats.pnl.toFixed(0) : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SetupLibraryPage() {
  const { setups, createSetup, updateSetup, deleteSetup } = useSetups()
  const { trades, effectiveTrades } = useTrades()
  const { t } = useLanguage()
  const [editing, setEditing]     = useState(null)
  const [showEditor, setShowEditor] = useState(false)

  // Stats per setup
  const setupStats = useMemo(() => {
    const stats = {}
    for (const s of setups) {
      const matching = effectiveTrades.filter(t => t.setupId === s.id && t.closeTime)
      const wins = matching.filter(t => netPnl(t) > 0).length
      const pnl  = matching.reduce((sum, t) => sum + netPnl(t), 0)
      stats[s.id] = { count: matching.length, wins, pnl }
    }
    return stats
  }, [setups, effectiveTrades])

  // Trades without setup assigned
  const orphans = useMemo(
    () => effectiveTrades.filter(t => t.closeTime && !t.setupId).length,
    [effectiveTrades]
  )

  function handleSaveSetup(data) {
    if (editing) {
      updateSetup(editing.id, data)
    } else {
      createSetup(data)
    }
    setEditing(null)
    setShowEditor(false)
  }

  function handleEdit(setup) {
    setEditing(setup)
    setShowEditor(true)
  }

  function handleDelete(setup) {
    if (window.confirm(t('setups.delete_confirm', { name: setup.name }))) {
      deleteSetup(setup.id)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{t('setups.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t('setups.subtitle')} · {t(setups.length === 1 ? 'setups.setups_defined' : 'setups.setups_defined_plural', { count: setups.length })}
            {orphans > 0 && (
              <> · <span className="text-[#f59e0b]">{t('setups.unassigned', { count: orphans })}</span></>
            )}
          </p>
        </div>
        {!showEditor && (
          <button
            onClick={() => { setEditing(null); setShowEditor(true) }}
            className="btn-primary"
          >
            <Plus size={15} /> {t('setups.new_setup')}
          </button>
        )}
      </div>

      {showEditor && (
        <SetupEditor
          existing={editing}
          onSave={handleSaveSetup}
          onCancel={() => { setEditing(null); setShowEditor(false) }}
        />
      )}

      {setups.length === 0 && !showEditor && (
        <div className="card p-12 text-center">
          <BookOpen size={32} className="mx-auto text-slate-700 mb-3" />
          <h3 className="text-sm font-semibold text-slate-300 mb-1">{t('setups.no_setups')}</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {t('setups.no_setups_hint')}
          </p>
        </div>
      )}

      {setups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {setups.map(s => (
            <SetupCard
              key={s.id}
              setup={s}
              stats={setupStats[s.id] || { count: 0, wins: 0, pnl: 0 }}
              onEdit={() => handleEdit(s)}
              onDelete={() => handleDelete(s)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
