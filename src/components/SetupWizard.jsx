import { useState, useEffect, useMemo } from 'react'
import {
  Download, CheckCircle2, AlertCircle, Loader2, MonitorSmartphone,
  Activity, ExternalLink, ChevronRight, X, Info, ShieldCheck, MousePointerClick,
  Globe,
} from 'lucide-react'
import { useBackendStatus } from '../hooks/useBackendStatus'
import { useLanguage } from '../hooks/useLanguage'

const CONNECTOR_DOWNLOAD_URL =
  'https://github.com/andribunte9-tech/Tradestats/releases/latest'
const CONNECTOR_REPO_URL =
  'https://github.com/andribunte9-tech/Tradestats'

export function SetupGate({ children }) {
  const status = useBackendStatus()
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('tradestats_setup_dismissed') === '1'
  })
  const { t } = useLanguage()

  function dismiss() {
    sessionStorage.setItem('tradestats_setup_dismissed', '1')
    setDismissed(true)
  }

  if (status.state === 'connected' || dismissed) {
    return (
      <>
        {children}
        {(status.state === 'offline' || status.state === 'backend_only') && (
          <ConnectorStatusBadge status={status} onShow={() => {
            sessionStorage.removeItem('tradestats_setup_dismissed')
            setDismissed(false)
          }} />
        )}
      </>
    )
  }

  if (status.state === 'unknown' || status.state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">{t('setup.checking')}</span>
        </div>
      </div>
    )
  }

  return <SetupWizard status={status} onDismiss={dismiss} />
}

