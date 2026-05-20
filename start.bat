@echo off

:: Browser mit Ladescreen sofort öffnen
start C:\Tradestats-app\loading.html

:: Alte Prozesse beenden
taskkill /F /IM node.exe 2>nul
taskkill /F /IM python.exe 2>nul
timeout /t 2 /nobreak >nul

:: npm install
cd /d C:\Tradestats-app
call "C:\Program Files\nodejs\npm.cmd" install

:: Python Backend versteckt starten
PowerShell -WindowStyle Hidden -Command "Start-Process python -ArgumentList 'C:\Tradestats-app\src\backend\sync.py' -WorkingDirectory 'C:\Tradestats-app\src\backend' -WindowStyle Hidden"
timeout /t 5 /nobreak >nul

:: Vite versteckt starten
PowerShell -WindowStyle Hidden -Command "Start-Process 'C:\Program Files\nodejs\npm.cmd' -ArgumentList 'run dev' -WorkingDirectory 'C:\Tradestats-app' -WindowStyle Hidden"