# ================================================================
#  Erstellt C:\Tradestats-app\start.bat und Desktop-Verknuepfung
#  Ausfuehren: powershell -ExecutionPolicy Bypass -File "C:\Tradestats-app\src\create_start.ps1"
# ================================================================

# ── start.bat Inhalt (single-quote here-string = kein PS-Escape-Problem) ──
$batContent = @'
@echo off
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

:: ── [2] npm install ───────────────────────────────────────────
echo  [2/5] npm install (bitte warten - kann 1-2 Minuten dauern)...
cd /d "C:\Tradestats-app"

if exist "C:\Program Files\nodejs\npm.cmd" (
    "C:\Program Files\nodejs\npm.cmd" install
) else (
    echo  FEHLER: npm nicht gefunden unter C:\Program Files\nodejs\npm.cmd
    echo  Bitte Node.js installieren: https://nodejs.org
    pause
    exit /b 1
)

if errorlevel 1 (
    echo.
    echo  FEHLER: npm install fehlgeschlagen!
    pause
    exit /b 1
)
echo  npm install abgeschlossen.
echo.

:: ── [3] Python Backend starten ────────────────────────────────
echo  [3/5] Starte Python Backend auf Port 8000...

set PYTHON_CMD=
for /f "delims=" %%X in ('where python 2^>nul') do if "!PYTHON_CMD!"=="" set PYTHON_CMD=%%X
if "%PYTHON_CMD%"=="" (
    for /f "delims=" %%X in ('where py 2^>nul') do if "!PYTHON_CMD!"=="" set PYTHON_CMD=%%X
)
if "%PYTHON_CMD%"=="" (
    if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python313\python.exe
    if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
    if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
)

if "%PYTHON_CMD%"=="" (
    echo  WARNUNG: Python nicht gefunden - Backend startet nicht.
) else (
    echo  Python: %PYTHON_CMD%
    start "TradeStats Backend" /min cmd /k ""%PYTHON_CMD%" "C:\Tradestats-app\src\backend\sync.py""
    echo  Backend gestartet.
)
echo.

:: ── [4] Vite Dev Server starten ───────────────────────────────
echo  [4/5] Starte Vite Dev Server auf Port 5173...
start "TradeStats Vite" /min cmd /k "cd /d "C:\Tradestats-app" && "C:\Program Files\nodejs\npm.cmd" run dev"
echo  Vite gestartet.
echo.

:: ── [5] 5 Sekunden warten, Browser oeffnen ───────────────────
echo  [5/5] Warte 5 Sekunden...
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
'@

# ── start.bat schreiben ───────────────────────────────────────────────
Write-Host ""
Write-Host "  [1/2] Schreibe C:\Tradestats-app\start.bat ..." -ForegroundColor Cyan

try {
    [System.IO.File]::WriteAllText(
        "C:\Tradestats-app\start.bat",
        $batContent,
        [System.Text.Encoding]::ASCII
    )
    Write-Host "  [OK]  start.bat erstellt." -ForegroundColor Green
}
catch {
    Write-Host "  [ERR] start.bat konnte nicht erstellt werden: $_" -ForegroundColor Red
    exit 1
}

# ── Desktop-Verknuepfung erstellen ────────────────────────────────────
Write-Host ""
Write-Host "  [2/2] Erstelle Desktop-Verknuepfung ..." -ForegroundColor Cyan

$Desktop   = [System.Environment]::GetFolderPath("Desktop")
$LnkPath   = "$Desktop\TradeStats starten.lnk"
$IconPath  = "$env:SystemRoot\System32\shell32.dll"
$IconIndex = 18   # Balkendiagramm / Chart-aehnliches Icon

$WShell   = New-Object -ComObject WScript.Shell
$Shortcut = $WShell.CreateShortcut($LnkPath)

$Shortcut.TargetPath       = "C:\Tradestats-app\start.bat"
$Shortcut.WorkingDirectory = "C:\Tradestats-app"
$Shortcut.WindowStyle      = 1
$Shortcut.Description      = "TradeStats Trading Journal starten"
$Shortcut.IconLocation     = "$IconPath,$IconIndex"
$Shortcut.Save()

# "Als Administrator ausfuehren"-Flag setzen (Byte 0x15, Bit 0x20)
$lnkBytes       = [System.IO.File]::ReadAllBytes($LnkPath)
$lnkBytes[0x15] = $lnkBytes[0x15] -bor 0x20
[System.IO.File]::WriteAllBytes($LnkPath, $lnkBytes)

Write-Host "  [OK]  Verknuepfung erstellt: $LnkPath" -ForegroundColor Green
Write-Host "        Icon: shell32.dll,$IconIndex  |  Ausfuehren als Administrator: JA" -ForegroundColor DarkGray

# ── Ergebnis ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ==========================================" -ForegroundColor DarkGray
Write-Host "  Fertig!" -ForegroundColor Green
Write-Host "  ==========================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  start.bat    : C:\Tradestats-app\start.bat" -ForegroundColor White
Write-Host "  Desktop-Icon : $LnkPath" -ForegroundColor White
Write-Host ""
Write-Host "  Jetzt einfach 'TradeStats starten' auf dem Desktop" -ForegroundColor Cyan
Write-Host "  doppelklicken - UAC-Abfrage bestaetigen - fertig." -ForegroundColor Cyan
Write-Host ""
Read-Host "Enter zum Beenden"
