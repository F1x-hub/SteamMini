# CLAUDE.md — SteamMini Project Guide

## Project Overview

**SteamMini** — desktop Steam client built with **Electron + Vite + Vanilla JS**. Manages game library, trading cards auto-farming, achievements (SAM-style), marketplace operations, and wishlist tracking. Windows-focused, dark-themed glassmorphism UI.

### Core Capabilities
- **Game Library** — browse owned games, search, sort (6 modes), filter installed
- **Auto-Farm** — two-phase card farming: warmup (up to 32 games to 2h) → sequential drops
- **Achievements** — unlock/lock via C# SAMBackend (Steamworks native API)
- **Trading Cards** — inventory viewer, bulk sell, bulk cancel listings, market history
- **Wishlist** — prices, discounts, ratings from Steam Store API
- **Key Activation** — redeem Steam keys from the app
- **Auto-Updater** — via `electron-updater` + GitHub Releases

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| **Desktop Shell** | Electron 40 (`contextIsolation: true`, `nodeIntegration: false`) |
| **Build Tool** | Vite 7 (dev server on port 3000, proxy to Steam APIs) |
| **Frontend** | Vanilla JavaScript (ES Modules, no framework) |
| **State Management** | Custom Pub/Sub Store (`store/index.js`) |
| **Routing** | Custom SPA Router (`router/index.js`, supports string + RegExp routes) |
| **Styling** | CSS Custom Properties (dark/light themes via `data-theme` attribute) |
| **Typography** | Inter (Google Fonts) |
| **i18n** | Custom I18nManager (`en`, `ru` dictionaries, `data-i18n` DOM attributes) |
| **Testing** | Vitest 4 + jsdom + @vitest/coverage-v8 (80% threshold) |
| **Crypto** | CryptoJS AES (encrypted localStorage for credentials) |
| **C# Backends** | SAMBackend (achievements), CardDropsBackend (badge parsing) |
| **Steam Libraries** | `steamcommunity`, `steamworks.js`, `vdf-parser` |
| **Packaging** | electron-builder → NSIS installer (x64 Windows) |

---

## Project Structure

