import { useState, useEffect, useMemo } from 'react'
import {
  Download, CheckCircle2, AlertCircle, Loader2, MonitorSmartphone,
  Activity, ExternalLink, ChevronRight, X, Info,
} from 'lucide-react'
import { useBackendStatus } from '../hooks/useBackendStatus'

// URL des aktuellen Connector-Installers. Sobald wir das GitHub-Release
// erstellt haben, zeigt dieser Link auf die "latest"-Version. Bis dahin:
// auf die Release-Seite zum manuellen Herunterladen.
const CONNECTOR_DOWNLOAD_URL =
  'https://github.com/andribunte9-tech/Tradestats/releases/latest'
const CONNECTOR_REPO_URL =
  'https://github.com/andribunte9-tech/Tradestats'

/**
 * Hightech Setup-Wizard, der den Connector-Status erkennt und durch die
 * Installation führt. Verhält sich wie ein Modal:
 *  - state='offline'      → Vollbild-Wizard mit 4 Schritten
 *  - state='backend_only' → kompakte Fehlerbox (MT5 nicht verbunden)
 *  - state='connected'    → nicht sichtbar
 *
 * Wenn der Status während der Installation 'connected' wird, schließt
 * sich das Modal automatisch nach 2 Sekunden + zeigt einen Erfolgs-Schritt.
 */
export function SetupGate({ children }) {
  const status = useBackendStatus()
  const [dismissed, setDismissed] = useState(() => {
    // Permanent dismissable: User kann "Ohne Connector weitermachen" wählen.
    // Speicherung als Session-Storage, nicht localStorage — wenn der Browser
    // einmal geschlossen wird, fragt der Wizard wieder.
    return sessionStorage.getItem('tradestats_setup_dismissed') === '1'
  })

  function dismiss() {
    sessionStorage.setItem('tradestats_setup_dismissed', '1')
    setDismissed(true)
  }

  // Wenn alles ok ist oder User abgewinkt hat → normales UI
  if (status.state === 'connected' || dismissed) {
    return (
      <>
        {children}
        {/* Mini-Status-Badge wenn dismissed-but-offline (oben rechts in der Sidebar) */}
        {(status.state === 'offline' || status.state === 'backend_only') && (
          <ConnectorStatusBadge status={status} onShow={() => {
            sessionStorage.removeItem('tradestats_setup_dismissed')
            setDismissed(false)
          }} />
        )}
      </>
    )
  }

  // Initial-Check läuft noch → kein Wizard zeigen, App auch nicht (Splash)
  if (status.state === 'unknown' || status.state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Verbinde mit TradeStats-Connector...</span>
        </div>
      </div>
    )
  }

  return <SetupWizard status={status} onDismiss={dismiss} />
}

