; TradeStats - Inno Setup Script
; Ausfuehren: ISCC.exe installer.iss  (oder per build_exe.bat)
; Erzeugt: release\TradeStats_Setup.exe
; Kompatibel mit Inno Setup 6 (ohne ISPP-Erweiterung)

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName=TradeStats
AppVersion=1.1
AppPublisher=TradeStats
AppPublisherURL=http://tradestats.app
AppSupportURL=http://tradestats.app
DefaultDirName={autopf}\TradeStats
DefaultGroupName=TradeStats
AllowNoIcons=yes
OutputDir=release
OutputBaseFilename=TradeStats_Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
MinVersion=10.0
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Desktop-Verkuepfung erstellen"; GroupDescription: "Zusaetzliche Symbole:"
Name: "startupicon"; Description: "Beim Windows-Start automatisch starten"; GroupDescription: "Autostart:"; Flags: unchecked

[Files]
Source: "release\app\TradeStats\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\TradeStats"; Filename: "{app}\TradeStats.exe"
Name: "{group}\TradeStats beenden"; Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM TradeStats.exe"; IconFilename: "{sys}\shell32.dll"; IconIndex: 131
Name: "{commondesktop}\TradeStats"; Filename: "{app}\TradeStats.exe"; Tasks: desktopicon
Name: "{userstartup}\TradeStats"; Filename: "{app}\TradeStats.exe"; Tasks: startupicon

[Run]
Filename: "{app}\TradeStats.exe"; Description: "TradeStats jetzt starten"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM TradeStats.exe"; Flags: runhidden

[Code]
function InitializeSetup(): Boolean;
var
  MT5Path: String;
  Answer: Integer;
begin
  Result := True;
  if not RegQueryStringValue(HKLM, 'SOFTWARE\MetaQuotes\MetaTrader 5', 'Path', MT5Path) then
  begin
    Answer := MsgBox(
      'MetaTrader 5 wurde nicht gefunden.' + Chr(13) + Chr(10) +
      Chr(13) + Chr(10) +
      'TradeStats funktioniert auch ohne MetaTrader 5' + Chr(13) + Chr(10) +
      '(manueller Import von CSV-Dateien).' + Chr(13) + Chr(10) +
      Chr(13) + Chr(10) +
      'Moechten Sie die Installation fortsetzen?',
      mbConfirmation, MB_YESNO
    );
    if Answer = IDNO then
      Result := False;
  end;
end;
