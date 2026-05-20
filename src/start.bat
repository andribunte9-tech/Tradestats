@echo off
setlocal EnableDelayedExpansion
title TradeStats - Starter
color 0A
cls

echo.
echo  ==========================================
echo    TradeStats  -  Dienste werden gestartet
echo  ==========================================
echo.

:: ── [1] Alte Prozesse auf Port 5173 und 8000 beenden ──────────
echo  [1/5] Beende alte Prozesse auf Port 5173 und 8000...

for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 "') do (
    if not "%%a"=="0" if not "%%a"=="4" (
        taskkill /PID %%a /F >nul 2>&1
    )
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 "') do (
    if not "%%a"=="0" if not "%%a"=="4" (
        taskkill /PID %%a /F >nul 2>&1
    )
)
timeout /t 2 /nobreak >nul
echo  Ports 5173 und 8000 freigegeben.
echo.

:: ── [2] npm pruefen ────────────────────────────────────────────
echo  [2/5] Pruefe npm...
cd /d "C:\Tradestats-app"
if errorlevel 1 (
    echo.
    echo  FEHLER: Konnte nicht nach C:\Tradestats-app wechseln!
    echo  Bitte sicherstellen dass C:\Tradestats-app existiert.
    pause
    exit /b 1
)

if not exist "C:\Program Files\nodejs\npm.cmd" (
    echo.
    echo  FEHLER: npm nicht gefunden unter:
    echo    C:\Program Files\nodejs\npm.cmd
    echo.
    echo  Bitte Node.js installieren: https://nodejs.org
    pause
    exit /b 1
)
echo  npm gefunden.
echo.

:: ── [3] npm install ────────────────────────────────────────────
echo  [3/5] npm install (bitte warten - kann 1-2 Minuten dauern)...
echo.
"C:\Program Files\nodejs\npm.cmd" install
if errorlevel 1 (
    echo.
    echo  ==========================================
    echo  FEHLER: npm install fehlgeschlagen!
    echo  Siehe Fehlermeldung oben.
    echo  ==========================================
    pause
    exit /b 1
)
echo.
echo  npm install abgeschlossen.
echo.

:: ── [4] Python Backend starten ─────────────────────────────────
echo  [4/5] Starte Python Backend auf Port 8000...

set PYTHON_CMD=
for /f "delims=" %%X in ('where python 2^>nul') do (
    if "!PYTHON_CMD!"=="" set PYTHON_CMD=%%X
)
if "!PYTHON_CMD!"=="" (
    for /f "delims=" %%X in ('where py 2^>nul') do (
        if "!PYTHON_CMD!"=="" set PYTHON_CMD=%%X
    )
)
if "!PYTHON_CMD!"=="" (
    if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
        set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python313\python.exe
    )
)
if "!PYTHON_CMD!"=="" (
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
        set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
    )
)
if "!PYTHON_CMD!"=="" (
    if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
        set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
    )
)

if "!PYTHON_CMD!"=="" (
    echo  WARNUNG: Python nicht gefunden - Backend startet nicht.
    echo  Bitte Python installieren: https://www.python.org
) else (
    echo  Python: !PYTHON_CMD!
    start "TradeStats Backend" /min cmd /k ""!PYTHON_CMD!" "C:\Tradestats-app\src\backend\sync.py""
    if errorlevel 1 (
        echo.
        echo  FEHLER: Python Backend konnte nicht gestartet werden!
        pause
        exit /b 1
    )
    echo  Backend gestartet.
)
echo.

:: ── [5] Vite Dev Server starten ────────────────────────────────
echo  [5/5] Starte Vite Dev Server auf Port 5173...
start "TradeStats Vite" /min cmd /k "cd /d "C:\Tradestats-app" && "C:\Program Files\nodejs\npm.cmd" run dev"
if errorlevel 1 (
    echo.
    echo  FEHLER: Vite Dev Server konnte nicht gestartet werden!
    pause
    exit /b 1
)
echo  Vite gestartet.
echo.

:: ── Browser oeffnen ────────────────────────────────────────────
echo  Warte 5 Sekunden und oeffne Browser...
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo  ==========================================
echo    TradeStats laeuft!
echo    http://localhost:5173
echo  ==========================================
echo.
echo  Dieses Fenster kann geschlossen werden.
echo.
pause
endlocal
