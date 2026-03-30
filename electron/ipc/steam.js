import { exec } from 'child_process';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app, net, shell, session, BrowserWindow } from 'electron';
import { httpsGet, dedupe, timer, refreshSteamCookies, getSteamCookies } from '../utils/helpers.js';
import { parseRecentGames, getLocalConfigPathExported } from '../recentGames.js';
import https from 'https';
import zlib from 'zlib';

/**
 * Steam core IPC handlers.
 * Channels: steam:get-cover-url, steam:fetch-html, steam:is-installed, steam:kill-game,
 *           steam:set-running-game, steam:get-running-game, steam:get-all-installed,
 *           get-recent-games, steam:get-wallet, steam:redeem-key
 *
 * Local caches: _coverUrlCache, installedAppIdsCache, runningGame*, wallet*, _recentGames*
 */

// ─── Module-local caches ──────────────────────────────────────────
const _coverUrlCache = {};
let installedAppIdsCache = null;
let runningGamePid = null;
let runningGameAppId = null;
let _recentGamesCache = null;
let _recentGamesCacheTime = 0;
const RECENT_CACHE_TTL = 60 * 1000; // 1 minute
let walletCache = null;
let walletCacheTime = 0;
const WALLET_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────

function getAllInstalledAppIds() {
  if (installedAppIdsCache) return installedAppIdsCache;

  const steamPaths = new Set();

  if (process.platform === 'win32') {
    try {
      const reg = execSync(
        'reg query "HKEY_CURRENT_USER\\Software\\Valve\\Steam" /v SteamPath',
        { encoding: 'utf8' }
      );
      const match = reg.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (match) {
        const steamPath = match[1].trim().replace(/\//g, '\\');
        steamPaths.add(path.join(steamPath, 'steamapps'));
      }
    } catch (e) {
      console.error('[steam:is-installed] Registry read failed:', e.message);
    }
  } else if (process.platform === 'darwin') {
      steamPaths.add(path.join(app.getPath('home'), 'Library/Application Support/Steam/steamapps'));
  } else if (process.platform === 'linux') {
      steamPaths.add(path.join(app.getPath('home'), '.steam/steam/steamapps'));
      steamPaths.add(path.join(app.getPath('home'), '.local/share/Steam/steamapps'));
  }

  const basePathsArray = [...steamPaths];
  for (const appsPath of basePathsArray) {
    const vdfPath = path.join(appsPath, 'libraryfolders.vdf');
    if (!fs.existsSync(vdfPath)) continue;
    try {
      const content = fs.readFileSync(vdfPath, 'utf-8');
      for (const match of content.matchAll(/"path"\s+"([^"]+)"/g)) {
        const libApps = path.join(
          match[1].replace(/\\\\/g, '\\'), 
          'steamapps'
        );
        if (fs.existsSync(libApps)) steamPaths.add(libApps);
      }
    } catch (e) {}
  }

  console.log('[steam:is-installed] Found steamapps folders:', [...steamPaths]);

  const appIds = new Set();
  for (const appsPath of steamPaths) {
    try {
      const files = fs.readdirSync(appsPath);
      for (const file of files) {
        const m = file.match(/^appmanifest_(\d+)\.acf$/);
        if (m) appIds.add(m[1]);
      }
    } catch (e) {}
  }

  console.log('[steam:is-installed] Total installed apps:', appIds.size);
  installedAppIdsCache = appIds;
  return appIds;
}

// ─── Exports ──────────────────────────────────────────────────────

/**
 * Invalidate recent games cache (called from main.js fs.watch).
 */
export function invalidateRecentGamesCache() {
  _recentGamesCacheTime = 0;
}

