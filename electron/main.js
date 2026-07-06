// Load .env in development; in production .env is bundled into extraResources
// Must use createRequire since this file is ESM ("type": "module")
import { createRequire as _dotenvRequire } from 'module';

{
  const _req = _dotenvRequire(import.meta.url);
  const _dotenv = _req('dotenv');
  const _nodePath = _req('path');
  // app.isPackaged is the canonical way to detect production in Electron
  const _electronApp = _req('electron').app;
  if (_electronApp.isPackaged) {
    // In production, .env resides in extraResources (next to the app)
    _dotenv.config({ path: _nodePath.join(process.resourcesPath, '.env') });
  } else {
    _dotenv.config(); // loads .env from project root in development
  }
}

import { initLogger } from './logger.js';
initLogger();

import { app, BrowserWindow, ipcMain, net, session, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as idleManager from './idleManager.js';
import achievementBridge from './achievementBridge.js';
import cardsBridge from './cardsBridge.js';
import { getLocalConfigPathExported } from './recentGames.js';
import { refreshSteamCookies, steamFetchWithRetry, httpsGet } from './utils/helpers.js';
import { ensureSteamSession, setupAutoRefresh } from './auth/silentRefresh.js';
import { registerHltbHandlers } from './ipc/hltb.js';
import { registerBacklogCacheHandlers } from './ipc/backlogCache.js';

// IPC Modules
import { register as registerInventory }    from './ipc/inventory.js';
import { register as registerMarket }       from './ipc/market.js';
import { register as registerSteam, invalidateRecentGamesCache } from './ipc/steam.js';
import { register as registerWindow }       from './ipc/window.js';
import { register as registerAuth }         from './ipc/auth.js';
import { register as registerCards }        from './ipc/cards.js';
import { register as registerAchievements } from './ipc/achievements.js';
import { register as registerIdle }         from './ipc/idle.js';
import { register as registerStats }        from './ipc/stats.js';
import { register as registerFreeGames, startFreeGamesPolling } from './ipc/freeGames.js';
import { registerReportIpc } from './ipc/report.js';
import { register as registerBackup } from './ipc/backup.js';

// CommonJS module require (because of "type": "module" in package.json)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { setupAutoUpdater } = require('./updater.cjs');

let playtimeRefreshInterval = null;

function startPlaytimeRefresh() {
  if (playtimeRefreshInterval) return;
  playtimeRefreshInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('farm:refresh-playtime');
    }
  }, 5 * 60 * 1000); // 5 minutes
}

function stopPlaytimeRefresh() {
  if (playtimeRefreshInterval) {
    clearInterval(playtimeRefreshInterval);
    playtimeRefreshInterval = null;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
export let isAppQuitting = false;
let tray = null;

// ──────────────── Global Error Handler ────────────────

process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    console.log('[Main] Ignored EPIPE/stream error on exit:', err.message);
    return;
  }
  console.error('[Main] Uncaught exception:', err);
});

// ──────────────── Window ────────────────

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    icon: path.join(__dirname, '..', 'resources', 'icon.png'),
    backgroundColor: '#0d0d0d',
    width: 1280,
    height: 800,
    minWidth: 400,
    minHeight: 500,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Main] Renderer crashed:', details.reason);
    mainWindow.webContents.reload();
  });

  mainWindow.webContents.on('did-fail-load', (event, code, desc, url) => {
    console.error('[Main] Failed to load:', code, desc, url);
  });

  mainWindow.webContents.on('console-message', (event, secondArg, thirdArg, fourthArg, fifthArg) => {
    // Electron 25+: secondArg is a details object { level, message, line, sourceId }
    // Electron <25 (old):   secondArg=level(int), thirdArg=message, fourthArg=line, fifthArg=sourceId
    let level, message, line, sourceId;
    if (secondArg !== null && typeof secondArg === 'object' && 'message' in secondArg) {
      ({ level, message, line, sourceId } = secondArg);
    } else {
      level = secondArg;
      message = thirdArg;
      line = fourthArg;
      sourceId = fifthArg;
    }
    if (message == null || message === '') return; // skip empty frames
    const labels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const lv = labels[level] ?? 'LOG';
    console.log(`[Renderer] [${lv}] ${message}`);
  });

  // Clear CSP if it blocks webview
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ['']
      }
    });
  });

  mainWindow.loadURL(isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`
  );

  // Intercept new-window / target="_blank" → open internal browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('steam://') || url.includes('gg.deals')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    mainWindow.webContents.send('open-internal-browser', url);
    return { action: 'deny' };
  });

  // Intercept navigation away from app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = isDev ? 'http://localhost:3000' : `file://`;
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      if (url.startsWith('steam://') || url.includes('gg.deals')) {
        shell.openExternal(url);
      } else {
        mainWindow.webContents.send('open-internal-browser', url);
      }
    }
  });

  mainWindow.on('close', (event) => {
    if (!isAppQuitting) {
      event.preventDefault();
      mainWindow.webContents.send('app:close-requested');
    }
  });

  ipcMain.once('app:ready', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const startMinimized = process.argv.includes('--minimized');
      if (!startMinimized) {
        mainWindow.show();
      }
    }
  });
}