function SetupWizard({ status, onDismiss }) {
  const [installerClicked, setInstallerClicked] = useState(false)

  // Schritt-Logik abhängig vom aktuellen Status
  const steps = useMemo(() => {
    const installed = status.state !== 'offline'
    const connected = status.state === 'connected'
    const mt5Open   = status.state === 'connected'
    return [
      {
        id: 'download',
        title: 'Connector herunterladen',
        body: 'Lade den TradeStats-Connector herunter — ein kleines Programm, das deine MT5-Daten an diese Web-App liefert.',
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
            <Download size={15} /> Connector herunterladen
            <ExternalLink size={12} className="opacity-60" />
          </a>
        ),
      },
      {
        id: 'install',
        title: 'Installer ausführen',
        body: 'Doppelklick auf TradeStats_Setup.exe. Folge dem Setup-Assistenten — keine besonderen Optionen nötig. Dauert ca. 30 Sek.',
        done: installed,
        hint: 'Bei Windows-SmartScreen: "Weitere Informationen" → "Trotzdem ausführen". Der Installer ist nicht von Microsoft signiert (Code-Signing kostet 300+ €/Jahr).',
      },
      {
        id: 'mt5',
        title: 'MetaTrader 5 öffnen',
        body: 'Starte deinen MT5-Terminal und logge dich in dein Konto ein. Der Connector spricht über die MT5-Python-API und braucht ein aktives Terminal-Login.',
        done: installed && mt5Open,
        hint: 'Demo-Account funktioniert genauso wie ein Live-Account.',
      },
      {
        id: 'connect',
        title: 'Connector starten',
        body: installed
          ? 'Connector läuft ✓ — wir warten nur noch auf die MT5-Verbindung.'
          : 'Starte den TradeStats-Connector (Desktop-Verknüpfung oder Startmenü). Ein Konsolen-Fenster öffnet sich und bleibt offen. Dieses Fenster nicht schließen — solange du tradest.',
        done: connected,
        hint: connected
          ? null
          : 'Falls Windows-Firewall fragt: "Zugriff zulassen" — der Connector hört nur auf localhost (127.0.0.1).',
      },
    ]
  }, [status.state, installerClicked])

  const currentStepIdx = steps.findIndex(s => !s.done)
  const isFullyConnected = status.state === 'connected'

  // Wenn frisch verbunden: 2s Erfolgs-Anzeige, dann Wizard schließen
  useEffect(() => {
    if (isFullyConnected) {
      const t = setTimeout(() => onDismiss(), 1800)
      return () => clearTimeout(t)
    }
  }, [isFullyConnected, onDismiss])

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-[#3b82f6]/15 border border-[#3b82f6]/30 mb-4">
            <MonitorSmartphone size={28} className="text-[#3b82f6]" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Willkommen bei TradeStats</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            Damit diese Web-App deine MT5-Trades sehen kann, brauchst du einmalig den TradeStats-Connector auf deinem PC.
            Das dauert ~2 Minuten.
          </p>
        </div>

        {/* Erfolgs-Screen wenn verbunden */}
        {isFullyConnected ? (
          <div className="rounded-2xl border border-[#10b981]/40 bg-[#10b981]/10 p-6 text-center">
            <div className="inline-flex p-3 rounded-full bg-[#10b981]/20 mb-3">
              <CheckCircle2 size={32} className="text-[#10b981]" />
            </div>
            <h2 className="text-lg font-semibold text-[#10b981] mb-1">Connector verbunden!</h2>
            <p className="text-sm text-slate-300">Lade jetzt deine Trades... du wirst gleich umgeleitet.</p>
          </div>
        ) : (
          <>
            {/* Status-Banner */}
            <StatusBanner status={status} />

            {/* Schritt-Liste */}
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

            {/* Aktuelle Aktion / großer CTA */}
            {currentStepIdx === 0 && (
              <div className="mt-6 text-center">
                {steps[0].action}
              </div>
            )}

            {/* Warte-Hinweis bei Schritten 2-4 */}
            {currentStepIdx > 0 && currentStepIdx < steps.length && (
              <div className="mt-6 rounded-xl border border-[#1f2937] bg-[#1a2233] p-4 flex items-center gap-3">
                <Loader2 size={16} className="text-[#3b82f6] animate-spin shrink-0" />
                <div className="text-[12px] text-slate-400 leading-relaxed">
                  Ich prüfe alle 3 Sekunden, ob der Connector erreichbar ist. Sobald er läuft, geht's automatisch weiter — du brauchst hier nichts zu klicken.
                </div>
              </div>
            )}

            {/* Footer: Skip-Link + Repo-Link */}
            <div className="mt-8 flex items-center justify-between text-xs">
              <a
                href={CONNECTOR_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300 inline-flex items-center gap-1"
              >
                <Info size={11} /> Was ist der Connector? <ExternalLink size={10} />
              </a>
              <button
                onClick={onDismiss}
                className="text-slate-500 hover:text-slate-300 inline-flex items-center gap-1"
              >
                Ohne Connector weitermachen (CSV-Import) <ChevronRight size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatusBanner({ status }) {
  const config = {
    offline: {
      color: '#ef4444',
      icon: AlertCircle,
      title: 'Connector noch nicht gestartet',
      body: 'TradeStats-Connector unter ' + status.apiUrl + ' nicht erreichbar.',
    },
    backend_only: {
      color: '#f59e0b',
      icon: AlertCircle,
      title: 'Connector läuft — MT5 fehlt',
      body: status.error || 'MetaTrader 5 ist nicht verbunden. Bitte MT5 öffnen und einloggen.',
    },
  }[status.state] || {
    color: '#3b82f6',
    icon: Activity,
    title: 'Prüfe Verbindung...',
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
        </div>
      </div>
    </div>
  )
}

/**
 * Kompakter Status-Badge unten rechts, wenn der User den Wizard
 * weggeklickt hat, das Backend aber weiterhin offline ist.
 */
function ConnectorStatusBadge({ status, onShow }) {
  const config = {
    offline: { color: '#ef4444', label: 'Connector offline' },
    backend_only: { color: '#f59e0b', label: 'MT5 nicht verbunden' },
  }[status.state]
  if (!config) return null
  return (
    <button
      onClick={onShow}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full
        bg-[#1a2233] border shadow-lg text-xs font-medium hover:scale-105 transition-transform"
      style={{ borderColor: config.color + '60', color: config.color }}
      title="Setup-Anleitung wieder anzeigen"
    >
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: config.color }} />
      {config.label}
    </button>
  )
}
