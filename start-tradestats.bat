@echo off
REM ============================================================
REM  Tradestats — Ein-Klick-Starter
REM  Startet Backend (Python sync.py auf :8000) und
REM  Frontend (Vite Dev-Server auf :5173) in eigenen Fenstern.
REM
REM  Schliessen der Fenster beendet jeweils den Server.
REM  Beide Fenster offen lassen, solange die App laeuft.
REM ============================================================

setlocal
cd /d "%~dp0"

echo [Tradestats] Starte Backend (Python sync.py, Port 8000)...
start "Tradestats Backend (sync.py:8000)" cmd /k "cd /d %~dp0src\backend && python sync.py"

echo [Tradestats] Warte 3s, damit das Backend hochfahren kann...
timeout /t 3 /nobreak >nul

echo [Tradestats] Starte Frontend (Vite Dev, Port 5173)...
start "Tradestats Frontend (vite:5173)" cmd /k "cd /d %~dp0 && npm run dev"

echo [Tradestats] Warte 5s, damit Vite kompiliert...
timeout /t 5 /nobreak >nul

echo [Tradestats] Oeffne Browser auf http://localhost:5173 ...
start "" "http://localhost:5173"

echo.
echo [Tradestats] Fertig. Beide Server laufen jetzt in eigenen Fenstern.
echo Schliesse dieses Fenster — die anderen beiden laufen weiter.
echo.
timeout /t 3 /nobreak >nul
endlocal
