import {
  LayoutDashboard, BookOpen, Calendar, Upload, Download,
  ChevronRight, NotebookPen, ShieldAlert, User, BarChart3, Library,
} from 'lucide-react'
import { LiveStatusBadge } from './LiveSyncPanel'
import TSLogo from '../assets/TSLogo'
import { useLanguage } from '../hooks/useLanguage'

const NAV_ITEMS = [
  { id: 'dashboard',     key: 'nav.dashboard',     icon: LayoutDashboard },
  { id: 'journal',       key: 'nav.journal',       icon: BookOpen },
  { id: 'daily-journal', key: 'nav.daily_journal', icon: NotebookPen },
  { id: 'calendar',      key: 'nav.calendar',      icon: Calendar },
  { id: 'analyse',       key: 'nav.analyse',       icon: BarChart3 },
  { id: 'setups',        key: 'nav.setups',        icon: Library },
  { id: 'risk',          key: 'nav.risk',          icon: ShieldAlert },
  { id: 'profile',       key: 'nav.profile',       icon: User },
  { id: 'import',        key: 'nav.import',        icon: Upload },
  { id: 'export',        key: 'nav.export',        icon: Download },
]

export default function Sidebar({ activePage, setActivePage }) {
  const { t } = useLanguage()
  return (
    <aside className="w-56 flex-shrink-0 bg-[#0d1117] border-r border-[#1f2937] flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-[#1f2937]">
        <div className="flex items-center gap-2.5 mb-3">
          <TSLogo size={32} className="flex-shrink-0" />
          <div>
            <span className="text-white font-bold text-base tracking-tight">TradeStats</span>
            <div className="text-[10px] text-slate-500 font-mono">v1.0</div>
          </div>
        </div>
        {/* Live connection badge */}
        <LiveStatusBadge />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ id, key, icon: Icon }) => {
          const label = t(key)
          const active = activePage === id
          return (
            <button
              key={id}
              onClick={() => setActivePage(id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150 group
                ${active
                  ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2233]'}
              `}
            >
              <Icon size={16} className={active ? 'text-[#10b981]' : 'text-slate-500 group-hover:text-slate-300'} />
              <span className="flex-1 text-left">{label}</span>
              {active && <ChevronRight size={12} className="text-[#10b981]" />}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[#1f2937]">
        <div className="text-[11px] text-slate-600 text-center">
          {t('nav.trading_journal')}
        </div>
      </div>
    </aside>
  )
}
