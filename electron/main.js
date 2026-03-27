import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as idleManager from './idleManager.js';
import achievementBridge from './achievementBridge.js';
import cardsBridge from './cardsBridge.js';
import { getLocalConfigPathExported } from './recentGames.js';
import { refreshSteamCookies } from './utils/helpers.js';

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

// CommonJS module require (because of "type": "module" in package.json)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { setupAutoUpdater } = require('./updater.cjs');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';

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

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[Renderer] ${message} (${sourceId}:${line})`);
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
    if (url.startsWith('steam://')) {
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
      if (url.startsWith('steam://')) {
        shell.openExternal(url);
      } else {
        mainWindow.webContents.send('open-internal-browser', url);
      }
    }
  });

  ipcMain.once('app:ready', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
}

// ──────────────── Register All IPC Modules ────────────────

// Register modules that don't depend on mainWindow first
registerInventory(ipcMain);          // Must be before market
registerMarket(ipcMain);
registerAuth(ipcMain);
registerCards(ipcMain);
registerAchievements(ipcMain);
registerIdle(ipcMain);
registerStats(ipcMain);

// ──────────────── App Lifecycle ────────────────

app.whenReady().then(async () => {
  createWindow();

  // Register modules that need mainWindow
  registerSteam(ipcMain, { mainWindow });
  registerWindow(ipcMain, { mainWindow });
  registerFreeGames(ipcMain);

  // IPC for app version
  ipcMain.handle('app:get-version', () => app.getVersion());

  // Auto-updater only in packaged app
  if (app.isPackaged) {
    setupAutoUpdater(mainWindow);
  }

  // Refresh Steam cookies on startup
  await refreshSteamCookies();
  console.log('[App] Steam cookies refreshed');

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
  achievementBridge.stop();
  cardsBridge.stop();
});

app.on('window-all-closed', () => {
  idleManager.stopAll();
  app.quit();
});
