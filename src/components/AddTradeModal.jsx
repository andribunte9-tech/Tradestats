import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useTrades } from '../hooks/useTrades'

const EMPTY = {
  symbol: '', type: 'BUY', volume: '', openPrice: '', closePrice: '',
  openTime: '', closeTime: '', sl: '', tp: '', commission: '', swap: '', profit: '',
}

export default function AddTradeModal({ onClose }) {
  const { addTrade } = useTrades()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.symbol.trim())  e.symbol = 'Pflichtfeld'
    if (!form.profit)         e.profit = 'Pflichtfeld'
    if (!form.openPrice)      e.openPrice = 'Pflichtfeld'
    if (!form.closePrice)     e.closePrice = 'Pflichtfeld'
    return e
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    addTrade({
      symbol:     form.symbol.toUpperCase().trim(),
      type:       form.type,
      volume:     parseFloat(form.volume) || 0,
      openPrice:  parseFloat(form.openPrice) || 0,
      closePrice: parseFloat(form.closePrice) || 0,
      openTime:   form.openTime ? new Date(form.openTime).toISOString() : new Date().toISOString(),
      closeTime:  form.closeTime ? new Date(form.closeTime).toISOString() : new Date().toISOString(),
      sl:         parseFloat(form.sl) || 0,
      tp:         parseFloat(form.tp) || 0,
      commission: parseFloat(form.commission) || 0,
      swap:       parseFloat(form.swap) || 0,
      profit:     parseFloat(form.profit) || 0,
      notes:      '',
      tags:       [],
    })
    onClose()
  }

  const Field = ({ label, field, type = 'text', required, placeholder, half }) => (
    <div className={half ? 'col-span-1' : 'col-span-2'}>
      <label className="text-xs font-medium text-slate-400 block mb-1">
        {label}{required && <span className="text-[#ef4444] ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={form[field]}
        onChange={e => set(field, e.target.value)}
        placeholder={placeholder}
        className={`input w-full ${errors[field] ? 'border-[#ef4444]' : ''}`}
      />
      {errors[field] && <p className="text-[10px] text-[#ef4444] mt-0.5">{errors[field]}</p>}
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content max-w-lg fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937]">
          <h2 className="text-white font-bold text-base">Trade manuell hinzufügen</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-2 gap-3">
            {/* Symbol */}
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Symbol<span className="text-[#ef4444] ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={form.symbol}
                onChange={e => set('symbol', e.target.value)}
                placeholder="EURUSD"
                className={`input w-full uppercase ${errors.symbol ? 'border-[#ef4444]' : ''}`}
              />
            </div>

            {/* Type */}
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-400 block mb-1">Typ</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className="select w-full">
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>

            <Field label="Volumen (Lot)" field="volume" type="number" placeholder="0.1" half />
            <Field label="Profit *"      field="profit" type="number" placeholder="±100.00" half required />
            <Field label="Open Price *"  field="openPrice" type="number" placeholder="1.08500" half required />
            <Field label="Close Price *" field="closePrice" type="number" placeholder="1.09000" half required />

            {/* Datetime fields */}
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-400 block mb-1">Open Time</label>
              <input type="datetime-local" value={form.openTime} onChange={e => set('openTime', e.target.value)} className="input w-full" />
            </div>
            <div className="col-span-1">
              <label className="text-xs font-medium text-slate-400 block mb-1">Close Time</label>
              <input type="datetime-local" value={form.closeTime} onChange={e => set('closeTime', e.target.value)} className="input w-full" />
            </div>

            <Field label="Stop Loss"   field="sl"         type="number" placeholder="1.08000" half />
            <Field label="Take Profit" field="tp"         type="number" placeholder="1.09500" half />
            <Field label="Kommission"  field="commission" type="number" placeholder="-3.50"   half />
            <Field label="Swap"        field="swap"       type="number" placeholder="0"       half />
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button type="button" onClick={onClose} className="btn-secondary">Abbrechen</button>
            <button type="submit" className="btn-primary">
              <Plus size={14} /> Trade hinzufügen
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