```
SteamMini/
├── electron/                    # Main Process (Node.js)
│   ├── main.js                  # Entry point: IPC handlers, window, httpsGet, market logic
│   ├── preload.cjs              # Context Bridge: exposes `window.electronAuth` API
│   ├── auth/
│   │   ├── steamLogin.js        # Direct Steam login via BrowserWindow
│   │   └── egsLogin.js          # Epic Games Store login via BrowserWindow (persist:egs)
│   ├── idleManager.js           # Game idle process management (up to 32 concurrent)
│   ├── idleWorker.js            # Worker subprocess for maintaining "in-game" status
│   ├── achievementBridge.js     # IPC bridge to SAMBackend.exe (C#)
│   ├── cardsBridge.js           # IPC bridge to CardDropsBackend.exe (C#)
│   ├── recentGames.js           # Parse Steam's localconfig.vdf for recent games
│   ├── farmStats.js             # Farm statistics tracking (drops, time, sessions)
│   ├── farmSettings.js          # Persistent farm configuration (electron-store)
│   ├── egsClaimer.js            # EGS headless auto-claimer (iframe parsing & native clicks)
│   ├── notifications.js         # Native OS notifications (card drops, farm complete)
│   └── updater.cjs              # Auto-updater via electron-updater
│
├── src/                         # Renderer Process (Browser)
│   ├── main.js                  # App entry: layout, router setup, theme, cleanup
│   ├── api/
│   │   ├── steam.js             # Steam Web API client (proxied through Vite)
│   │   └── auth.js              # Auth API (credential management, login flows)
│   ├── components/
│   │   ├── topNav.js            # Top navigation bar with farm indicator badge
│   │   ├── titlebar.js          # Custom window titlebar (minimize/maximize/close)
│   │   ├── userPopup.js         # User profile popup
│   │   ├── profilePopup.js      # Extended profile popup
│   │   ├── dropdown.js          # Custom dropdown select component
│   │   ├── contextMenu.js       # Custom right-click context menu
│   │   ├── internalBrowser.js   # In-app browser (supports separate persist:steam/persist:egs partitions)
│   │   └── tooltip.js           # Tooltip component
│   ├── pages/
│   │   ├── library.js           # Game library: grid/list view, search, sorting, auto-farm
│   │   ├── gameDetail.js        # Game detail: achievements, cards, idle control
│   │   ├── cardsInventory.js    # Card inventory: bulk sell, listings, market history
│   │   ├── wishlist.js          # Wishlist with prices and discounts
│   │   ├── farmStats.js         # Farm statistics visualization
│   │   ├── farmSettings.js      # Farm configuration UI
│   │   ├── freeGames.js         # Free Games feed from EGS + GamerPower
│   │   └── login.js             # Login page (Steam, EGS)
│   ├── store/
│   │   └── index.js             # Pub/Sub state manager (Store class singleton)
│   ├── router/
│   │   └── index.js             # Custom SPA router (string + RegExp paths)
│   ├── utils/
│   │   ├── autoFarm.js          # Auto-farm algorithm (Phase 1: warmup, Phase 2: sequential)
│   │   ├── cache.js             # localStorage cache with TTL (default: 1 hour)
│   │   ├── storage.js           # AES-encrypted localStorage wrapper (CryptoJS)
│   │   ├── toast.js             # Toast notification system
│   │   └── jwt.js               # JWT decode utility
│   ├── styles/
│   │   ├── variables.css        # CSS design tokens (colors, spacing, typography)
│   │   └── global.css           # Global base styles
│   ├── i18n/
│   │   ├── index.js             # I18nManager class (language switching, DOM translation)
│   │   ├── en.json              # English translations
│   │   └── ru.json              # Russian translations
│   ├── services/                # (empty — reserved for future use)
│   └── tests/
│       ├── setup.ts             # Global mocks (electronAuth, localStorage, fake timers)
│       ├── mocks/
│       │   ├── games.mock.js    # Test game/card data fixtures
│       │   └── badgesHtml.mock.js # HTML fixtures for badge page parsing
│       ├── unit/
│       │   ├── autoFarm.test.js       # 20 tests: Auto-Farm phases and state
│       │   └── badgesParser.test.js   # 13 tests: HTML card parsing
│       ├── components/
│       │   └── topNav.test.js         # 10 tests: Farm indicator DOM
│       └── ipc/
│           └── idleManager.test.js    # 10 tests: IdleManager (node env)
│
├── csharp/                      # C# backends (compiled to /resources/)
│   ├── SAMBackend/              # Achievement manager (Steamworks API)
│   ├── SAM.API/                 # Shared Steamworks API wrapper
│   └── CardDropsBackend/        # Badge/card drop HTML parser
│
├── resources/                   # Compiled C# executables + steam_api64.dll
├── dist/                        # Vite production build output
├── dist_electron/               # electron-builder output (NSIS installer)
│
├── package.json                 # npm scripts, dependencies
├── vite.config.js               # Dev server config + Steam API proxies
├── vitest.config.ts             # Test config (jsdom, coverage thresholds)
├── electron-builder.yml         # Build/packaging config (NSIS, GitHub publish)
├── index.html                   # HTML entry point (Inter font, hls.js CDN)
├── index.js                     # Legacy/simple Electron entry (not used in prod)
└── DOCUMENTATION.md             # Detailed project documentation (Russian)
```

---

## Commands

