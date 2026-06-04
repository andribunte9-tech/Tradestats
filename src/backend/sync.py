"""
TradeStats - MT5 Real-Time Sync Backend
=========================================
FastAPI server that connects to a running MetaTrader 5 terminal (TMGM or any broker)
and exposes live positions + closed trade history via REST API on port 8000.

Im Produktions-Bundle (PyInstaller) dient dieses Script zusätzlich die
fertig gebauten Frontend-Dateien (dist/) auf Port 8080 und öffnet
automatisch den Browser.

Start (Entwicklung):
    cd src/backend
    pip install -r requirements.txt
    python sync.py

Endpoints:
    GET /status     -> connection info + account summary
    GET /positions  -> open positions with live P&L
    GET /history    -> closed trades (last 180 days)
    GET /health     -> simple health check
"""

import MetaTrader5 as mt5
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from datetime import datetime, timedelta, timezone
import threading
import time as time_module
import logging
import sys
import os
import http.server
import socketserver
import webbrowser
import subprocess
import json

# ── Pfade (funktioniert in Dev-Modus UND als PyInstaller-Bundle) ─────────
def _get_dist_path():
    """
    Gibt den Pfad zum gebauten Frontend zurück.
    - Im PyInstaller-Bundle: sys._MEIPASS/dist/
    - In der Entwicklung:    <projektroot>/dist/
    """
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'dist')
    # src/backend/ -> zwei Ebenen hoch = Projektroot
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(base, '..', '..', 'dist'))

DIST_PATH      = _get_dist_path()
FRONTEND_PORT  = 8080
IS_BUNDLED     = hasattr(sys, '_MEIPASS')

# Cloud-Frontend-URL — wird beim App-Start im Browser geöffnet.
# Override per Environment-Variable TRADESTATS_FRONTEND_URL möglich,
# z.B. für lokales Testen gegen einen Vite-Dev-Server.
FRONTEND_URL = os.environ.get(
    'TRADESTATS_FRONTEND_URL',
    'https://tradestats-st.vercel.app'
)
# Lokaler dist/-Server nur noch als Legacy-Fallback (wird nicht mehr gebundled).
HAS_LOCAL_FRONTEND = os.path.isdir(DIST_PATH)

# ── Log-Datei: %APPDATA%\TradeStats\app.log ───────────────────────────────
# Muss VOR basicConfig eingerichtet werden.
# WICHTIG: sys.stdout ist im PyInstaller-noconsole-Modus None →
#          StreamHandler darf nur hinzugefügt werden wenn stdout existiert.
_LOG_DIR  = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'TradeStats')
_LOG_FILE = os.path.join(_LOG_DIR, 'app.log')
try:
    os.makedirs(_LOG_DIR, exist_ok=True)
except Exception:
    # Fallback: Log neben der EXE
    _LOG_DIR  = os.path.dirname(os.path.abspath(sys.argv[0]))
    _LOG_FILE = os.path.join(_LOG_DIR, 'app.log')

_log_handlers: list = [logging.FileHandler(_LOG_FILE, encoding='utf-8', mode='a')]
if sys.stdout is not None:                       # im noconsole-Bundle ist stdout None
    _log_handlers.append(logging.StreamHandler(sys.stdout))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=_log_handlers,
)
log = logging.getLogger("tradestats")

