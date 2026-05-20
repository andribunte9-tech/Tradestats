import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { CheckCircle, X, RotateCcw, AlertCircle } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((opts) => {
    const id = ++idRef.current
    const toast = { id, duration: 4000, type: 'info', ...opts }
    setToasts(prev => [...prev, toast])
    if (toast.duration > 0) {
      setTimeout(() => dismiss(id), toast.duration)
    }
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toasts, dismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {toasts.map(t => <ToastItem key={t.id} toast={t} dismiss={dismiss} />)}
    </div>
  )
}

function ToastItem({ toast, dismiss }) {
  const isUndo = toast.type === 'undo'
  const isError = toast.type === 'error'
  const Icon = isError ? AlertCircle : CheckCircle
  const accent = isError ? '#ef4444' : isUndo ? '#f59e0b' : '#10b981'

  return (
    <div
      className="bg-[#111827] border rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 fade-in min-w-[280px]"
      style={{ borderColor: accent + '4d' }}
    >
      <Icon size={16} style={{ color: accent }} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200">{toast.title}</p>
        {toast.description && (
          <p className="text-[11px] text-slate-500 mt-0.5">{toast.description}</p>
        )}
      </div>
      {toast.action && (
        <button
          onClick={() => { toast.action.onClick(); dismiss(toast.id) }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors"
          style={{
            color: accent,
            borderColor: accent + '4d',
            backgroundColor: accent + '15',
          }}
        >
          <RotateCcw size={11} /> {toast.action.label}
        </button>
      )}
      <button
        onClick={() => dismiss(toast.id)}
        className="text-slate-600 hover:text-slate-300 flex-shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
