# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spider_XHS is a dual-stack project that reverse-engineers Xiaohongshu (Little Red Book / RED) platform APIs for data scraping, content publishing, and KOL discovery:

- **Python backend** (`apis/`, `xhs_utils/`, `main.py`) — HTTP API wrappers with signature algorithm execution via PyExecJS
- **Electron desktop app** (`desktop/`) — React + TypeScript GUI wrapping the same XHS APIs, reimplemented in Node.js/TypeScript

The Python and Electron codebases are **independent** — the Electron app does NOT call Python code. It reimplements the same API logic (signing, requests, standardization) in TypeScript.

See `AGENTS.md` for detailed Python conventions, import order, naming, and error handling patterns.

## Commands

### Python (root)

```bash
pip install -r requirements.txt    # Install Python dependencies
npm install                         # Install Node.js deps (crypto-js, jsdom for JS signature execution)
python main.py                      # Run the demo crawler — requires .env with COOKIES='...'
python -m compileall .              # Quick syntax check (no test suite exists)
```

### Electron Desktop App (`desktop/`)

```bash
cd desktop
pnpm install                        # Install all deps (pnpm 10.x required)
pnpm dev                            # Run dev mode with HMR (electron-vite dev)
pnpm build                          # Production build (electron-vite build)
pnpm typecheck                      # TypeScript type checking (tsc --noEmit)
pnpm package                        # Build + package into portable exe/zip (electron-builder)
```

The desktop app stores data alongside the executable: `$EXE_DIR/data/` (settings.json, tasks, static-cache).

## Architecture

### Python Backend Layers

```
main.py (Data_Spider — demo orchestrator)
  └─► apis/xhs_pc_apis.py (XHS_Apis — ~30 PC-side endpoint wrappers)
  └─► apis/xhs_creator_apis.py (XHS_Creator_Apis — creator platform upload/publish)
  └─► apis/xhs_pugongying_apis.py (PuGongYingAPI — KOL marketplace)
  └─► apis/xhs_qianfan_apis.py (QianFan API — distributor marketplace)
        │
        └─► xhs_utils/xhs_util.py — PC signature: calls static/xhs_main_260411.js via execjs
            xhs_utils/xhs_creator_util.py — Creator signature: calls static/xhs_creator_*.js
            xhs_utils/cookie_util.py — trans_cookies(): "k=v; k=v" → dict
            xhs_utils/common_util.py — .env loading, datas/ directory init
            xhs_utils/data_util.py — note/user normalization, Excel export, media download
```

**Signature flow**: Every API call goes through `generate_request_params()` (in `xhs_util.py`) which:
1. Executes `static/xhs_main_260411.js` via PyExecJS to compute `x-s`, `x-t`, `x-s-common` headers
2. Generates `x-b3-traceid` and `x-xray-traceid` (via `static/xhs_xray.js`)
3. Returns assembled headers + cookies + encoded data

**Return convention**: All API methods return `(success: bool, msg: str, data)` — never raise for network errors.

### Electron Desktop App Layers

```
desktop/
├── src/main/index.ts           # Electron main process — BrowserWindow, IPC handlers, menu
├── src/main/xhs-pc-api.ts      # TS reimplementation of PC-side XHS API + signature execution
├── src/main/task-manager.ts    # Task CRUD, lifecycle (pending→running→success/failed/cancelled)
├── src/main/settings-store.ts  # JSON-file settings persistence (accounts, proxy, paths)
├── src/main/data-standardizer.ts  # Data normalization (parity with Python data_util.py)
├── src/main/export-manager.ts  # Media download + Excel export for completed tasks
├── src/main/note-workbench.ts  # Batch note preview + download pipeline
├── src/main/data-path.ts       # Portable path helper: data/ alongside executable
├── src/preload/index.ts        # Context bridge: exposes desktopAPI to renderer via IPC
└── src/renderer/src/           # React 19 + Semi UI + Zustand SPA
    ├── App.tsx                 # Page router + theme + initial data load
    ├── stores/appStore.ts      # Zustand store: settings, tasks, templates, account, theme
    ├── types/index.ts          # CaptureMode, TaskFormState, helper functions
    └── pages/
        ├── Dashboard/          # Overview with greeting + task summary
        ├── NewTask/            # Task creation wizard (note/user/search/video modes)
        ├── Tasks/              # Task list, detail, retry/rerun/export/cancel
        ├── NoteWorkbench/      # Batch URL input → preview → bulk download
        └── Settings/           # Accounts, proxy, paths, theme management
```