# ── FastAPI ───────────────────────────────────────────────────────────────
APP_VERSION = "1.1.0"   # Single source of truth — auch in package.json + installer.iss spiegeln
app = FastAPI(title="TradeStats MT5 Sync", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Vite dev server + any local origin
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Shared in-memory state (updated by background thread) ─────────────────
state = {
    "connected":   False,
    "account":     None,
    "positions":   [],
    "history":     [],
    "last_update": None,
    "error":       None,
}

POLL_INTERVAL = 10   # seconds
HISTORY_DAYS  = 180  # days of history to load

# ── MFE/MAE Tracking ──────────────────────────────────────────────────────
# In-memory: live high/low watermarks per OPEN position id
mfe_mae_live = {}      # { position_id: { 'mfe': float, 'mae': float, 'lastUpdate': iso } }

# Persistent archive — wird in %APPDATA%\TradeStats\ gespeichert, NICHT im
# Installations-Ordner. So überleben die Daten ein App-Update / Re-Install.
_MFE_FILE_NEW = os.path.join(_LOG_DIR, 'mfe_mae_archive.json')
# Legacy-Pfad: alte Versionen speicherten neben sync.py. Beim ersten Start nach
# Update wird die Datei automatisch in den AppData-Ordner migriert.
_MFE_FILE_LEGACY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mfe_mae_archive.json')
_MFE_FILE = _MFE_FILE_NEW

def _migrate_mfe_archive():
    """Verschiebt die alte mfe_mae_archive.json aus dem App-Ordner nach
    %APPDATA%\\TradeStats\\, falls sie dort noch liegt. Idempotent."""
    log = logging.getLogger(__name__)
    if os.path.isfile(_MFE_FILE_NEW):
        # Neue Datei existiert schon — wir lassen die Legacy-Datei in Ruhe
        return
    if os.path.isfile(_MFE_FILE_LEGACY):
        try:
            os.makedirs(_LOG_DIR, exist_ok=True)
            import shutil
            shutil.copy2(_MFE_FILE_LEGACY, _MFE_FILE_NEW)
            log.info(f"MFE/MAE archive migrated: {_MFE_FILE_LEGACY} -> {_MFE_FILE_NEW}")
        except Exception as e:
            log.warning(f"MFE/MAE archive migration failed: {e}")

_migrate_mfe_archive()

def _load_mfe_archive():
    try:
        if os.path.isfile(_MFE_FILE):
            with open(_MFE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        log = logging.getLogger(__name__)
        log.warning(f"MFE/MAE archive load failed: {e}")
    return {}

_MFE_LIVE_FILE = os.path.join(_LOG_DIR, 'mfe_mae_live.json')

def _load_mfe_live():
    """Lädt die Live-Watermarks vom letzten Backend-Lauf, damit ein Restart
    nicht die laufende MFE/MAE-Historie der offenen Positionen wegwirft."""
    try:
        if os.path.isfile(_MFE_LIVE_FILE):
            with open(_MFE_LIVE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        log = logging.getLogger(__name__)
        log.warning(f"MFE/MAE live load failed: {e}")
    return {}

def _save_mfe_live(live):
    try:
        with open(_MFE_LIVE_FILE, 'w', encoding='utf-8') as f:
            json.dump(live, f, indent=2)
    except Exception as e:
        log = logging.getLogger(__name__)
        log.warning(f"MFE/MAE live save failed: {e}")

def _save_mfe_archive(archive):
    try:
        with open(_MFE_FILE, 'w', encoding='utf-8') as f:
            json.dump(archive, f, indent=2)
    except Exception as e:
        log = logging.getLogger(__name__)
        log.warning(f"MFE/MAE archive save failed: {e}")

mfe_mae_archive = _load_mfe_archive()
# Live-Watermarks aus dem letzten Lauf wiederherstellen (überlebt Backend-Restart).
mfe_mae_live = _load_mfe_live()

# ── Broker Timezone ───────────────────────────────────────────────────────
# TMGM/MT5 Broker verwendet UTC+3 (EET - Eastern European Time).
# Die rohen MT5-Timestamps sind in Broker-Lokalzeit (UTC+3), NICHT in UTC.
# Wir subtrahieren den Offset, um echte UTC-Timestamps zu erhalten.
BROKER_UTC_OFFSET = 3   # Stunden — PUPrime server time = UTC+3 (EEST, DST)
                        # MT5 liefert Deal-Zeiten als Broker-Server-Zeit, getarnt als Unix-UTC-Timestamp.
                        # Daher müssen wir beim Speichern den Offset abziehen UND beim Abfragen
                        # das Query-Fenster um diesen Offset nach vorne erweitern.


# ─────────────────────────────────────────────────────────────────────────
#  Converters
# ─────────────────────────────────────────────────────────────────────────
def ts_to_iso(ts):
    """MT5 Deal-Timestamp -> ISO 8601 UTC string.

    MT5 liefert Timestamps in Broker-Server-Zeit, gespeichert als Unix-Timestamp
    (d.h. die Zahl entspricht dem Datum/Uhrzeit der Broker-Wallclock, NICHT echtem UTC).
    Wir ziehen den BROKER_UTC_OFFSET ab um echtes UTC zu erhalten.
    """
    if not ts:
        return None
    true_utc_ts = ts - (BROKER_UTC_OFFSET * 3600)
    return datetime.fromtimestamp(true_utc_ts, tz=timezone.utc).isoformat()


def account_dict(a):
    return {
        "login":       a.login,
        "server":      a.server,
        "name":        a.name,
        "balance":     round(a.balance, 2),
        "equity":      round(a.equity, 2),
        "margin":      round(a.margin, 2),
        "marginFree":  round(a.margin_free, 2),
        "marginLevel": round(a.margin_level, 2) if a.margin_level else 0,
        "currency":    a.currency,
        "leverage":    a.leverage,
        "profit":      round(a.profit, 2),
    }


# ─────────────────────────────────────────────────────────────────────────
#  Map open positions -> TradeStats trade format
# ─────────────────────────────────────────────────────────────────────────
def map_positions(raw):
    if not raw:
        return []
    result = []
    for p in raw:
        is_buy     = (p.type == mt5.POSITION_TYPE_BUY)
        trade_type = "BUY" if is_buy else "SELL"
        net_pnl    = p.profit + getattr(p, "commission", 0.0) + getattr(p, "swap", 0.0)
        pips       = (p.price_current - p.price_open) * (1 if is_buy else -1)
        result.append({
            "id":           f"pos-{p.ticket}",
            "ticket":       p.ticket,
            "symbol":       p.symbol,
            "type":         trade_type,
            "volume":       p.volume,
            "openPrice":    p.price_open,
            "currentPrice": p.price_current,
            "openTime":     ts_to_iso(p.time),
            "closeTime":    None,
            "sl":           p.sl,
            "tp":           p.tp,
            "commission":   getattr(p, "commission", 0.0),
            "swap":         getattr(p, "swap", 0.0),
            "profit":       round(p.profit, 2),
            "netPnl":       round(net_pnl, 2),
            "pips":         round(pips, 5),
            "notes":        "",
            "tags":         [],
            "isOpen":       True,
        })
    return result


# ─────────────────────────────────────────────────────────────────────────
#  Map MT5 deals -> TradeStats closed trade format
#  Groups deals by position_id, pairs ENTRY + EXIT deals
# ─────────────────────────────────────────────────────────────────────────
def map_history_deals(deals):
    if not deals:
        return []

    by_pos = {}
    for d in deals:
        pid = d.position_id
        if pid not in by_pos:
            by_pos[pid] = {"entries": [], "exits": []}
        if d.entry == mt5.DEAL_ENTRY_IN:
            by_pos[pid]["entries"].append(d)
        elif d.entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY):
            by_pos[pid]["exits"].append(d)
        elif d.entry == mt5.DEAL_ENTRY_INOUT:
            by_pos[pid]["entries"].append(d)
            by_pos[pid]["exits"].append(d)

    trades = []
    for pid, pair in by_pos.items():
        exits = pair["exits"]
        if not exits:
            continue  # still open

        out     = max(exits, key=lambda d: d.time)
        entries = pair["entries"]
        inp     = min(entries, key=lambda d: d.time) if entries else None

        if inp:
            # DEAL_TYPE_BUY=0 -> bought to open -> BUY trade
            trade_type = "BUY"  if inp.type == mt5.DEAL_TYPE_BUY else "SELL"
            open_price = inp.price
            open_time  = ts_to_iso(inp.time)
            volume     = inp.volume
            commission = round((getattr(inp, "commission", 0) or 0) + (getattr(out, "commission", 0) or 0), 2)
        else:
            # Infer from exit (inverted - exit BUY means we closed a SELL)
            trade_type = "SELL" if out.type == mt5.DEAL_TYPE_BUY else "BUY"
            open_price = 0.0
            open_time  = ts_to_iso(out.time)
            volume     = out.volume
            commission = round(getattr(out, "commission", 0) or 0, 2)

        trades.append({
            "id":         f"mt5-{pid}",   # stable ID based on position_id
            "ticket":     pid,
            "symbol":     out.symbol,
            "type":       trade_type,
            "volume":     volume,
            "openPrice":  open_price,
            "closePrice": out.price,
            "openTime":   open_time,
            "closeTime":  ts_to_iso(out.time),
            "sl":         0.0,
            "tp":         0.0,
            "commission": commission,
            "swap":       round(getattr(out, "swap", 0) or 0, 2),
            "profit":     round(out.profit, 2),
            "notes":      "",
            "tags":       [],
            "isOpen":     False,
        })

    return sorted(trades, key=lambda t: t["closeTime"] or "", reverse=True)


# ─────────────────────────────────────────────────────────────────────────
#  MT5 connection
# ─────────────────────────────────────────────────────────────────────────
def connect_mt5():
    if not mt5.initialize():
        state["error"]     = f"mt5.initialize() fehlgeschlagen: {mt5.last_error()}"
        state["connected"] = False
        log.warning(state["error"])
        return False

    a = mt5.account_info()
    if a is None:
        state["error"]     = "MT5 verbunden aber Account-Info nicht verfuegbar."
        state["connected"] = False
        log.warning(state["error"])
        return False

    state["connected"] = True
    state["error"]     = None
    state["account"]   = account_dict(a)
    log.info(f"MT5 verbunden | {a.server} | Login: {a.login} | {a.balance} {a.currency}")
    return True


# ─────────────────────────────────────────────────────────────────────────
#  Background polling thread
# ─────────────────────────────────────────────────────────────────────────
def polling_loop():
    log.info(f"Polling-Thread gestartet (alle {POLL_INTERVAL}s | {HISTORY_DAYS} Tage History)")
    while True:
        try:
            if not state["connected"]:
                if not connect_mt5():
                    time_module.sleep(POLL_INTERVAL)
                    continue

            if mt5.terminal_info() is None:
                log.warning("MT5 Terminal getrennt - reconnecting...")
                mt5.shutdown()
                state["connected"] = False
                time_module.sleep(POLL_INTERVAL)
                continue

            # Update account
            a = mt5.account_info()
            if a:
                state["account"] = account_dict(a)

            # Open positions
            state["positions"] = map_positions(mt5.positions_get())

            # ── MFE/MAE: track high/low watermark per open position ───────
            #  - mfe/mae:           historisches Max/Min P&L (in $) seit Position-Open
            #  - mfePrice/maePrice: Preis zum Zeitpunkt des Peaks/Tiefpunkts
            #
            # Die Preise sind die zuverlässigere Quelle für das Frontend:
            # P&L driftet bei langen Positionen durch Swap/Commission, der Preis
            # bleibt unabhängig stabil. Frontend nutzt daher mfePrice/maePrice,
            # falls vorhanden — $-Werte sind nur Anzeige/Anekdote.
            now_iso = datetime.now(timezone.utc).isoformat()
            live_ids = set()
            for p in state["positions"]:
                pid = p.get("id")
                if not pid:
                    continue
                live_ids.add(pid)
                pnl    = (p.get("profit") or 0) + (p.get("swap") or 0) + (p.get("commission") or 0)
                price  = p.get("currentPrice")
                is_buy = (p.get("type") == "BUY")
                rec = mfe_mae_live.get(pid)
                if not rec:
                    mfe_mae_live[pid] = {
                        "mfe": pnl, "mae": pnl,
                        "mfePrice": price, "maePrice": price,
                        "openTime":   p.get("openTime"),
                        "lastUpdate": now_iso,
                    }
                else:
                    # Favorable bei BUY = höherer Preis, bei SELL = niedrigerer Preis.
                    favorable_price  = (price > rec.get("mfePrice", price)) if is_buy else (price < rec.get("mfePrice", price))
                    adverse_price    = (price < rec.get("maePrice", price)) if is_buy else (price > rec.get("maePrice", price))
                    if pnl > rec["mfe"]:
                        rec["mfe"] = pnl
                    if favorable_price or rec.get("mfePrice") is None:
                        rec["mfePrice"] = price
                    if pnl < rec["mae"]:
                        rec["mae"] = pnl
                    if adverse_price or rec.get("maePrice") is None:
                        rec["maePrice"] = price
                    rec["lastUpdate"] = now_iso

            # Persist live watermarks (so a Backend-Restart doesn't wipe history)
            _save_mfe_live(mfe_mae_live)

            # Detect closed positions → move watermarks to persistent archive
            for pid in list(mfe_mae_live.keys()):
                if pid not in live_ids:
                    # MT5 position id (e.g. "pos-44892961") maps to history id "mt5-44892961"
                    ticket = pid.replace("pos-", "")
                    archive_key = f"mt5-{ticket}"
                    mfe_mae_archive[archive_key] = {
                        "mfe": round(mfe_mae_live[pid]["mfe"], 2),
                        "mae": round(mfe_mae_live[pid]["mae"], 2),
                        "mfePrice": mfe_mae_live[pid].get("mfePrice"),
                        "maePrice": mfe_mae_live[pid].get("maePrice"),
                        "openTime": mfe_mae_live[pid]["openTime"],
                        "closedAt": now_iso,
                    }
                    del mfe_mae_live[pid]
                    _save_mfe_archive(mfe_mae_archive)
                    log.info(f"MFE/MAE archived for {archive_key}: MFE={mfe_mae_archive[archive_key]['mfe']}, MAE={mfe_mae_archive[archive_key]['mae']}")

            # Closed history
            # IMPORTANT: MT5 reports deal.time as broker server time stored as
            # Unix-UTC label (not real UTC). For PUPrime in EEST that's +3h ahead.
            # To capture today's deals we MUST extend dt_to by the broker offset,
            # otherwise deals closed today get filtered out (their d.time looks
            # like the future from our perspective).
            dt_to   = datetime.now(timezone.utc) + timedelta(hours=BROKER_UTC_OFFSET, seconds=30)
            dt_from = dt_to - timedelta(days=HISTORY_DAYS)
            state["history"] = map_history_deals(mt5.history_deals_get(dt_from, dt_to))

            state["last_update"] = datetime.now(timezone.utc).isoformat()
            state["error"]       = None

            log.info(
                f"Poll OK | Pos: {len(state['positions'])} | "
                f"History: {len(state['history'])} | "
                f"Equity: {a.equity if a else '?'} {a.currency if a else ''}"
            )

        except Exception as exc:
            log.error(f"Polling-Fehler: {exc}", exc_info=True)
            state["error"]     = str(exc)
            state["connected"] = False

        time_module.sleep(POLL_INTERVAL)


# ─────────────────────────────────────────────────────────────────────────
#  Endpoints
# ─────────────────────────────────────────────────────────────────────────
@app.get("/status")
def get_status():
    return {
        "connected":  state["connected"],
        "account":    state["account"],
        "lastUpdate": state["last_update"],
        "error":      state["error"],
        "posCount":   len(state["positions"]),
        "histCount":  len(state["history"]),
    }

@app.get("/positions")
def get_positions():
    return {
        "connected": state["connected"],
        "positions": state["positions"],
        "count":     len(state["positions"]),
        "timestamp": state["last_update"],
    }

@app.get("/history")
def get_history():
    return {
        "connected": state["connected"],
        "trades":    state["history"],
        "count":     len(state["history"]),
        "timestamp": state["last_update"],
    }

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/version")
def version():
    """Aktuelle Backend-Version + Plattform-Info.
    Vom Frontend genutzt für den Update-Check-Banner."""
    return {
        "version": APP_VERSION,
        "platform": sys.platform,
        "python":   f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
    }

@app.get("/mfe-mae")
def get_mfe_mae():
    """
    Return MFE/MAE archive for all closed positions tracked by this backend,
    PLUS the live watermarks for currently open positions.
    Frontend correlates by trade id (mt5-<ticket>).
    """
    return {
        "archive": mfe_mae_archive,
        "live":    {f"mt5-{pid.replace('pos-', '')}": rec for pid, rec in mfe_mae_live.items()},
    }

@app.post("/sync")
def force_sync():
    """
    Force an immediate refresh of positions + history from MT5.
    Bypasses the 10s polling interval. Reconnects to MT5 first to force
    the terminal to flush its local history cache — necessary because the
    MT5 Python API otherwise serves stale cached deals (today's trades
    can be missing for minutes after they close).
    """
    try:
        # Hard reconnect to flush the MT5 history cache.
        try:
            mt5.shutdown()
        except Exception:
            pass
        if not mt5.initialize():
            state["connected"] = False
            return {"ok": False, "error": f"mt5.initialize fehlgeschlagen: {mt5.last_error()}", "histCount": len(state["history"])}

        a = mt5.account_info()
        if a is None:
            state["connected"] = False
            return {"ok": False, "error": "MT5 verbunden aber Account-Info nicht verfügbar", "histCount": len(state["history"])}
        state["connected"] = True
        state["account"]   = account_dict(a)

        state["positions"] = map_positions(mt5.positions_get())
        dt_to   = datetime.now(timezone.utc) + timedelta(hours=BROKER_UTC_OFFSET, seconds=30)
        dt_from = dt_to - timedelta(days=HISTORY_DAYS)
        state["history"]     = map_history_deals(mt5.history_deals_get(dt_from, dt_to))
        state["last_update"] = datetime.now(timezone.utc).isoformat()
        state["error"]       = None
        log.info(f"Force-sync OK | Pos: {len(state['positions'])} | History: {len(state['history'])}")
        return {
            "ok":        True,
            "posCount":  len(state["positions"]),
            "histCount": len(state["history"]),
            "timestamp": state["last_update"],
        }
    except Exception as exc:
        log.error(f"Force-sync Fehler: {exc}", exc_info=True)
        return {"ok": False, "error": str(exc), "histCount": len(state["history"])}


# ─────────────────────────────────────────────────────────────────────────
#  Eingebetteter Frontend-HTTP-Server (nur wenn dist/ vorhanden)
# ─────────────────────────────────────────────────────────────────────────
class _SPAHandler(http.server.SimpleHTTPRequestHandler):
    """
    Statischer Datei-Server mit SPA-Fallback:
    Existiert eine Datei nicht, wird index.html zurückgegeben (React Router).
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_PATH, **kwargs)

    def do_GET(self):
        # Pfad ohne Query-String
        rel = self.path.split('?')[0].lstrip('/')
        fpath = os.path.join(DIST_PATH, rel)
        # Falls Datei nicht existiert → SPA-Fallback auf index.html
        if rel and not os.path.isfile(fpath):
            self.path = '/index.html'
        super().do_GET()

    def log_message(self, *args):
        pass  # HTTP-Access-Log unterdrücken


class _ReuseServer(socketserver.TCPServer):
    allow_reuse_address = True


def _start_frontend_server():
    """Startet den eingebetteten Frontend-Server auf Port 8080."""
    if not os.path.isdir(DIST_PATH):
        log.info("dist/ nicht gefunden – Frontend-Server nicht gestartet (Entwicklungs-Modus)")
        return
    try:
        with _ReuseServer(('127.0.0.1', FRONTEND_PORT), _SPAHandler) as httpd:
            log.info(f"Frontend-Server läuft auf http://127.0.0.1:{FRONTEND_PORT}")
            httpd.serve_forever()
    except OSError as e:
        log.warning(f"Frontend-Server konnte nicht starten (Port {FRONTEND_PORT} belegt?): {e}")


def _open_browser():
    """Öffnet den Browser 3 Sekunden nach dem Start (nur im Bundle).
    Standardmäßig die Cloud-Vercel-URL — fällt auf den lokalen Legacy-
    Frontend-Server zurück, wenn dist/ noch gebundelt ist (Abwärtskompat)."""
    time_module.sleep(3.0)
    if HAS_LOCAL_FRONTEND:
        url = f'http://127.0.0.1:{FRONTEND_PORT}'
    else:
        url = FRONTEND_URL
    log.info(f"webbrowser.open({url})")
    try:
        webbrowser.open(url)
        log.info("Browser erfolgreich geöffnet")
    except Exception as exc:
        log.error(f"webbrowser.open fehlgeschlagen: {exc}")


# ─────────────────────────────────────────────────────────────────────────
#  Startup
# ─────────────────────────────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    log.info("FastAPI on_startup() – Hintergrund-Threads starten...")
    # MT5 Polling Thread
    threading.Thread(target=polling_loop, daemon=True, name="mt5-poll").start()
    # Frontend-Server (statische Dateien auf Port 8080)
    threading.Thread(target=_start_frontend_server, daemon=True, name="frontend-srv").start()
    log.info("on_startup() abgeschlossen")


# ─────────────────────────────────────────────────────────────────────────
#  Single-Instance & Port-Cleanup Helpers
# ─────────────────────────────────────────────────────────────────────────
def _kill_port(port):
    """Beendet alle Prozesse die auf port lauschen (Windows netstat + taskkill)."""
    try:
        result = subprocess.run(
            ['netstat', '-ano'],
            capture_output=True, text=True, timeout=10
        )
        pids = set()
        for line in result.stdout.splitlines():
            if f':{port} ' in line and 'LISTENING' in line:
                parts = line.split()
                if parts:
                    pids.add(parts[-1])
        for pid in pids:
            if pid == '0':
                continue
            try:
                subprocess.run(['taskkill', '/F', '/PID', pid],
                               capture_output=True, timeout=5)
                log.info(f"Port {port}: Prozess PID {pid} beendet")
            except Exception as e:
                log.warning(f"Port {port}: PID {pid} konnte nicht beendet werden: {e}")
    except Exception as e:
        log.warning(f"_kill_port({port}) fehlgeschlagen: {e}")


def _is_already_running():
    """
    Prüft ob Port 8000 bereits aktiv ist (= eine Instanz läuft bereits).
    Socket-Connect ist zuverlässiger als PID-Dateien im frozen-Bundle.
    Gibt True zurück wenn eine andere Instanz läuft.
    """
    import socket
    try:
        with socket.create_connection(('127.0.0.1', 8000), timeout=1.0):
            return True   # Verbindung erfolgreich → Port belegt → App läuft bereits
    except OSError:
        return False      # Verbindung fehlgeschlagen → Port frei → erster Start


if __name__ == "__main__":
    import traceback
    import subprocess

    is_frozen = getattr(sys, 'frozen', False)

    try:
        # ── Single-Instance-Check via Socket ─────────────────────────────
        # Einfachste und zuverlässigste Methode im frozen Bundle:
        # Wenn Port 8000 bereits antwortet läuft die App schon.
        if _is_already_running():
            log.info("Port 8000 bereits belegt – App läuft bereits. Browser öffnen und beenden.")
            try:
                url = f'http://127.0.0.1:{FRONTEND_PORT}' if HAS_LOCAL_FRONTEND else FRONTEND_URL
                webbrowser.open(url)
            except Exception:
                pass
            sys.exit(0)

        # ── Port-Cleanup ──────────────────────────────────────────────────
        log.info("Port-Cleanup: alte Prozesse auf Port 8000 und 8080 beenden...")
        _kill_port(8000)
        _kill_port(8080)
        time_module.sleep(0.5)  # kurz warten bis Ports freigegeben sind

        # ── Startup-Banner ins Log ────────────────────────────────────────
        log.info("=" * 60)
        log.info("TradeStats startet")
        log.info(f"  frozen   : {is_frozen}")
        log.info(f"  _MEIPASS : {getattr(sys, '_MEIPASS', 'n/a')}")
        log.info(f"  dist     : {DIST_PATH}  (exists={os.path.isdir(DIST_PATH)})")
        log.info(f"  log-file : {_LOG_FILE}")
        log.info("=" * 60)

        # ── Windows / PyInstaller Voraussetzungen ─────────────────────────
        if sys.platform == 'win32':
            import asyncio, multiprocessing
            multiprocessing.freeze_support()
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
            log.info("WindowsSelectorEventLoopPolicy gesetzt")

        # ── Browser-Thread VOR uvicorn.run() starten ──────────────────────
        # uvicorn.run() blockiert den Haupt-Thread. Der Browser-Thread
        # schläft 3 s und öffnet dann den Browser – uvicorn ist dann bereit.
        if is_frozen:
            threading.Thread(target=_open_browser, daemon=True, name="browser-open").start()
            log.info("Browser-Thread gestartet (öffnet http://127.0.0.1:8080 in 3 s)")

        # ── uvicorn starten ───────────────────────────────────────────────
        # log_config=None verhindert den isatty()-Crash wenn stdout=None ist.
        run_kwargs = dict(
            host="127.0.0.1",
            port=8000,
            reload=False,
            log_level="info",
            log_config=None if is_frozen else None,
        )
        log.info("uvicorn.run() wird aufgerufen ...")
        uvicorn.run(app, **run_kwargs)

    except Exception:
        # ── Kritischer Fehler → vollständiger Traceback ins Log ──────────
        err = traceback.format_exc()
        log.error(f"KRITISCHER FEHLER beim Start:\n{err}")
        # Direkter Datei-Schreiber als letzte Absicherung falls Logger selbst versagt
        try:
            with open(_LOG_FILE, 'a', encoding='utf-8') as _f:
                _f.write(f"\n[CRASH {datetime.now().isoformat()}]\n{err}\n")
        except Exception:
            pass