```bash
# Development
npm run dev              # Build C# backends + start Vite (port 3000) + Electron concurrently

# Production build
npm run build            # Build C# + Vite bundle + electron-builder NSIS installer

# C# backends only
npm run build:csharp     # Build both SAMBackend and CardDropsBackend
npm run build:sam        # Build SAMBackend only
npm run build:cards      # Build CardDropsBackend only

# Testing
npm test                 # Run all tests once (vitest run)
npm run test:watch       # Watch mode
npm run test:ui          # Vitest browser UI
npm run test:cover       # Coverage report (80% lines/functions threshold)
```

> **Prerequisite**: .NET SDK must be installed for `build:csharp`. Steam client must be running for achievement/idle features.

---

## Architecture & Key Patterns

### Process Communication (Main ↔ Renderer)

```
Renderer (src/)  ──► window.electronAuth.xxx()
                      │
preload.cjs      ──► ipcRenderer.invoke('channel', data)
                      │
Main (electron/) ──► ipcMain.handle('channel', handler)
```

- **Strict isolation**: `contextIsolation: true`, `nodeIntegration: false`
- All Renderer→Main calls go through `window.electronAuth` (exposed via `contextBridge`)
- IPC uses `invoke`/`handle` (Promise-based) for requests, `send`/`on` for events

### IPC Channel Groups

| Group | Channels | Purpose |
|:---|:---|:---|
| **Auth** | `auth:steam-direct` | Login flows |
| **Steam** | `steam:fetch-html`, `steam:is-installed`, `steam:get-all-installed`, `steam:get-cover-url`, `steam:redeem-key`, `steam:get-wallet` | Steam data & local files |
| **Idle** | `idle:start`, `idle:stop`, `idle:stop-all`, `idle:active` | Game idle processes |
| **Achievements** | `achievements:load`, `achievements:unlock`, `achievements:lock`, `achievements:unlock-all`, `achievements:close` | SAM-style achievement management |
| **Cards** | `cards:get-all`, `cards:get-for-app`, `cards:debug*` | Card drop info via C# backend |
| **Inventory** | `inventory:get-cards` | Full inventory parsing |
| **Market** | `market:get-price`, `market:sell-item`, `market:auto-sell-batch`, `market:get-histogram`, `market:get-item-nameid`, `market:get-listings`, `market:cancel-listing`, `market:get-history`, `market:cancel-batch` | Marketplace operations |
| **Stats** | `stats:get`, `stats:record-drop`, `stats:end-session` | Farm statistics |
| **Settings** | `settings:get`, `settings:save` | Persistent settings |
| **Notifications** | `notify:card-drop`, `notify:all-received`, `notify:farm-complete` | OS notifications |
| **Updater** | `update:check`, `update:install` | Auto-update |
| **Window** | `window:minimize`, `window:maximize`, `window:close` | Window controls |

### State Management (Pub/Sub Store)

```javascript
import store from './store/index.js';

store.get('key');                    // Read state
store.set('key', value);             // Write + notify subscribers
store.update('key', { partial });    // Merge object + notify
store.subscribe('key', callback);    // Returns unsubscribe function
```

**State keys**: `user`, `isAuthenticated`, `auth`, `currentRoute`, `previousRoute`, `platform`, `theme`, `lang`, `farmConfig`, `profilePopupOpen`, `settingsOpen`, `isAuthLoading`

### Routing

```javascript
import router from './router/index.js';

router.add('/path', renderFunction);           // String match
router.add(/^\/game\/(.+)$/, (appId) => ...);  // RegExp with capture groups
router.navigate('/path');                       // Programmatic navigation
```

**Routes**: `/` → redirect to `/library`, `/library`, `/cards-inventory`, `/wishlist`, `/game/:appId`

**Cleanup**: Render functions can return `{ element, cleanup }` — cleanup is called on route change.

### Styling Conventions

