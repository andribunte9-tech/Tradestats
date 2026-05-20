# TradeStats – Windows EXE bauen

## Was entsteht
Ein Windows-Installer (`TradeStats_Setup.exe`), den der Enduser
installieren kann **ohne Python oder Node.js**.

Der Enduser braucht nur:
- Windows 10 / 11
- MetaTrader 5 Terminal *(optional – nur für Live-Sync)*

---

## Voraussetzungen (nur auf dem Build-PC)

| Tool | Download |
|------|----------|
| Node.js ≥ 18 | https://nodejs.org |
| Python ≥ 3.11 | https://python.org |
| PyInstaller | `pip install pyinstaller` |
| Inno Setup 6 | https://jrsoftware.org/isdl.php *(optional)* |

Python-Abhängigkeiten installieren:
```
pip install -r src/backend/requirements.txt
pip install pyinstaller
```

---

## Build-Befehl

```bat
build_exe.bat
```

Das Script macht automatisch:
1. `npm run build` → React-App zu `dist/` kompilieren
2. `dist/` nach `src/backend/dist/` kopieren (für PyInstaller)
3. `pyinstaller tradestats.spec` → `release/app/TradeStats/` erstellen
4. `ISCC.exe installer.iss` → `release/TradeStats_Setup.exe` erstellen

---

## Ausgabe

```
release/
  app/
    TradeStats/          ← Fertiger Ordner (ohne Installer verteilen)
      TradeStats.exe
      _internal/
        ...DLLs, Python-Libs, dist/ (Frontend)...
  TradeStats_Setup.exe   ← Windows-Installer
```

---

## Wie die App funktioniert (gebündelt)

```
Benutzer startet TradeStats.exe
    │
    ▼
Python-Runtime startet (eingebettet, kein System-Python nötig)
    │
    ├─► FastAPI-Backend  http://127.0.0.1:8000  (MT5-Sync-API)
    │
    ├─► Frontend-Server  http://127.0.0.1:8080  (React-App)
    │    └─ statische HTML/CSS/JS aus _internal/dist/
    │
    └─► Browser öffnet automatisch http://127.0.0.1:8080
```

---

## Bekannte Einschränkungen

- **MetaTrader5-Paket**: funktioniert nur wenn MT5 Terminal auf dem Ziel-PC installiert ist.
  Die App startet trotzdem; Live-Sync zeigt dann "nicht verbunden".
- **Einzel-Datei vs. Ordner**: Wir nutzen `--onedir` (Ordner + Installer), nicht `--onefile`.
  `--onefile` würde bei jedem Start alle Dateien entpacken (~5s Ladezeit).
- **Antivirus**: PyInstaller-Bundles können falsch-positive Virenscanner-Alarme auslösen.
  Bei Problemen: Code-Signierung mit einem Windows-Zertifikat.
- **Icon**: Für ein schönes `.ico`-Icon: `public/favicon.svg` → `.ico` konvertieren
  (z. B. https://convertio.co/svg-ico/) und in `tradestats.spec` + `installer.iss` eintragen.
