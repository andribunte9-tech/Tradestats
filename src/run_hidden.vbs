' ================================================================
'  TradeStats – Silent Launcher Wrapper
'  Führt start.bat ohne sichtbares Konsolenfenster aus.
'  Wird vom Windows Task Scheduler aufgerufen.
' ================================================================
Option Explicit

Dim Shell, BatFile
BatFile = "C:\Tradestats-app\src\start.bat"

Set Shell = CreateObject("WScript.Shell")

' Parameter: Befehl, Fenster-Modus (0=unsichtbar), Warten (False=async)
Shell.Run Chr(34) & BatFile & Chr(34), 0, False

Set Shell = Nothing