- **CSS-in-JS**: Styles are embedded in component JS files via `document.createElement('style')`
- **Design tokens**: Use CSS custom properties from `variables.css` (`--color-bg-base`, `--color-accent-green`, `--shadow-md`, etc.). **Never use hardcoded hex colors or inline pixel values** if a token exists.
- **Aesthetic (Yin & Yang)**: The app uses a high-contrast dark theme (glassmorphism, balanced dark/light elements). All interactive elements must have `:hover`, `:focus-visible`, and `:active` (`transform: scale(0.97)`) states defined.
- **Theming**: `data-theme="dark"` (default) or `data-theme="light"` on `<html>`
- **No UI libraries**: All controls (dropdowns, menus, tooltips) are custom-built

### CORS Handling

Steam API calls from Renderer are proxied through Vite dev server (`vite.config.js`):

| Proxy Path | Target |
|:---|:---|
| `/api/steam/*` | `api.steampowered.com` |
| `/api/community/*` | `steamcommunity.com` |
| `/api/store/*` | `store.steampowered.com` |
| `/api/rates/*` | `open.er-api.com` |

In Main Process, authenticated requests use `net.fetch` (with session cookies) or raw `https.request`.

### Security

- **Tokens**: Encrypted in `localStorage` with AES (`CryptoJS`) via `utils/storage.js`
- **WebAPI Key**: Hardcoded in `src/api/steam.js` (`GLOBAL_API_KEY`) for universal access
- **Steam cookies**: Managed via Electron's session API; auto-refreshed via hidden BrowserWindow

---

## Key Files Reference

| File | Role |
|:---|:---|
| `electron/main.js` | **Central hub** — 1500+ lines, all IPC handlers, market logic, cookie management |
| `electron/preload.cjs` | **API surface** — defines every function available to Renderer via `window.electronAuth` |
| `src/main.js` | **App bootstrap** — layout, router, auth init, theme, global cleanup |
| `src/store/index.js` | **State** — Pub/Sub Store class with auth methods |
| `src/utils/autoFarm.js` | **Core feature** — two-phase auto-farm algorithm with stall detection |
| `src/api/steam.js` | **API client** — all Steam Web API calls (library, profile, wishlist, badges) |
| `src/pages/library.js` | **Main page** — game grid, search, 6 sort modes, farm controls |
| `src/pages/cardsInventory.js` | **Largest page** (84KB) — inventory, bulk sell, listings, market history |
| `src/pages/gameDetail.js` | **Game view** — achievements, cards, idle control, media |
| `src/styles/variables.css` | **Design tokens** — all color, spacing, typography variables |

---

## Common Tasks

### Adding a new page

1. Create `src/pages/myPage.js` exporting a `renderMyPage()` function that returns an `HTMLElement`
2. Register route in `src/main.js`: `router.add('/my-page', renderMyPage)`
3. Add navigation in `topNav.js` if needed
4. For cleanup on route change, return `{ element, cleanup: () => {...} }`

### Adding a new IPC channel

1. Add handler in `electron/main.js`: `ipcMain.handle('my:channel', async (_, args) => { ... })`
2. Expose in `electron/preload.cjs`: `myChannel: (args) => ipcRenderer.invoke('my:channel', args)`
3. Call from Renderer: `window.electronAuth.myChannel(args)`

### Adding a new UI component

1. Create `src/components/myComponent.js`
2. Export a factory function: `export function createMyComponent() { ... }`
3. Build DOM with `document.createElement` — no innerHTML for dynamic data
4. Embed styles via `document.createElement('style')` using CSS variables
5. Subscribe to store changes: `store.subscribe('key', callback)` — save unsubscribe for cleanup

### Adding translations

1. Add key-value in `src/i18n/en.json` and `src/i18n/ru.json`
2. Use in code: `import i18n from '../i18n/index.js'; i18n.t('key.subkey')`
3. Or in DOM: `<span data-i18n="key.subkey"></span>`

### Writing tests