// ──────────────── Register All IPC Modules ────────────────

// Register modules that don't depend on mainWindow first
registerInventory(ipcMain);          // Must be before market
registerMarket(ipcMain);
registerCards(ipcMain);
registerAchievements(ipcMain);
registerIdle(ipcMain);
registerStats(ipcMain);
registerReportIpc();
registerBackup(ipcMain);
registerHltbHandlers();
registerBacklogCacheHandlers();

ipcMain.handle('farm:start-playtime-refresh', () => startPlaytimeRefresh());
ipcMain.handle('farm:stop-playtime-refresh', () => stopPlaytimeRefresh());




// ──────────────── App Lifecycle ────────────────

// ──────────────── Web Contents Lifecycle (Webviews) ────────────────
app.on('web-contents-created', (event, contents) => {
  if (contents.getType() === 'webview') {
    // ─── Browser behavior ───
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('steam://') || url.includes('gg.deals')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      contents.loadURL(url);
      return { action: 'deny' };
    });

    // ─── Error/Console logging for webviews ───
    contents.on('did-fail-load', (ev, code, desc, url) => {
      console.error(`[Webview] Failed to load: ${url} (${code}: ${desc})`);
    });

    contents.on('console-message', (ev, level, message, line, sourceId) => {
      // level 2 = Warning, 3 = Error
      if (level >= 2) {
        console.warn(`[Webview] ${message} (${sourceId}:${line})`);
      }
    });

    contents.on('render-process-gone', (ev, details) => {
      console.error(`[Webview] Process gone: ${details.reason}`);
    });
  }
});

