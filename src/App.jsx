import { useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import TradeJournal from './components/TradeJournal'
import DailyJournal from './components/DailyJournal'
import CalendarView from './components/CalendarView'
import ImportPage from './components/ImportPage'
import ExportPage from './components/ExportPage'
import RiskTab from './components/RiskTab'
import AnalysePage from './components/AnalysePage'
import SignalsPage from './components/SignalsPage'
import ProfileTab, { ReadonlyShareView } from './components/ProfileTab'
import { ImportToast } from './components/LiveSyncPanel'
import { SetupGate } from './components/SetupWizard'
import { TradesProvider } from './hooks/useTrades'
import { LiveSyncProvider } from './hooks/useLiveSync'
import { PrivacyModeProvider } from './hooks/usePrivacyMode'
import { ToastProvider } from './hooks/useToast'
import { PositionNotesProvider } from './hooks/usePositionNotes'
import { SetupsProvider } from './hooks/useSetups'
import { LanguageProvider } from './hooks/useLanguage'

/* ─── Share-URL prüfen (einmalig beim Laden) ──────────────── */
function getShareData() {
  try {
    const p = new URLSearchParams(window.location.search).get('share')
    if (!p) return null
    return JSON.parse(atob(p))
  } catch {
    return null
  }
}

const SHARE_DATA = getShareData()

export default function App() {
  const [activePage, setActivePage] = useState(
    SHARE_DATA ? 'profile' : 'dashboard'
  )

  // Readonly Share View: kein Sidebar, keine Navigation
  if (SHARE_DATA) {
    return (
      <LanguageProvider>
        <PrivacyModeProvider>
          <ReadonlyShareView data={SHARE_DATA} />
        </PrivacyModeProvider>
      </LanguageProvider>
    )
  }

  const pages = {
    dashboard:       <Dashboard />,
    journal:         <TradeJournal />,
    'daily-journal': <DailyJournal />,
    calendar:        <CalendarView />,
    analyse:         <AnalysePage />,
    risk:            <RiskTab />,
    signals:         <SignalsPage />,
    profile:         <ProfileTab />,
    import:          <ImportPage />,
    export:          <ExportPage />,
  }

  return (
    <LanguageProvider>
      <SetupGate>
        <TradesProvider>
          <LiveSyncProvider>
            <PrivacyModeProvider>
              <ToastProvider>
                <PositionNotesProvider>
                  <SetupsProvider>
                    <Layout activePage={activePage} setActivePage={setActivePage}>
                      {pages[activePage] || <Dashboard />}
                    </Layout>
                    {/* Auto-import toast notification */}
                    <ImportToast />
                  </SetupsProvider>
                </PositionNotesProvider>
              </ToastProvider>
            </PrivacyModeProvider>
          </LiveSyncProvider>
        </TradesProvider>
      </SetupGate>
    </LanguageProvider>
  )
}
