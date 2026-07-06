import { exec } from 'child_process';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app, net, shell, session, BrowserWindow } from 'electron';
import { httpsGet, dedupe, timer, refreshSteamCookies, getSteamCookies, steamFetchWithRetry } from '../utils/helpers.js';
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
 * Poll the Steam activation page DOM every 500ms from the Node.js side.
 * Resolves with { success, products } or { success: false, error }.
 * Rejects with a timeout error after `timeoutMs` milliseconds.
 */
async function waitForActivationResult(win, timeoutMs = 40000) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        return reject(new Error('Превышено время ожидания ответа от Steam'));
      }

      try {
        const result = await win.webContents.executeJavaScript(`
          (() => {
            const receipt    = document.getElementById('receipt_form');
            const errorEl    = document.getElementById('error_display');

            // SUCCESS: receipt_form visible
            if (receipt && receipt.style.display !== 'none') {
              const productList = document.getElementById('registerkey_productlist');
              // Fallback: line items from older Steam UI
              const lineItems = Array.from(document.querySelectorAll('.registerkey_lineitem'))
                .map(el => el.innerText.trim()).join(', ');
              return {
                status: 'success',
                products: productList ? productList.innerText.trim() : (lineItems || '')
              };
            }

            // Also check registerkey_receipt_container (older UI)
            const receiptContainer = document.getElementById('registerkey_receipt_container');
            if (receiptContainer && receiptContainer.style.display !== 'none') {
              const lineItems = Array.from(document.querySelectorAll('.registerkey_lineitem'))
                .map(el => el.innerText.trim()).join(', ');
              return { status: 'success', products: lineItems || 'Ключ успешно активирован' };
            }

            // ERROR: error_display visible and non-empty
            if (errorEl && errorEl.style.display !== 'none' && errorEl.innerText.trim()) {
              return { status: 'error', message: errorEl.innerText.trim() };
            }

            return { status: 'pending' };
          })()
        `);

        console.log(`[activate] Poll result:`, JSON.stringify(result));

        if (result.status === 'success') {
          clearInterval(interval);
          resolve({ success: true, products: result.products });
        } else if (result.status === 'error') {
          clearInterval(interval);
          resolve({ success: false, error: result.message });
        }
        // 'pending' — keep waiting
      } catch (e) {
        // Page is still loading — ignore and retry
      }
    }, 500);
  });
}

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
      console.log(`[OK] [TIMER] steam:get-cover-url: 0ms (cached) appId=${appId}`);
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
    
    const CURRENCY_FORMATS = {
      1: { prefix: '$', suffix: '' },      // USD
      2: { prefix: '£', suffix: '' },      // GBP
      3: { prefix: '€', suffix: '' },      // EUR
      5: { prefix: '', suffix: ' руб.' },  // RUB
      37: { prefix: '', suffix: '₸' }      // KZT
    };

    try {
      let balanceCents = 0;
      let delayedCents = 0;
      let currencyCode = 1;
      let success = false;

      // 1. Try JSON userdata endpoint as the primary source
      try {
        console.log('[wallet] Fetching wallet balance from userdata JSON...');
        const userRes = await steamFetchWithRetry('https://store.steampowered.com/dynamicstore/userdata/', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          }
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData && userData.nWalletBalance !== undefined) {
            balanceCents = userData.nWalletBalance;
            currencyCode = userData.nWalletCurrency ?? 1;
            // Note: userdata doesn't include delayed balance, so we keep it 0 or fallback if needed
            success = true;
            console.log('[wallet] Successfully fetched balance from userdata JSON:', balanceCents, 'currency:', currencyCode);
          }
        }
      } catch (jsonErr) {
        console.warn('[wallet] JSON userdata fetch failed, falling back to HTML...', jsonErr.message);
      }

      // 2. Fallback to store.steampowered.com HTML parsing if JSON failed or had no wallet info
      if (!success) {
        console.log('[wallet] Fetching store homepage HTML for fallback...');
        const response = await steamFetchWithRetry('https://store.steampowered.com/', {
          headers: {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept':          'text/html,application/xhtml+xml',
          }
        });

        console.log('[wallet] fallback HTML status:', response.status);
        const html = await response.text();
        
        const match = html.match(/g_rgWalletInfo\s*=\s*(\{[\s\S]*?\});/)
                  ?? html.match(/wallet_balance['":\s]+(\d+)/);

        if (!match) {
          console.error('[wallet] WalletInfo not found in fallback HTML');
          t.end(`(error: WalletInfo not found)`);
          return { success: false, balanceFmt: '$0.00', balance: 0 };
        }

        try {
          const info = JSON.parse(match[1]);
          balanceCents = parseInt(info.wallet_balance ?? '0');
          delayedCents = parseInt(info.wallet_delayed_balance ?? '0');
          currencyCode = parseInt(info.wallet_currency ?? '1');
          success = true;
          console.log('[wallet] Parsed balance from HTML:', balanceCents, 'delayed:', delayedCents, 'currency:', currencyCode);
        } catch {
          balanceCents = parseInt(match[1] ?? '0');
          success = true;
        }
      }

      const fmt = CURRENCY_FORMATS[currencyCode] || { prefix: '$', suffix: '' };
      const balanceFmt = `${fmt.prefix}${(balanceCents / 100).toFixed(2)}${fmt.suffix}`;
      const delayedFmt = delayedCents > 0 ? `${fmt.prefix}${(delayedCents / 100).toFixed(2)}${fmt.suffix}` : null;
      console.log(`[wallet] Balance: ${balanceFmt} (${balanceCents} cents), Delayed: ${delayedCents} cents`);

      t.end(`(balance=${balanceCents}¢, delayed=${delayedCents}¢)`);
      const walletResult = {
        success: true,
        balance: balanceCents,
        balanceFmt,
        delayed: delayedCents,
        delayedFmt
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

      // 1. Load the clean activation page (no key in URL — we'll inject it)
      await authWin.webContents.loadURL('https://store.steampowered.com/account/registerkey');

      // 2. Wait until the form elements are present in the DOM
      await authWin.webContents.executeJavaScript(`
        new Promise(resolve => {
          const check = () => {
            const btn = document.getElementById('register_btn_in_progress')
                     || document.getElementById('register_btn');
            if (btn) return resolve();
            setTimeout(check, 300);
          };
          check();
        })
      `);

      // 3. Check for login wall
      const isLoggedIn = await authWin.webContents.executeJavaScript(`
        !(document.body.innerText.includes('Sign In') || !!document.getElementById('login_btn_signin'))
      `);
      if (!isLoggedIn) {
        t.end('(error: not logged in)');
        return { success: false, msg: 'Вы не авторизованы в Steam. Пожалуйста, войдите в аккаунт.' };
      }

      // 4. Fill in key, accept SSA, call native Steam function
      await authWin.webContents.executeJavaScript(`
        (() => {
          const input = document.getElementById('product_key');
          if (input) {
            input.value = ${JSON.stringify(key.trim())};
            input.dispatchEvent(new Event('input',  { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const ssa = document.getElementById('accept_ssa')
                   || document.getElementById('ssa_agree');
          if (ssa && !ssa.checked) {
            ssa.click();
            ssa.dispatchEvent(new Event('change', { bubbles: true }));
          }

          // Short delay then submit — prefer native Steam handler
          setTimeout(() => {
            if (typeof RegisterProductKey === 'function') {
              RegisterProductKey();
            } else {
              const btn = document.getElementById('register_btn');
              if (btn) { btn.disabled = false; btn.click(); }
            }
          }, 800);
        })()
      `);

      // 5. Poll DOM from Node.js side every 500ms until Steam responds
      const result = await waitForActivationResult(authWin);

      if (result.success) {
        console.log(`[activate] Success! Products: ${result.products}`);
        t.end(`(success: ${result.products})`);
        return { success: true, msg: 'Игра успешно активирована!', gameName: result.products };
      } else {
        console.log(`[activate] Error: ${result.error}`);
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