**IPC architecture**: The renderer only accesses `window.desktopAPI` (defined in preload). The main process registers handlers via `ipcMain.handle()`. All XHS network requests happen in the main process — the renderer never makes direct HTTP calls.

**Signature execution in Electron**: Unlike Python's PyExecJS, the Electron app uses Node.js `createRequire` to load patched CommonJS versions of `static/xhs_main_260411.js` and `static/xhs_xray.js` (cached to `data/static-cache/`). The `crypto-js` require call is patched from `require("crypto-js")` to `globalThis.__desktopRequire("crypto-js")`.

### Key Static Assets (shared concept, separate execution)

| File | Purpose | Used by |
|------|---------|---------|
| `static/xhs_main_260411.js` | PC-side x-s/x-t/x-s-common signing | Python + Electron |
| `static/xhs_xray.js` | x-xray-traceid generation | Python + Electron |
| `static/xhs_xray_pack1.js`, `xhs_xray_pack2.js` | xray dependencies | Python + Electron |
| `static/xhs_creator_260411.js` | Creator platform signing | Python only |
| `static/xhs_creator_sign.js`, `*_signature.js`, `*_sign_other.js` | Creator signing variants | Python only |

### Data Flow (Desktop App)

```
User input (URL/keyword)
  → NewTask page creates task via task-manager
  → Task runs: calls xhs-pc-api.ts → fetches remote XHS APIs with signed headers
  → Raw response standardized via data-standardizer.ts
  → Result stored in task-manager's tasks.json
  → User exports: export-manager.ts downloads media + writes Excel
  → Settings stored in data/settings.json (portable, alongside exe)
```

## Cookie Handling

Two forms coexist across the codebase:
- `cookies_str`: raw cookie string (`"a1=...; webId=...; gid=..."`)
- `cookies`: parsed dict (`{"a1": "...", "webId": "..."}`)

The `a1` cookie value is the critical signing key — it's extracted from cookies and passed to the JS signature functions as the `a1` parameter.

## Desktop App: Task Lifecycle

Tasks follow a state machine: `pending → running → success | failed | cancelled`

- `runTask`: starts from scratch
- `retryTask`: re-runs only failed steps
- `rerunTask`: re-runs all steps, clearing previous results
- `reparseTask`: re-normalizes raw results without re-fetching (useful when standardization logic changes)
- `cancelTask`: sets cancelled status (only works on pending/running tasks)

## Desktop App: Accounts & Multi-Account

The app supports multiple XHS accounts. Each account stores its own `cookiesStr`. The "active account" is resolved for API calls unless an explicit `cookiesStr` override is passed. The preload's `resolveCookiesStr()` function implements the fallback chain: explicit parameter → active account → first account with cookies.

## Key Differences: Python vs Electron

- Python uses `requests` library; Electron uses `fetch()` (Node 20+ built-in)
- Python signature returns `(xs, xt, xs_common)`; the Electron port in `xhs-pc-api.ts` handles the same JS calls but patches the `crypto-js` import
- Python stores output to `datas/`; Electron stores to `$EXE_DIR/data/`
- Creator platform APIs exist **only in Python** (not yet ported to Electron)
- Login flows (QR code, SMS) exist **only in Python** (use `aiohttp` + `playwright`)
