# TradeStats

> MT5-Trading-Journal mit Mentor-Modus — Web-App + lokaler Connector

[![Web-App](https://img.shields.io/badge/Web--App-tradestats--st.vercel.app-3b82f6)](https://tradestats-st.vercel.app/)
[![License](https://img.shields.io/badge/License-Private-orange)]()

TradeStats verbindet sich live mit deinem MetaTrader 5 Terminal und bietet ein
detailliertes Trading-Journal mit über 17 Analyse-Karten, AI-Coach,
Risiko-Analyse (MAE + Margin) und Equity-Prognose.

---

## 🚀 Schnellstart

1. **App öffnen**: <https://tradestats-st.vercel.app/>
2. **Connector herunterladen**: [TradeStats_Setup.exe](https://github.com/andribunte9-tech/Tradestats/releases/latest)
3. **Installieren** (~30 Sek) → MetaTrader 5 öffnen → Connector starten
4. **Browser neu laden** → Dashboard mit deinen Live-Trades

Voraussetzungen: **Windows 10/11** + **MetaTrader 5 Terminal** (Demo oder Live).

---

## ✨ Features

### Dashboard
- Equity-Kurve, monatlicher P&L, Drawdown, Hold-Time-Statistik
- Live-Sync mit MT5: offene Positionen, P&L pro Symbol
- Kategorien-Filter (Forex, Indizes, Commodities, …)
- Zeitfilter: 1T / 1W / 1M / 3M / 6M / 1J / Alles / Custom-Range
- Privacy-Modus für Screenshots

### Analyse (17 Karten)
- **AI-Coach**: Narrative-Einschätzung deiner Stärken & Schwächen
- **Pareto-Analyse**: welche Trades tragen 80 % deines P&L
- **Sizing-Konsistenz**: variierst du Risiko nach Verlusten? (Tilt-Indikator)
- **Konkurrierende Positionen**: Korrelations-Cluster aufdecken
- **Trading-Frequenz-Trend**: Overtrading-Erkennung
- **Ø Haltedauer pro Tag**: 7-Tage-Rolling, mit Monat/Jahr/Gesamt-Filter
- **MFE/MAE Capture-Rate**, **Recovery Factor**, **Ulcer Index**,
  **Risk-of-Ruin & Kelly**, **Tag-Kombi-Matrix**, **Konsistenz-Score**,
  **Equity-Prognose** mit realistischem Cap, **Mistake-Cost-Analyse**, u. v. m.
- Jede Karte hat Hover-Tooltips mit Erklärungen

### Risiko-Tab
- **Realisiertes Risiko (MAE)**: für Trader ohne festen SL — Ø MAE,
  95-Perzentil, Worst-Case, Recovery-Rate, Give-Back-Rate
- **Margin- & Exposure-Risiko**: durchschnittliche Margin-Belegung,
  Max-Concurrent, Liquidations-Move-Schätzung
- **Klassisches R-Modell**: für SL-basierte Trader
- **Tilt-Detektor**: Verhaltens-Vergleich nach Verlust-Serien

### Setup-Library + Tag-System
- Definiere wiederkehrende Trade-Setups mit Beschreibung
- Tagge Trades mit Setup + Mistakes (z. B. „FOMO", „Stop verschoben")
- Best-vs-Worst-Vergleich anhand der Tags

### Daily Journal + Kalender
- Tägliche Notizen mit Pre-/Post-Markt-Sektionen
- Monatskalender mit P&L pro Tag

### Profil + Export
- Mentor-Brief: druckbarer Wochenrückblick
- Bild-Export für Screenshots
- CSV-Import & -Export

---

## 🏗 Architektur

```
┌──────────────────────┐       ┌──────────────────────┐
│  React-Frontend      │       │  Python-Connector    │
│  (Vite + PWA)        │       │  (FastAPI + MT5)     │
│                      │       │                      │
│  → Vercel-Hosting    │ ←───→ │  → läuft lokal       │
│  → tradestats-st     │ HTTP  │     127.0.0.1:8000   │
│    .vercel.app       │       │                      │
└──────────────────────┘       └──────────────────────┘
                                          │
                                          ▼
                                  ┌──────────────────┐
                                  │  MetaTrader 5    │
                                  │  Terminal        │
                                  └──────────────────┘
```

Das Frontend lebt in der Cloud (auto-Updates beim git push).
Der Connector läuft auf deinem PC — er ist die einzige Brücke zur MT5-API.
Trade-Daten verlassen niemals deinen Rechner.

---

## 🛠 Entwicklung

Voraussetzungen: Node.js 18+, Python 3.11+, MetaTrader 5

```bash
# Frontend
npm install
npm run dev        # → http://localhost:5173

# Backend (in eigenem Terminal)
cd src/backend
pip install -r requirements.txt
python sync.py     # → http://localhost:8000
```

Beim Frontend-Dev gegen einen anderen Backend-Host:
```bash
echo "VITE_API_URL=http://otherhost:8000" > .env.local
npm run dev
```

### Windows-Installer bauen

```bash
# Voraussetzungen einmalig: PyInstaller + Inno Setup 6 installiert
build_exe.bat
```

→ produziert `release/TradeStats_Setup.exe`

---

## 📦 Releases

Siehe [Releases-Seite](https://github.com/andribunte9-tech/Tradestats/releases).

---

## 🔒 Privatsphäre

- **Trade-Daten bleiben lokal**: der Connector pusht nichts in die Cloud
- **Frontend-Hosting (Vercel)** sieht nur statische JS/CSS-Dateien
- **MT5-Login-Credentials** kennt nur dein MT5-Terminal selbst
