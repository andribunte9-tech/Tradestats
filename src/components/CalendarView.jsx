import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, X, Calendar } from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, parseISO,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { useTrades } from '../hooks/useTrades'
import { groupTradesByDay, calcBalanceAt } from '../utils/calculations'
import { Pvt, usePrivacyMode } from '../hooks/usePrivacyMode'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/* ─── Hilfsfunktionen ────────────────────────────────────── */
function fmtAmount(v) {
  const abs  = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtAmountSigned(v) {
  const abs  = Math.abs(v)
  const sign = v < 0 ? '-' : '+'
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`
  return `${sign}$${abs.toFixed(0)}`
}

/* ─── Day Detail Panel ───────────────────────────────────── */
function DayPanel({ date, trades, onClose, getTagStyle }) {
  const dayPnl = trades.reduce((s, t) => s + t.profit, 0)
  const wins   = trades.filter(t => t.profit > 0).length
  const wr     = trades.length ? (wins / trades.length * 100).toFixed(1) : '0.0'

  return (
    <div className="card fade-in mt-4">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <Calendar size={15} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-200">
            {format(date, 'EEEE, dd. MMMM yyyy', { locale: de })}
          </h3>
          <span className="text-xs text-slate-500">{trades.length} Trade{trades.length !== 1 ? 's' : ''}</span>
          <span className="text-xs text-slate-500">{wr}% WR</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-mono font-bold ${dayPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
            <Pvt value={dayPnl} compact />
          </span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {trades.map(trade => {
          const netPnl = trade.profit + (trade.commission || 0) + (trade.swap || 0)
          return (
            <div key={trade.id} className="flex items-center justify-between bg-[#0d1117] rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  trade.type === 'BUY' ? 'bg-[#10b981]/15 text-[#10b981]' : 'bg-[#ef4444]/15 text-[#ef4444]'
                }`}>{trade.type}</span>
                <span className="font-mono font-semibold text-slate-200">{trade.symbol}</span>
                <span className="text-xs text-slate-500">{trade.volume} Lot</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {(trade.tags || []).slice(0, 2).map(tag => {
                    const style = getTagStyle(tag)
                    return (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: style.bg, color: style.color }}>
                        {tag}
                      </span>
                    )
                  })}
                </div>
                <span className={`font-mono text-sm font-bold ${netPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  <Pvt value={netPnl} />
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Kalender ───────────────────────────────────────────── */
export default function CalendarView() {
  const { effectiveTrades, getTagStyle } = useTrades()
  const { privacyMode, accountBalance }  = usePrivacyMode()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay,  setSelectedDay]  = useState(null)

  const tradesByDay = useMemo(() => groupTradesByDay(effectiveTrades), [effectiveTrades])

  /**
   * Balance zu einem Zeitpunkt (Ms) — automatisch aus Trade-History berechnet.
   * Gibt accountBalance zurück wenn kein Kapital hinterlegt.
   */
  function balanceAt(cutoffMs) {
    if (accountBalance <= 0) return 0
    return calcBalanceAt(effectiveTrades, cutoffMs, accountBalance)
  }

  /* Kalender-Tage (Sonntag als Wochenbeginn wie Tradezella) */
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end   = endOfWeek(endOfMonth(currentDate),     { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  /* Wochen-Gruppen mit Stats */
  const weeks = useMemo(() => {
    const result = []
    for (let i = 0; i < days.length; i += 7) {
      const weekDays = days.slice(i, i + 7)
      let pnl = 0, tradeDays = 0
      weekDays.forEach(day => {
        const key = format(day, 'yyyy-MM-dd')
        if (tradesByDay[key] && isSameMonth(day, currentDate)) {
          pnl       += tradesByDay[key].pnl
          tradeDays += 1
        }
      })
      result.push({ days: weekDays, pnl, tradeDays, num: result.length + 1 })
    }
    return result
  }, [days, tradesByDay, currentDate])

  /* Monats-Stats */
  const monthKey   = format(currentDate, 'yyyy-MM')
  const monthDays  = Object.entries(tradesByDay).filter(([d]) => d.startsWith(monthKey))
  const monthPnl   = monthDays.reduce((s, [, v]) => s + v.pnl, 0)
  const tradeDays  = monthDays.length
  const isThisMonth = format(new Date(), 'yyyy-MM') === monthKey

  function prevMonth() { setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)); setSelectedDay(null) }
  function nextMonth() { setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); setSelectedDay(null) }
  function goToday()   { setCurrentDate(new Date()); setSelectedDay(null) }

  function handleDayClick(day) {
    const key = format(day, 'yyyy-MM-dd')
    if (tradesByDay[key]) setSelectedDay(selectedDay === key ? null : key)
  }

  return (
    <div className="p-6 space-y-4">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-bold text-white">Kalender</h1>
        <p className="text-sm text-slate-500 mt-0.5">Monatsübersicht deiner Trading-Tage</p>
      </div>

      {/* ── Haupt-Card ── */}
      <div className="card">

        {/* ── Header: Navigation + Monthly Stats ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2937]">
          {/* Links: Pfeile + Monat + This month */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1f2937] transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-sm font-bold text-white min-w-[110px] text-center">
              {format(currentDate, 'MMMM yyyy', { locale: de })}
            </h2>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1f2937] transition-colors"
            >
              <ChevronRight size={16} />
            </button>
            {!isThisMonth && (
              <button
                onClick={goToday}
                className="ml-1 px-3 py-1 text-xs rounded-full border border-[#2d3748] text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              >
                This month
              </button>
            )}
          </div>

          {/* Rechts: Monthly Stats */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Monthly P&L:</span>
              <span className={`text-sm font-mono font-bold ${monthPnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                <Pvt value={monthPnl} compact />
              </span>
              {!privacyMode && accountBalance > 0 && monthPnl !== 0 && (() => {
                const monthStartMs = startOfMonth(currentDate).getTime()
                const bal = balanceAt(monthStartMs)
                return bal > 0 ? (
                  <span className={`text-xs font-mono ${monthPnl >= 0 ? 'text-[#10b981]/50' : 'text-[#ef4444]/50'}`}>
                    ({monthPnl >= 0 ? '+' : ''}{(monthPnl / bal * 100).toFixed(2)}%)
                  </span>
                ) : null
              })()}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-mono font-bold text-slate-200`}>{tradeDays}</span>
              <span className="text-xs text-slate-500">days</span>
            </div>
          </div>
        </div>

        {/* ── Kalender-Grid ── */}
        <div className="p-4">

          {/* Spalten-Header: 7 Wochentage + Wochen-Stats */}
          <div className="grid grid-cols-[repeat(7,1fr)_140px] gap-1 mb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-xs text-slate-500 font-medium py-1.5">
                {d}
              </div>
            ))}
            <div className="text-center text-xs text-slate-500 font-medium py-1.5">Week</div>
          </div>

          {/* Wochen-Zeilen */}
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-[repeat(7,1fr)_140px] gap-1">

                {/* 7 Tages-Zellen */}
                {week.days.map(day => {
                  const key        = format(day, 'yyyy-MM-dd')
                  const dayData    = tradesByDay[key]
                  const isMonth    = isSameMonth(day, currentDate)
                  const isTodayDay = isToday(day)
                  const isSelected = selectedDay === key
                  const hasTrades  = !!dayData && isMonth

                  // Samstag (6) und Sonntag (0) = Market Closed
                  const dow       = day.getDay()
                  const isWeekend = dow === 0 || dow === 6

                  const wins = hasTrades ? dayData.trades.filter(t => t.profit > 0).length : 0
                  const wr   = hasTrades && dayData.trades.length > 0
                    ? (wins / dayData.trades.length * 100).toFixed(1)
                    : null

                  // Hintergrundfarben
                  let bg = ''
                  if (!isMonth)
                    bg = 'bg-[#0a0f1a]'
                  else if (isWeekend)
                    bg = 'bg-[#0a0f1a]'          // Wochenende: abgedunkelt
                  else if (isSelected)
                    bg = 'bg-[#1a2233] ring-1 ring-[#374151]'
                  else if (hasTrades && dayData.pnl > 0)
                    bg = 'bg-[#10b981]/10 hover:bg-[#10b981]/18 border border-[#10b981]/20'
                  else if (hasTrades && dayData.pnl < 0)
                    bg = 'bg-[#ef4444]/10 hover:bg-[#ef4444]/18 border border-[#ef4444]/20'
                  else if (hasTrades)
                    bg = 'bg-[#374151]/15 hover:bg-[#374151]/25'
                  else
                    bg = 'bg-[#0d1117] hover:bg-[#111827]'

                  return (
                    <div
                      key={key}
                      onClick={() => isMonth && hasTrades && !isWeekend && handleDayClick(day)}
                      className={`
                        relative rounded-lg min-h-[90px] p-2.5 transition-all
                        ${bg}
                        ${isMonth && hasTrades && !isWeekend ? 'cursor-pointer' : ''}
                        ${!isMonth ? 'opacity-30' : ''}
                        ${isWeekend && isMonth ? 'opacity-40' : ''}
                      `}
                    >
                      {/* Tag-Nummer */}
                      <div className="flex justify-end mb-2">
                        {isTodayDay ? (
                          <span className="w-5 h-5 rounded-full bg-[#10b981] text-white text-[10px] font-bold flex items-center justify-center">
                            {format(day, 'd')}
                          </span>
                        ) : (
                          <span className={`text-xs font-medium ${
                            isWeekend && isMonth ? 'text-slate-700' : isMonth ? 'text-slate-500' : 'text-slate-700'
                          }`}>
                            {format(day, 'd')}
                          </span>
                        )}
                      </div>

                      {/* Market Closed Label für Wochenende */}
                      {isWeekend && isMonth && (
                        <div className="flex items-center justify-center h-[50px]">
                          <span className="text-[9px] text-slate-700 uppercase tracking-widest font-medium">
                            closed
                          </span>
                        </div>
                      )}

                      {/* P&L + Stats */}
                      {hasTrades && !isWeekend && (
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <span className={`text-sm font-bold font-mono leading-tight ${
                            dayData.pnl >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'
                          }`}>
                            <Pvt value={dayData.pnl} compact sign={false} />
                          </span>
                          {/* ROI % — Balance am Anfang dieses Tages */}
                          {!privacyMode && accountBalance > 0 && (() => {
                            const bal = balanceAt(day.getTime())
                            return bal > 0 ? (
                              <span className={`text-[9px] font-mono ${
                                dayData.pnl >= 0 ? 'text-[#10b981]/55' : 'text-[#ef4444]/55'
                              }`}>
                                {dayData.pnl >= 0 ? '+' : ''}{(dayData.pnl / bal * 100).toFixed(2)}%
                              </span>
                            ) : null
                          })()}
                          <span className="text-[10px] text-slate-500">
                            {dayData.trades.length} {dayData.trades.length === 1 ? 'trade' : 'trades'}
                          </span>
                          {wr !== null && (
                            <span className={`text-[10px] font-mono ${
                              parseFloat(wr) >= 50 ? 'text-[#10b981]/80' : 'text-[#ef4444]/80'
                            }`}>
                              {wr}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Wochen-Stats rechts */}
                <div className={`rounded-lg p-3 flex flex-col justify-center gap-0.5 ${
                  week.tradeDays > 0 ? 'bg-[#0d1117]' : 'bg-[#0a0f1a] opacity-40'
                }`}>
                  <span className="text-[11px] text-slate-500 font-medium">Week {week.num}</span>
                  <span className={`text-sm font-bold font-mono ${
                    week.pnl > 0 ? 'text-[#10b981]' : week.pnl < 0 ? 'text-[#ef4444]' : 'text-slate-500'
                  }`}>
                    {week.tradeDays > 0
                      ? <Pvt value={week.pnl} compact sign={false} />
                      : <Pvt value={0} compact sign={false} />
                    }
                  </span>
                  {/* ROI Woche — Balance am Montag der Woche */}
                  {!privacyMode && week.tradeDays > 0 && accountBalance > 0 && (() => {
                    const bal = balanceAt(week.days[0].getTime())
                    return bal > 0 ? (
                      <span className={`text-[9px] font-mono ${
                        week.pnl >= 0 ? 'text-[#10b981]/55' : 'text-[#ef4444]/55'
                      }`}>
                        {week.pnl >= 0 ? '+' : ''}{(week.pnl / bal * 100).toFixed(2)}%
                      </span>
                    ) : null
                  })()}
                  <span className="text-[10px] text-slate-600">
                    {week.tradeDays} {week.tradeDays === 1 ? 'day' : 'days'}
                  </span>
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Day Detail Panel ── */}
      {selectedDay && tradesByDay[selectedDay] && (
        <DayPanel
          date={parseISO(selectedDay)}
          trades={tradesByDay[selectedDay].trades}
          onClose={() => setSelectedDay(null)}
          getTagStyle={getTagStyle}
        />
      )}
    </div>
  )
}
