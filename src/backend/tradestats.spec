# -*- mode: python ; coding: utf-8 -*-
#
# TradeStats – PyInstaller Spec
# Ausführen: pyinstaller --clean tradestats.spec
#            (aus dem Verzeichnis src/backend/)
#
# Voraussetzung: dist/ wurde vorher per "npm run build" + xcopy erstellt
# (passiert automatisch durch build_exe.bat im Projektroot)

block_cipher = None

a = Analysis(
    ['sync.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        # Vite-Build (muss vorher nach src/backend/dist/ kopiert werden)
        ('dist', 'dist'),
    ],
    hiddenimports=[
        # uvicorn braucht diese – werden nicht automatisch erkannt
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # FastAPI / Starlette internals
        'anyio',
        'anyio._backends._asyncio',
        'starlette.routing',
        'starlette.middleware.cors',
        'fastapi',
        'fastapi.middleware.cors',
        # MetaTrader5
        'MetaTrader5',
        # ── numpy ────────────────────────────────────────────────────────────
        # numpy._core.multiarray failed to import ist ein bekanntes PyInstaller-
        # Problem: Die internen C-Extensions werden nicht automatisch gefunden.
        'numpy',
        'numpy._core',
        'numpy._core.multiarray',
        'numpy._core._multiarray_umath',
        'numpy._core._multiarray_umath',
        'numpy._core._exceptions',
        'numpy._core._methods',
        'numpy._core._type_aliases',
        'numpy._core._ufunc_config',
        'numpy._core.numerictypes',
        'numpy._core.numeric',
        'numpy._core.fromnumeric',
        'numpy._core.arrayprint',
        'numpy._core.defchararray',
        'numpy._core.records',
        'numpy._core.memmap',
        'numpy._core.function_base',
        'numpy._core.getlimits',
        'numpy._core.shape_base',
        'numpy._core.einsumfunc',
        'numpy._core.overrides',
        'numpy._core._asarray',
        'numpy._core._dtype',
        'numpy._core._dtype_ctypes',
        'numpy._core._internal',
        'numpy._core.strings',
        'numpy.core',
        'numpy.core.multiarray',
        'numpy.core._multiarray_umath',
        'numpy.core.numeric',
        'numpy.core.fromnumeric',
        'numpy.core.numerictypes',
        'numpy.core.umath',
        'numpy.lib',
        'numpy.lib.stride_tricks',
        'numpy.lib.mixins',
        'numpy.lib.npyio',
        'numpy.linalg',
        'numpy.fft',
        'numpy.random',
        'numpy.ctypeslib',
        'numpy.ma',
        'numpy.ma.core',
        'numpy.ma.extras',
        'numpy.matrixlib',
        'numpy.matrixlib.defmatrix',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Nicht benötigt, reduziert Bundle-Größe
        # ACHTUNG: numpy hier NICHT eintragen – MetaTrader5 braucht es!
        'tkinter',
        'matplotlib',
        'pandas',
        'scipy',
        'PIL',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='TradeStats',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,       # Kein Konsolenfenster beim Start
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # Icon: muss eine .ico-Datei sein (convert favicon.svg -> favicon.ico)
    # icon='..\\..\\public\\favicon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='TradeStats',
)
