@echo off
setlocal EnableDelayedExpansion
title TradeStats – Build
color 0A

echo.
echo  ================================================
echo   TradeStats – Windows EXE Build
echo  ================================================
echo.

:: ── Voraussetzungen prüfen ────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Node.js nicht gefunden. Bitte installieren: https://nodejs.org
    pause & exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Python nicht gefunden. Bitte installieren: https://python.org
    pause & exit /b 1
)
set PYINSTALLER=C:\Users\andri\AppData\Local\Python\pythoncore-3.14-64\Scripts\pyinstaller.exe
if not exist "%PYINSTALLER%" (
    echo [FEHLER] PyInstaller nicht gefunden unter:
    echo          %PYINSTALLER%
    pause & exit /b 1
)

:: ── Schritt 1: Frontend bauen (nur fuer Vercel-Deploy / nicht im Bundle) ─
:: Hinweis: Ab v1.1.0 wird das Frontend NICHT mehr ins Backend-Bundle
:: gepackt. Es laeuft komplett aus der Cloud (Vercel). Diese Zeile bauen
:: wir trotzdem, damit Pre-Push-Checks stimmen.
echo [1/3] Frontend Build (Vite) — nur fuer Vercel...
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
    echo [FEHLER] Frontend Build fehlgeschlagen!
    pause & exit /b 1
)
echo  ^> dist/ erstellt (wird nicht im Installer gebundelt).

:: ── Schritt 2: PyInstaller ────────────────────────────────────────────────
echo [2/3] PyInstaller – Bundle erstellen...
cd /d "%~dp0src\backend"
"%PYINSTALLER%" --clean -y --distpath "..\..\release\app" tradestats.spec
if errorlevel 1 (
    echo [FEHLER] PyInstaller fehlgeschlagen!
    echo  Tipp: Fehlermeldung oben lesen, ggf. fehlende Hidden-Imports ergaenzen.
    cd /d "%~dp0"
    pause & exit /b 1
)
cd /d "%~dp0"
echo  ^> release\app\TradeStats\ erstellt.

:: ── Schritt 3: Inno Setup Installer ──────────────────────────────────────
echo [3/3] Installer erstellen (Inno Setup)...

set ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe
if not exist "%ISCC_PATH%" set ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe

if exist "%ISCC_PATH%" (
    "%ISCC_PATH%" "%~dp0installer.iss"
    if errorlevel 1 (
        echo [WARNUNG] Inno Setup fehlgeschlagen – EXE-Bundle ist aber in release\app\TradeStats\ verfuegbar.
    ) else (
        echo  ^> Installer: release\TradeStats_Setup.exe
    )
) else (
    echo [INFO] Inno Setup nicht installiert – Schritt uebersprungen.
    echo        Download: https://jrsoftware.org/isdl.php
    echo        Manuell: release\app\TradeStats\ als ZIP verteilen.
)

:: ── Aufräumen ─────────────────────────────────────────────────────────────
echo.
echo  Temporaere Dateien aufraeumen...
if exist "src\backend\dist"       rmdir /s /q "src\backend\dist"
if exist "src\backend\build"      rmdir /s /q "src\backend\build"
if exist "src\backend\__pycache__" rmdir /s /q "src\backend\__pycache__"

echo.
echo  ================================================
echo   BUILD FERTIG
echo  ================================================
echo.
echo   EXE-Ordner:  release\app\TradeStats\TradeStats.exe
if exist "release\TradeStats_Setup.exe" (
    echo   Installer:   release\TradeStats_Setup.exe
)
echo.
echo   Der Enduser benoetigt NUR:
echo    - Windows 10/11
echo    - MetaTrader 5 Terminal (fuer Live-Sync)
echo.
pause
