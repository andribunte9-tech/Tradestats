# ================================================================
#  TradeStats - Windows Task Scheduler Setup
#  Erstellt einen automatischen Autostart-Eintrag.
#
#  AUSFUEHRUNG (PowerShell als Administrator):
#      powershell -ExecutionPolicy Bypass -File "C:\Tradestats-app\src\setup_autostart.ps1"
#
#  ZUM ENTFERNEN:
#      Unregister-ScheduledTask -TaskName "TradeStats Autostart" -Confirm:$false
# ================================================================

# -- Konfiguration -----------------------------------------------
$TaskName  = "TradeStats Autostart"
$TaskDesc  = "Startet MT5, Python Backend und Vite beim Windows-Login."
$VbsFile   = "C:\Tradestats-app\src\run_hidden.vbs"
$LogonDelay = "PT20S"

# -- Hilfsfunktionen ---------------------------------------------
function Write-Step {
    param($msg)
    Write-Host "  $msg" -ForegroundColor Cyan
}

function Write-OK {
    param($msg)
    Write-Host "  [OK]  $msg" -ForegroundColor Green
}

function Write-Warn {
    param($msg)
    Write-Host "  [!!]  $msg" -ForegroundColor Yellow
}

function Write-Fail {
    param($msg)
    Write-Host "  [ERR] $msg" -ForegroundColor Red
}

# -- Header -------------------------------------------------------
Write-Host ""
Write-Host "  TradeStats - Autostart Setup" -ForegroundColor White
Write-Host "  ===========================================" -ForegroundColor DarkGray
Write-Host ""

# -- Admin-Check --------------------------------------------------
Write-Step "Pruefe Administratorrechte..."

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$wprincipal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin   = $wprincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Fail "Dieses Skript muss als Administrator ausgefuehrt werden!"
    Write-Host ""
    Write-Host "  Loesung: PowerShell als Administrator oeffnen und erneut ausfuehren:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File C:\Tradestats-app\src\setup_autostart.ps1" -ForegroundColor White
    Write-Host ""
    Read-Host "Enter zum Beenden"
    exit 1
}

Write-OK "Administratorrechte vorhanden."

# -- VBS-Datei pruefen --------------------------------------------
Write-Step "Pruefe ob run_hidden.vbs existiert..."

if (-not (Test-Path $VbsFile)) {
    Write-Fail "Datei nicht gefunden: $VbsFile"
    Write-Fail "Stelle sicher dass run_hidden.vbs in C:\Tradestats-app\src\ liegt."
    Read-Host "Enter zum Beenden"
    exit 1
}

Write-OK "run_hidden.vbs gefunden."

# -- Bestehenden Task entfernen -----------------------------------
Write-Step "Pruefe ob Task bereits existiert..."

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Warn "Task '$TaskName' existiert bereits - wird ueberschrieben."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# -- Aktion erstellen (wscript.exe fuehrt VBS lautlos aus) --------
Write-Step "Erstelle Task-Aktion..."

$actionArgs = @{
    Execute  = "wscript.exe"
    Argument = "`"$VbsFile`""
}
$taskAction = New-ScheduledTaskAction @actionArgs

# -- Trigger erstellen (bei Login + 20s Verzoegerung) -------------
Write-Step "Erstelle Trigger..."

$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$taskTrigger.Delay = $LogonDelay

# -- Einstellungen erstellen --------------------------------------
Write-Step "Erstelle Einstellungen..."

$settingsArgs = @{
    StartWhenAvailable        = $true
    RunOnlyIfNetworkAvailable = $false
    MultipleInstances         = "IgnoreNew"
    ExecutionTimeLimit        = (New-TimeSpan -Hours 0)
}
$taskSettings = New-ScheduledTaskSettingsSet @settingsArgs

# -- Principal erstellen (hoechste Rechte, kein UAC) --------------
$principalArgs = @{
    UserId    = $env:USERNAME
    LogonType = "Interactive"
    RunLevel  = "Highest"
}
$taskPrincipal = New-ScheduledTaskPrincipal @principalArgs

# -- Task registrieren --------------------------------------------
Write-Step "Registriere Task im Task Scheduler..."

$registerArgs = @{
    TaskName    = $TaskName
    Description = $TaskDesc
    Action      = $taskAction
    Trigger     = $taskTrigger
    Settings    = $taskSettings
    Principal   = $taskPrincipal
    Force       = $true
}

try {
    Register-ScheduledTask @registerArgs | Out-Null
    Write-OK "Task '$TaskName' erfolgreich registriert!"
}
catch {
    Write-Fail "Fehler beim Registrieren des Tasks: $_"
    Read-Host "Enter zum Beenden"
    exit 1
}

# -- Ergebnis anzeigen --------------------------------------------
Write-Host ""
Write-Host "  ===========================================" -ForegroundColor DarkGray
Write-Host "  Autostart erfolgreich eingerichtet!" -ForegroundColor Green
Write-Host "  ===========================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Task-Name : $TaskName" -ForegroundColor White
Write-Host "  Benutzer  : $env:USERNAME" -ForegroundColor White
Write-Host "  Trigger   : Bei Anmeldung + 20s Verzoegerung" -ForegroundColor White
Write-Host "  Aktion    : wscript.exe run_hidden.vbs (lautlos)" -ForegroundColor White
Write-Host "  Rechte    : Hoechste (kein UAC-Popup)" -ForegroundColor White
Write-Host ""
Write-Host "  Beim naechsten Login passiert automatisch:" -ForegroundColor Cyan
Write-Host "    1. Windows ladet vollstaendig (20s Verzoegerung)" -ForegroundColor Gray
Write-Host "    2. MT5 startet (falls nicht bereits offen)" -ForegroundColor Gray
Write-Host "    3. 10s warten damit MT5 sich verbindet" -ForegroundColor Gray
Write-Host "    4. Python Backend startet auf Port 8000" -ForegroundColor Gray
Write-Host "    5. Vite Dev Server startet auf Port 5173" -ForegroundColor Gray
Write-Host "    6. Browser oeffnet http://localhost:5173" -ForegroundColor Gray
Write-Host ""
Write-Host "  Nuetzliche Befehle:" -ForegroundColor Cyan
Write-Host '    Jetzt testen : Start-ScheduledTask -TaskName "TradeStats Autostart"' -ForegroundColor White
Write-Host '    Status       : Get-ScheduledTask   -TaskName "TradeStats Autostart"' -ForegroundColor White
Write-Host '    Entfernen    : Unregister-ScheduledTask -TaskName "TradeStats Autostart" -Confirm:$false' -ForegroundColor White
Write-Host '    GUI oeffnen  : taskschd.msc' -ForegroundColor White
Write-Host ""

Read-Host "Enter zum Beenden"