// ──────────────── Single Instance Lock ────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    createWindow();
    registerAuth(ipcMain, { mainWindow });

    // Setup Tray
    const iconPath = path.join(__dirname, '..', 'resources', 'icon.png');
    const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip('SteamMini');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Развернуть SteamMini', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { type: 'separator' },
      { label: 'Выход', click: () => { isAppQuitting = true; app.quit(); } }
    ]));
    tray.on('click', () => {
      if (mainWindow) {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });

    // Register modules that need mainWindow
  registerSteam(ipcMain, { mainWindow });
  registerWindow(ipcMain, { mainWindow });
  registerFreeGames(ipcMain, { mainWindow });

  // IPC for app version
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('badge:get-game-badge', async (event, { steamId, appId }) => {
    try {
      const STEAM_API_KEY = process.env.STEAM_API_KEY;
      const data = await httpsGet({ hostname: 'api.steampowered.com', path: `/IPlayerService/GetBadges/v1/?key=${STEAM_API_KEY}&steamid=${steamId}` })
      const json = JSON.parse(data.body)
      const badges = json?.response?.badges ?? []

      // Ищем значок по appid
      const badge = badges.find(b => String(b.appid) === String(appId))

      if (!badge) return { hasBadge: false }

      const level = badge.level ?? 0
      const xp = badge.xp ?? 0

      // Получаем реальный iconurl через внутренний API с куками
      const badgeInfoResp = await steamFetchWithRetry(
        `https://steamcommunity.com/profiles/${steamId}/ajaxgetbadgeinfo/${appId}`,
        { headers: { 'Accept': 'application/json' } }
      )
      const badgeInfo = await badgeInfoResp.json()
      const iconUrl = badgeInfo?.badgedata?.iconurl ?? null

      // ПОЛУЧЕНИЕ ИМЕНИ ЗНАЧКА ЧЕРЕЗ HTML СТРАНИЦУ
      let badgeName = null
      try {
        console.log(`[badge] Fetching real name from: https://steamcommunity.com/profiles/${steamId}/gamecards/${appId}?l=english`)
        const pageResp = await steamFetchWithRetry(
          `https://steamcommunity.com/profiles/${steamId}/gamecards/${appId}?l=english`
        )
        const html = await pageResp.text()

        // Ищем название текущего уровня значка в блоке badge_info_title
        // Steam рендерит это как: <div class="badge_info_title">Employee of the Month</div>
        const nameMatch = html.match(/<div class="badge_info_title">([^<]+)<\/div>/)
        
        if (nameMatch && nameMatch[1]) {
          badgeName = nameMatch[1].trim()
        } else {
          // Запасной вариант: поиск в общем списке значков на странице
          const fallbackMatch = html.match(/<div class="badge_title">\s*(.*?)\s*<\/div>/)
          badgeName = fallbackMatch ? fallbackMatch[1].replace(/&nbsp;/g, '').trim() : null
        }
      } catch (err) {
        console.error('[badge] HTML parse failed:', err.message)
      }

      // Если всё равно null, оставляем заглушку
      if (!badgeName) badgeName = "Значок игры"

      const isMaxLevel = level >= 5

      console.log(`[badge] appId=${appId} level=${level} name=${badgeName}`)
      return { hasBadge: true, level, xp, iconUrl, badgeName, isMaxLevel }
    } catch (e) {
      console.error('[badge] get-game-badge error:', e.message)
      return { hasBadge: false }
    }
  })

  // Auto-updater only in packaged app
  if (app.isPackaged) {
    setupAutoUpdater(mainWindow);
  } else {
    ipcMain.handle('update:check', async () => ({ status: 'not-available', message: 'Недоступно в режиме разработки' }));
    ipcMain.handle('update:download', () => {});
    ipcMain.handle('update:install', () => {});
    ipcMain.handle('update:set-auto-download', (event, enabled) => {
      console.log('[Dev] autoDownload ignored in dev:', enabled);
    });
  }

  // Silent refresh: check JWT expiry and refresh if needed
  console.log('[App] Checking Steam session before startup...');
  const sessionOk = await ensureSteamSession(session.defaultSession);
  console.log(`[App] Session check: ${sessionOk ? '[OK] OK' : '[WARN] Failed — will need manual login'}`);

  // Proactive auto-refresh every hour
  setupAutoRefresh(session.defaultSession, 1);

  // Network Error Monitoring (captures image 404s, etc.)
  session.defaultSession.webRequest.onErrorOccurred((details) => {
    const silentTypes = ['image', 'script', 'stylesheet', 'xhr', 'fetch'];
    if (silentTypes.includes(details.resourceType)) {
      console.warn(`[Network] Failed to load ${details.url}: ${details.error}`);
    }
  });

  // Capture HTTP errors (404s, 500s) that are successful network transfers but failed status codes
  session.defaultSession.webRequest.onCompleted((details) => {
    if (details.statusCode >= 400) {
      console.error(`[Network] Failed to load resource: the server responded with a status of ${details.statusCode} (${details.url})`);
    }
  });

  cardsBridge.start();

  // Start free games polling
  startFreeGamesPolling();

  // Watch localconfig.vdf for live shelf updates
  try {
    const localCfgPath = getLocalConfigPathExported();
    if (localCfgPath && fs.existsSync(localCfgPath)) {
      fs.watch(localCfgPath, { persistent: false }, () => {
        invalidateRecentGamesCache();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('recent-games-updated');
        }
      });
    }
  } catch (e) {
    console.warn('[recent-games] fs.watch failed:', e.message);
  }
});

app.on('before-quit', () => {
  isAppQuitting = true;
  achievementBridge.stop();
  cardsBridge.stop();
});

app.on('window-all-closed', () => {
  idleManager.stopAll();
  app.quit();
});
} // End of single-instance lock block