export function register(ipcMain, { mainWindow }) {
  // ─── Cover URL ──────────────────────────────────────────
  ipcMain.handle('steam:get-cover-url', (_, appId) => {
    return dedupe(`cover-${appId}`, async () => {
    if (_coverUrlCache[appId]) {
      console.log(`✅ [TIMER] steam:get-cover-url: 0ms (cached) appId=${appId}`);
      return _coverUrlCache[appId];
    }
    const t = timer(`steam:get-cover-url appId=${appId}`);

    try {
      const inputJson = JSON.stringify({
        ids:          [{ appid: parseInt(appId) }],
        context:      { country_code: 'US', language: 'english' },
        data_request: { include_assets: true }
      })

      const result = await httpsGet({
        hostname: 'api.steampowered.com',
        path:     `/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(inputJson)}`,
        method:   'GET',
        headers:  { 'User-Agent': 'Mozilla/5.0' }
      })

      const data  = JSON.parse(result.body)
      const item  = data?.response?.store_items?.[0]
      const assets = item?.assets

      if (!assets) {
        _coverUrlCache[appId] = null
        t.end();
        return null
      }

      const base     = `https://shared.akamai.steamstatic.com/store_item_assets/`
      const format   = assets.asset_url_format ?? `steam/apps/${appId}/`

      const filename = assets.library_capsule_2x
                    ?? assets.library_capsule
                    ?? assets.header
                    ?? null

      if (!filename) {
        _coverUrlCache[appId] = null
        t.end();
        return null
      }

      const coverUrl = format.includes('${FILENAME}')
        ? `${base}${format.replace('${FILENAME}', filename)}`
        : `${base}${format}${filename}`

      console.log(`[cover] appId=${appId} → ${coverUrl}`)
      _coverUrlCache[appId] = coverUrl
      t.end();
      return coverUrl

    } catch (err) {
      console.error(`[cover] Error for ${appId}:`, err.message)
      t.end();
      return null
    }
    })
  });

  // ─── Fetch HTML ─────────────────────────────────────────
  ipcMain.handle('steam:fetch-html', async (event, url) => {
    try {
      const response = await net.fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const text = await response.text();
      return { success: true, data: text };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ─── Is Installed ───────────────────────────────────────
  ipcMain.handle('steam:is-installed', async (event, appId) => {
    const ids = getAllInstalledAppIds();
    return ids.has(String(appId));
  });

  // ─── Kill Game ──────────────────────────────────────────
  ipcMain.handle('steam:kill-game', async (event, appId) => {
    console.log(`[killGame] Trying to kill appId=${appId}, pid=${runningGamePid}`);

    if (runningGamePid) {
      return new Promise((resolve) => {
        exec(`taskkill /PID ${runningGamePid} /F /T`, (err, stdout) => {
          console.log(`[killGame] taskkill PID result:`, stdout || err?.message);
          runningGamePid = null;
          runningGameAppId = null;
          resolve({ success: !err });
        });
      });
    }

    try {
      await shell.openExternal(`steam://forceshutdown/${appId}`);
      console.log(`[killGame] steam://forceshutdown/${appId} sent`);
      runningGameAppId = null;
      return { success: true };
    } catch (e) {
      console.error('[killGame] forceshutdown failed:', e.message);
      return { success: false, error: e.message };
    }
  });

  // ─── Running Game State ─────────────────────────────────
  ipcMain.handle('steam:set-running-game', (event, { appId, pid }) => {
    console.log(`[runningGame] set: appId=${appId} pid=${pid}`);
    runningGameAppId = appId;
    runningGamePid = pid || null;
    return { success: true };
  });

  ipcMain.handle('steam:get-running-game', () => {
    return { appId: runningGameAppId, pid: runningGamePid };
  });

  // ─── All Installed ──────────────────────────────────────
  ipcMain.handle('steam:get-all-installed', async () => {
    return [...getAllInstalledAppIds()];
  });

  // ─── Recent Games ───────────────────────────────────────
  ipcMain.handle('get-recent-games', async () => {
    const now = Date.now();

    if (_recentGamesCache && now - _recentGamesCacheTime < RECENT_CACHE_TTL) {
      return _recentGamesCache;
    }

    try {
      const { total, recent } = await parseRecentGames(20);
      
      if (!_recentGamesCache) {
        console.log('[VDF] Total apps found:', total);
        console.log('[VDF] Recent games found:', recent.length);
      }

      _recentGamesCache     = recent;
      _recentGamesCacheTime = now;
      return recent;
    } catch (err) {
      console.error('[RecentGames] Error:', err);
      return [];
    }
  });

  // ─── Wallet ─────────────────────────────────────────────
  ipcMain.handle('steam:get-wallet', async () => {
    const now = Date.now();
    if (walletCache && (now - walletCacheTime) < WALLET_TTL) {
      console.log('[wallet] Returning cached balance');
      return walletCache;
    }
    const t = timer('steam:get-wallet');
    try {
      const ses = session.defaultSession;

      const response = await ses.fetch('https://steamcommunity.com/market/search?appid=753', {
        headers: {
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept':          'text/html,application/xhtml+xml',
        }
      });

      console.log('[wallet] session.fetch status:', response.status);

      const html = await response.text();
      console.log('[wallet] HTML length:', html.length);

      const match = html.match(/g_rgWalletInfo\s*=\s*(\{.*?\});/)
                ?? html.match(/wallet_balance['":\s]+(\d+)/);

      if (!match) {
        console.error('[wallet] WalletInfo not found');
        const idx = html.indexOf('wallet_balance');
        if (idx > -1) {
          console.log('[wallet] Context around wallet_balance:',
            html.substring(idx - 20, idx + 60));
        }
        t.end(`(error: WalletInfo not found)`);
        return { success: false, balanceFmt: '$0.00', balance: 0 };
      }

      let balanceCents = 0;
      let delayedCents = 0;
      try {
        const info    = JSON.parse(match[1]);
        balanceCents  = parseInt(info.wallet_balance ?? '0');
        delayedCents  = parseInt(info.wallet_delayed_balance ?? '0');
        console.log('[wallet] WalletInfo:', info);
      } catch {
        balanceCents = parseInt(match[1] ?? '0');
      }

      const balanceFmt = `$${(balanceCents / 100).toFixed(2)}`;
      console.log(`[wallet] Balance: ${balanceFmt} (${balanceCents} cents), Delayed: ${delayedCents} cents`);

      t.end(`(balance=${balanceCents}¢, delayed=${delayedCents}¢)`);
      const walletResult = {
        success: true,
        balance: balanceCents,
        balanceFmt,
        delayed: delayedCents,
        delayedFmt: delayedCents > 0 ? `$${(delayedCents / 100).toFixed(2)}` : null
      };
      walletCache = walletResult;
      walletCacheTime = Date.now();
      return walletResult;

    } catch (err) {
      console.error('[wallet] Error:', err.message);
      t.end(`(error: ${err.message})`);
      return { error: err.message };
    }
  });

  // ─── Redeem Key ─────────────────────────────────────────
  ipcMain.handle('steam:redeem-key', async (_, { key }) => {
    const t = timer('steam:redeem-key');
    console.log('[activate] Redeeming key via hidden browser:', key.substring(0, 5) + '...');
    
    let authWin = null;
    try {
      authWin = new BrowserWindow({
        show: false,
        width: 1024,
        height: 768,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          session: session.defaultSession
        }
      });

      // Load the activation page with the key pre-filled
      const url = `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(key.trim())}`;
      await authWin.loadURL(url);

      // Execute script to agree to SSA and click "Register"
      const result = await authWin.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const checkAndSubmit = async () => {
            const ssaBox = document.getElementById('accept_ssa') || document.getElementById('ssa_agree');
            const registerBtn = document.getElementById('register_btn');
            const productKeyInput = document.getElementById('product_key');

            if (!registerBtn || !productKeyInput) {
               if (document.body.innerText.includes('Sign In') || document.getElementById('login_btn_signin')) {
                  resolve({ success: false, error: 'Вы не авторизованы в Steam. Пожалуйста, войдите в аккаунт.' });
                  return;
               }
               resolve({ success: false, error: 'Не удалось найти элементы на странице активации' });
               return;
            }

            // Ensure key is present and trigger input events
            if (productKeyInput) {
              if (!productKeyInput.value) {
                  const urlParams = new URLSearchParams(window.location.search);
                  const keyParam = urlParams.get('key');
                  if (keyParam) productKeyInput.value = keyParam;
              }
              productKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
              productKeyInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Force check SSA box
            if (ssaBox) {
              console.log('Found SSA checkbox, clicking...');
              if (!ssaBox.checked) {
                ssaBox.click(); 
              }
              ssaBox.checked = true;
              ssaBox.dispatchEvent(new Event('click', { bubbles: true }));
              ssaBox.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            await new Promise(r => setTimeout(r, 1000));

            if (registerBtn.disabled) {
               registerBtn.disabled = false;
            }

            registerBtn.click();

            // Monitor for result
            const pollResult = setInterval(() => {
                const errorDisplay = document.getElementById('error_display');
                const receiptContainer = document.getElementById('registerkey_receipt_container');
                
                // 1. Check for SUCCESS
                if (receiptContainer && receiptContainer.style.display !== 'none') {
                    clearInterval(pollResult);
                    const lineItems = Array.from(document.querySelectorAll('.registerkey_lineitem'))
                        .map(el => el.innerText.trim())
                        .join(', ');
                    resolve({ success: true, detail: lineItems || 'Ключ успешно активирован' });
                    return;
                }

                // 2. Check for ERROR
                if (errorDisplay && errorDisplay.style.display !== 'none' && errorDisplay.innerText.trim()) {
                    const errorText = errorDisplay.innerText.trim();
                    if (errorText.length > 0) {
                      clearInterval(pollResult);
                      resolve({ success: false, error: errorText });
                      return;
                    }
                }
            }, 500);

            // Timeout after 25 seconds
            setTimeout(() => {
                clearInterval(pollResult);
                resolve({ success: false, error: 'Превышено время ожидания ответа от Steam' });
            }, 25000);
          };

          if (document.readyState === 'complete') {
             setTimeout(checkAndSubmit, 1500);
          } else {
             window.onload = () => setTimeout(checkAndSubmit, 1500);
          }
        });
      `);

      if (result.success) {
        t.end(`(success: ${result.detail})`);
        return { success: true, msg: 'Игра успешно активирована!', gameName: result.detail };
      } else {
        t.end(`(error: ${result.error})`);
        return { success: false, msg: result.error };
      }

    } catch (err) {
      console.error('[activate] Fatal error:', err);
      t.end('(Fatal error)');
      return { error: err.message };
    } finally {
      if (authWin) authWin.destroy();
    }
  });
}