1. Place test in `src/tests/unit/`, `src/tests/components/`, or `src/tests/ipc/`
2. Mock all external dependencies (`store`, `steamApi`, `electronAuth`, `child_process`)
3. One assertion focus per `test()` block
4. Reset singleton state in `beforeEach` (e.g., `resetAutoFarm(autoFarm)`)
5. Use `vi.advanceTimersByTime()` for timer-dependent tests (fake timers enabled globally)
6. IPC tests use `// @vitest-environment node` docblock

### Auto-Farm algorithm

- **Phase 1 (Warmup)**: Start up to `phase1_max_concurrent` (default 30) games simultaneously; wait until each accumulates `phase1_hours_threshold` (default 2.0h) of playtime
- **Phase 2 (Sequential)**: Run games one at a time; check for card drops every `phase2_restart_interval` (default 5 min); move to next game after `phase2_stall_timeout` (default 30 min) without drops

---

## Available Agent Skills

Skills are installed at `c:\Users\irakl\.agents\skills\` and extend Claude's capabilities for specialized tasks.

| Skill | When to Use |
|:---|:---|
| **find-skills** | Discover and install new skills from the ecosystem (`npx skills find [query]`) |
| **systematic-debugging** | **Any bug, test failure, or unexpected behavior** — root cause investigation before fixes (4 phases: investigate → pattern → hypothesis → implement) |
| **test-driven-development** | **Any feature or bugfix** — write failing test first, then minimal code (Red-Green-Refactor). Project uses Vitest. |
| **verification-before-completion** | Before claiming work is complete — run verification commands and confirm output |
| **frontend-design** | Building web UI components/pages with distinctive, production-grade aesthetics |
| **writing-plans** | Creating implementation plans before touching code (bite-sized TDD tasks) |
| **executing-plans** | Executing a written implementation plan with review checkpoints |
| **subagent-driven-development** | Executing plans with fresh subagent per task + two-stage review |
| **requesting-code-review** | After completing features or before merging — structured code review |
| **finishing-a-development-branch** | When implementation is complete — verify tests → present merge/PR options → cleanup |
| **using-git-worktrees** | Isolating feature work in git worktrees before implementation |
| **skill-creator** | Creating, testing, and optimizing new custom skills |
| **typescript-advanced-types** | Complex TypeScript type logic (generics, conditional types, mapped types) — *less relevant for this Vanilla JS project* |
| **vercel-react-best-practices** | React/Next.js performance optimization — *not applicable to this project* |

### Project-Relevant Skill Workflows

- **Debugging**: Use `systematic-debugging` → Phase 1 (root cause) → Phase 2 (pattern) → Phase 3 (hypothesis) → Phase 4 (failing test + fix via `test-driven-development`)
- **New features**: Use `writing-plans` → `executing-plans` or `subagent-driven-development` → `verification-before-completion` → `finishing-a-development-branch`
- **UI work**: Use `frontend-design` for creating distinctive, premium-quality interfaces matching the app's dark glassmorphism aesthetic
- **Code review**: Use `requesting-code-review` after completing each task or before merging

---

## Code Conventions

- **Module system**: ES Modules (`import`/`export`). Exception: `preload.cjs` and `updater.cjs` use CommonJS (required by Electron)
- **File naming**: `camelCase.js` (e.g., `autoFarm.js`, `gameDetail.js`)
- **Async**: Always `async`/`await`, no `.then()` chains
- **No frameworks**: Vanilla JS DOM manipulation via `createElement` + `innerHTML` for templates
- **Custom controls**: Replace native `<select>`, context menus with custom components to preserve dark theme
- **Console logging**: Prefixed with module name in brackets, e.g., `[Store]`, `[inventory]`, `[cover]`
- **Performance timing**: `timer(label)` utility in `electron/main.js` with emoji indicators (✅ <500ms, ⚠️ <2s, 🐢 slow)
- **Caching**: API responses cached in-memory (Main Process) and `localStorage` with TTL (Renderer)
- **Language**: Code in English, comments mixed English/Russian, `DOCUMENTATION.md` in Russian