function LanguageToggle() {
  const { language, setLanguage } = useLanguage()
  return (
    <div className="inline-flex items-center gap-0.5 bg-[#1a2233] border border-[#2d3748] rounded-lg p-0.5">
      <Globe size={11} className="text-slate-500 ml-1.5" />
      {['de', 'en'].map(lng => (
        <button
          key={lng}
          onClick={() => setLanguage(lng)}
          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase transition-colors
            ${language === lng
              ? 'bg-[#3b82f6]/15 text-[#3b82f6]'
              : 'text-slate-500 hover:text-slate-300'}`}
        >
          {lng}
        </button>
      ))}
    </div>
  )
}

function SetupWizard({ status, onDismiss }) {
  const { t } = useLanguage()
  const [installerClicked, setInstallerClicked] = useState(false)

  const steps = useMemo(() => {
    const installed = status.state !== 'offline'
    const connected = status.state === 'connected'
    const mt5Open   = status.state === 'connected'
    return [
      {
        id: 'download',
        title: t('setup.step1.title'),
        body: t('setup.step1.body'),
        done: installerClicked || installed,
        action: (
          <a
            href={CONNECTOR_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setInstallerClicked(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb]
              text-white text-sm font-semibold transition-colors"
          >
            <Download size={15} /> {t('setup.step1.action')}
            <ExternalLink size={12} className="opacity-60" />
          </a>
        ),
      },
      {
        id: 'install',
        title: t('setup.step2.title'),
        body: t('setup.step2.body'),
        done: installed,
        extraContent: <SmartScreenHint />,
      },
      {
        id: 'mt5',
        title: t('setup.step3.title'),
        body: t('setup.step3.body'),
        done: installed && mt5Open,
        hint: t('setup.step3.hint'),
      },
      {
        id: 'connect',
        title: t('setup.step4.title'),
        body: installed ? t('setup.step4.body_done') : t('setup.step4.body'),
        done: connected,
        hint: connected ? null : t('setup.step4.hint'),
      },
    ]
  }, [status.state, installerClicked, t])

  const currentStepIdx = steps.findIndex(s => !s.done)
  const isFullyConnected = status.state === 'connected'

  useEffect(() => {
    if (isFullyConnected) {
      const tt = setTimeout(() => onDismiss(), 1800)
      return () => clearTimeout(tt)
    }
  }, [isFullyConnected, onDismiss])

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6 relative">
      {/* Language toggle in der Ecke */}
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-[#3b82f6]/15 border border-[#3b82f6]/30 mb-4">
            <MonitorSmartphone size={28} className="text-[#3b82f6]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{t('setup.welcome')}</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            {t('setup.welcome_subtitle')}
          </p>
        </div>

        {isFullyConnected ? (
          <div className="rounded-2xl border border-[#10b981]/40 bg-[#10b981]/10 p-6 text-center">
            <div className="inline-flex p-3 rounded-full bg-[#10b981]/20 mb-3">
              <CheckCircle2 size={32} className="text-[#10b981]" />
            </div>
            <h2 className="text-lg font-semibold text-[#10b981] mb-1">{t('setup.success.title')}</h2>
            <p className="text-sm text-slate-300">{t('setup.success.body')}</p>
          </div>
        ) : (
          <>
            <StatusBanner status={status} />

            <div className="space-y-2.5 mt-6">
              {steps.map((step, idx) => (
                <StepCard
                  key={step.id}
                  index={idx + 1}
                  step={step}
                  isActive={idx === currentStepIdx}
                  isLastDone={idx < currentStepIdx}
                />
              ))}
            </div>

            {currentStepIdx === 0 && (
              <div className="mt-6 text-center">
                {steps[0].action}
              </div>
            )}

            {currentStepIdx > 0 && currentStepIdx < steps.length && (
              <div className="mt-6 rounded-xl border border-[#1f2937] bg-[#1a2233] p-4 flex items-center gap-3">
                <Loader2 size={16} className="text-[#3b82f6] animate-spin shrink-0" />
                <div className="text-[12px] text-slate-400 leading-relaxed">
                  {t('setup.waiting_hint')}
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between text-xs gap-3 flex-wrap">
              <a
                href={CONNECTOR_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300 inline-flex items-center gap-1"
              >
                <Info size={11} /> {t('setup.about_connector')} <ExternalLink size={10} />
              </a>
              <button
                onClick={onDismiss}
                className="text-slate-500 hover:text-slate-300 inline-flex items-center gap-1"
              >
                {t('setup.skip_csv')} <ChevronRight size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatusBanner({ status }) {
  const { t } = useLanguage()
  const config = {
    offline: {
      color: '#ef4444',
      icon: AlertCircle,
      title: t('setup.banner.offline.title'),
      body: t('setup.banner.offline.body', { url: status.apiUrl }),
    },
    backend_only: {
      color: '#f59e0b',
      icon: AlertCircle,
      title: t('setup.banner.backend_only.title'),
      body: status.error || t('setup.banner.backend_only.body'),
    },
  }[status.state] || {
    color: '#3b82f6',
    icon: Activity,
    title: t('setup.banner.checking.title'),
    body: '',
  }
  const Icon = config.icon
  return (
    <div
      className="rounded-xl border p-4 flex items-start gap-3"
      style={{ backgroundColor: config.color + '12', borderColor: config.color + '40' }}
    >
      <Icon size={18} className="shrink-0 mt-0.5" style={{ color: config.color }} />
      <div className="min-w-0">
        <p className="text-sm font-semibold mb-0.5" style={{ color: config.color }}>{config.title}</p>
        <p className="text-[12px] text-slate-300 leading-relaxed">{config.body}</p>
      </div>
    </div>
  )
}

function StepCard({ index, step, isActive, isLastDone }) {
  const color = step.done ? '#10b981' : isActive ? '#3b82f6' : '#475569'
  return (
    <div
      className="rounded-xl border p-4 transition-colors"
      style={{
        borderColor: color + (isActive ? '60' : '30'),
        backgroundColor: isActive ? color + '08' : '#0d1117',
        opacity: isLastDone || step.done ? 1 : isActive ? 1 : 0.6,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{
            backgroundColor: step.done ? color + '20' : color + '15',
            color,
          }}
        >
          {step.done ? <CheckCircle2 size={16} /> : index}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-200">{step.title}</p>
          <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">{step.body}</p>
          {step.hint && isActive && (
            <p className="text-[11px] text-slate-500 mt-2 italic">💡 {step.hint}</p>
          )}
          {step.extraContent && isActive && (
            <div className="mt-3">{step.extraContent}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function SmartScreenHint() {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-xl border border-[#3b82f6]/30 bg-[#3b82f6]/8 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left
          hover:bg-[#3b82f6]/12 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck size={14} className="text-[#3b82f6] shrink-0" />
          <span className="text-[12px] font-semibold text-[#3b82f6]">
            {t('setup.ss.toggle')}
          </span>
        </div>
        <ChevronRight
          size={14}
          className={`text-[#3b82f6] shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {/* explain uses inline placeholders for bold sub-elements */}
            {t('setup.ss.explain')
              .split('{dfdr}').join('§DFDR§')
              .split('{github}').join('§GH§')
              .split(/(§DFDR§|§GH§)/)
              .map((chunk, i) => {
                if (chunk === '§DFDR§') return <strong key={i} className="text-slate-300">{t('setup.ss.defender')}</strong>
                if (chunk === '§GH§') return <strong key={i} className="text-slate-300">{t('setup.ss.github_open')}</strong>
                return <span key={i}>{chunk}</span>
              })}
          </p>

          <div className="rounded-lg overflow-hidden border border-[#1f2937]">
            <div className="bg-[#0078D4] px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-white">{t('setup.ss.defender')}</span>
              <X size={11} className="text-white/60" />
            </div>
            <div className="bg-[#1a2233] px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] font-bold text-white">{t('setup.ss.protected_title')}</p>
              <p className="text-[10px] text-slate-400 leading-relaxed">{t('setup.ss.body1')}</p>
              <div className="flex items-center gap-1.5 pt-1">
                <MousePointerClick size={11} className="text-[#10b981] shrink-0 animate-pulse" />
                <span className="text-[10px] text-[#10b981] font-semibold underline">
                  {t('setup.ss.more_info')}
                </span>
                <span className="text-[10px] text-slate-500">{t('setup.ss.click_1')}</span>
              </div>
              <div className="flex justify-end pt-1">
                <span className="text-[10px] text-slate-600 px-2 py-1 border border-[#374151] rounded">
                  {t('setup.ss.dont_run')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <div className="flex-1 h-px bg-[#1f2937]" />
            <span>{t('setup.ss.between')}</span>
            <div className="flex-1 h-px bg-[#1f2937]" />
          </div>

          <div className="rounded-lg overflow-hidden border border-[#1f2937]">
            <div className="bg-[#0078D4] px-3 py-2">
              <span className="text-[10px] font-semibold text-white">{t('setup.ss.defender')}</span>
            </div>
            <div className="bg-[#1a2233] px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] font-bold text-white">{t('setup.ss.protected_title')}</p>
              <p className="text-[10px] text-slate-400">
                {t('setup.ss.app_label')} <span className="text-slate-300 font-mono">TradeStats_Setup.exe</span>
              </p>
              <div className="flex justify-end gap-1.5 pt-2">
                <div className="flex items-center gap-1.5">
                  <MousePointerClick size={11} className="text-[#10b981] shrink-0 animate-pulse" />
                  <span className="text-[10px] text-slate-500">{t('setup.ss.click_2')}</span>
                </div>
                <span className="text-[10px] text-white px-2 py-1 bg-[#10b981] rounded font-semibold">
                  {t('setup.ss.run_anyway')}
                </span>
                <span className="text-[10px] text-slate-600 px-2 py-1 border border-[#374151] rounded">
                  {t('setup.ss.dont_run')}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 italic pt-1">
            {t('setup.ss.footer')}
          </p>
        </div>
      )}
    </div>
  )
}

function ConnectorStatusBadge({ status, onShow }) {
  const { t } = useLanguage()
  const config = {
    offline:      { color: '#ef4444', label: t('setup.badge.offline') },
    backend_only: { color: '#f59e0b', label: t('setup.badge.mt5_off') },
  }[status.state]
  if (!config) return null
  return (
    <button
      onClick={onShow}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full
        bg-[#1a2233] border shadow-lg text-xs font-medium hover:scale-105 transition-transform"
      style={{ borderColor: config.color + '60', color: config.color }}
      title={t('setup.badge.show_tooltip')}
    >
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: config.color }} />
      {config.label}
    </button>
  )
}
