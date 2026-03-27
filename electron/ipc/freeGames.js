import path from 'path';
import fs from 'fs';
import { app, BrowserWindow, Notification, session } from 'electron';
import { httpsGet } from '../utils/helpers.js';
import { egsDirectLogin, checkEgsSession } from '../auth/egsLogin.js';
import { claimEgsGame } from '../egsClaimer.js';

/**
 * Free games IPC handlers + auto-claim logic.
 * Channels: free-games:get, free-games:get-settings, free-games:save-settings,
 *           egs:login, egs:check-session, egs:claim, steam:claim-free-game
 *
 * Local state: settings, claimed games, polling timer, shown games set
 */

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');

// ─── Constants ────────────────────────────────────────────────────

const FREE_GAMES_SETTINGS_DEFAULT = {
  platforms: {
    epic:       true,
    steam:      true,
    gog:        true,
    itchio:     false,
    other:      false,
  },
  onlyInstant:  true,
  onlyGames:    true,
  notifications: true,
  checkInterval: 6,
  autoClaim: {
    enabled:       false,
    steamOnly:     true,
    egsEnabled:    false,
    notifyBefore:  true,
    notifyAfter:   true,
  }
};

const FREE_GAMES_SETTINGS_FILE = path.join(
  app.getPath('userData'), 'free-games-settings.json'
);

// ─── Claimed Games Persistence ────────────────────────────────────

const _claimedGames = new Set();
const _CLAIMED_FILE = path.join(app.getPath('userData'), 'claimed-games.json');

function loadClaimedGames() {
  try {
    if (fs.existsSync(_CLAIMED_FILE)) {
      const ids = JSON.parse(fs.readFileSync(_CLAIMED_FILE, 'utf8'));
      ids.forEach(id => _claimedGames.add(id));
    }
  } catch {}
}

function saveClaimedGame(appId) {
  _claimedGames.add(String(appId));
  fs.writeFileSync(_CLAIMED_FILE,
    JSON.stringify([..._claimedGames]), 'utf8');
}

// ─── Settings ─────────────────────────────────────────────────────

function loadFreeGamesSettings() {
  try {
    if (fs.existsSync(FREE_GAMES_SETTINGS_FILE)) {
      const raw = fs.readFileSync(FREE_GAMES_SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return { 
        ...FREE_GAMES_SETTINGS_DEFAULT, 
        ...parsed,
        platforms: { ...FREE_GAMES_SETTINGS_DEFAULT.platforms, ...parsed?.platforms },
        autoClaim: { ...FREE_GAMES_SETTINGS_DEFAULT.autoClaim, ...parsed?.autoClaim }
      };
    }
  } catch {}
  return { ...FREE_GAMES_SETTINGS_DEFAULT };
}

function saveFreeGamesSettings(settings) {
  fs.writeFileSync(FREE_GAMES_SETTINGS_FILE,
    JSON.stringify(settings, null, 2), 'utf8');
}

// ─── Fetchers ─────────────────────────────────────────────────────

function extractSteamAppId(url) {
  const match = (url ?? '').match(
    /store\.steampowered\.com\/app\/(\d+)/
  );
  return match ? match[1] : null;
}

async function searchSteamAppId(title) {
  try {
    const cleanTitle = title.replace(/\(Steam\)/i, '').replace(/Giveaway/i, '').replace(/Free/i, '').trim();
    if (!cleanTitle) return null;
    
    const res = await httpsGet({
      hostname: 'store.steampowered.com',
      path: `/api/storesearch/?term=${encodeURIComponent(cleanTitle)}&l=english&cc=US`,
      method: 'GET'
    });
    
    const data = JSON.parse(res.body);
    if (data.items && data.items.length > 0) {
      const steamApp = data.items.find(i => i.type === 'app') || data.items[0];
      if (steamApp) return String(steamApp.id);
    }
  } catch(err) {
    console.error(`[gamerpower] Steam search failed for "${title}":`, err.message);
  }
  return null;
}

async function fetchGamerPowerGames() {
  try {
    const res  = await httpsGet({
      hostname: 'www.gamerpower.com',
      path:     '/api/giveaways?platform=pc&type=game&sort-by=popularity',
      method:   'GET',
      headers:  { 'User-Agent': 'Mozilla/5.0' }
    });

    const games = JSON.parse(res.body);
    if (!Array.isArray(games)) return [];

    games.slice(0, 5).forEach(g => {
      console.log(`[gamerpower] "${g.title}": type="${g.type}" platform="${g.platforms}" url="${g.open_giveaway_url?.substring(0, 60)}"`);
    });

    const parsedGames = await Promise.all(games.slice(0, 20).map(async g => {
      const url = g.open_giveaway_url ?? g.giveaway_url;
      let steamAppId = extractSteamAppId(url) ?? extractSteamAppId(g.instructions);
      
      if (!steamAppId && (g.platforms || '').toLowerCase().includes('steam')) {
        steamAppId = await searchSteamAppId(g.title);
      }

      return {
        id:           String(g.id),
        title:        g.title,
        description:  g.description,
        platform:     g.platforms ?? 'PC',
        type:         g.type,
        imageUrl:     g.thumbnail ?? null,
        url:          url,
        endDate:      g.end_date !== 'N/A' ? g.end_date : null,
        originalPrice: g.worth !== 'N/A' ? g.worth : 'Бесплатно',
        steamAppId:   steamAppId,
        canAutoClaim: !!steamAppId,
      };
    }));

    return parsedGames;
  } catch (err) {
    console.error('[freeGames] GamerPower error:', err.message);
    return [];
  }
}

async function fetchEpicFreeGames() {
  try {
    const res  = await httpsGet({
      hostname: 'store-site-backend-static-ipv4.ak.epicgames.com',
      path:     '/freeGamesPromotions?locale=en-US&country=US&allowCountries=US',
      method:   'GET',
      headers:  { 'User-Agent': 'Mozilla/5.0' }
    });

    const data  = JSON.parse(res.body);
    const games = data?.data?.Catalog?.searchStore?.elements ?? [];

    return games
      .filter(g => {
        const promo = g.promotions?.promotionalOffers?.[0]
                   ?.promotionalOffers?.[0];
        return promo?.discountSetting?.discountPercentage === 0;
      })
      .map(g => {
        const image = g.keyImages?.find(i =>
          i.type === 'OfferImageWide' || i.type === 'Thumbnail'
        )?.url ?? null;

        const endDate = g.promotions?.promotionalOffers?.[0]
                         ?.promotionalOffers?.[0]?.endDate ?? null;

        const mapping = g.catalogNs?.mappings?.find(m => m.pageType === 'productHome');
        const slug = mapping?.pageSlug ?? g.productSlug ?? g.urlSlug;

        return {
          id:          g.id,
          title:       g.title,
          description: g.description,
          platform:    'Epic Games',
          imageUrl:    image,
          url:         `https://store.epicgames.com/en-US/p/${slug}`,
          endDate:     endDate ? new Date(endDate).toLocaleDateString('ru-RU') : null,
          originalPrice: g.price?.totalPrice?.fmtPrice?.originalPrice ?? 'Бесплатно',
        };
      });
  } catch (err) {
    console.error('[freeGames] Epic error:', err.message);
    return [];
  }
}

// ─── Steam Auto Claim ─────────────────────────────────────────────

async function getFreeSteamSubId(appId) {
  try {
    const res  = await httpsGet({
      hostname: 'store.steampowered.com',
      path:     `/api/appdetails?appids=${appId}&cc=us&l=english`,
      method:   'GET',
      headers:  { 'User-Agent': 'Mozilla/5.0' }
    });

    const data     = JSON.parse(res.body);
    const appData  = data?.[appId]?.data;

    if (!appData) return null;

    const groups = appData.package_groups ?? [];

    for (const group of groups) {
      for (const sub of (group.subs ?? [])) {
        if (sub.price_in_cents_with_discount === 0 ||
            sub.is_free_license) {
          console.log(`[claim] Found free subId=${sub.packageid} for appId=${appId}`);
          return sub.packageid;
        }
      }
    }

    if (appData.is_free) {
      const firstSub = groups[0]?.subs?.[0]?.packageid;
      if (firstSub) return firstSub;
    }

    return null;
  } catch (err) {
    console.error('[claim] getFreeSteamSubId error:', err.message);
    return null;
  }
}

async function claimSteamGame(appId, manualSubId) {
  let subId = manualSubId ?? await getFreeSteamSubId(appId);
  if (!subId) return { error: 'Не удалось найти package ID' };

  const ses = session.defaultSession;
  console.log(`[claim] BrowserWindow: appId=${appId} subId=${subId}`);

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show:           false,
      width:          1,
      height:         1,
      webPreferences: {
        nodeIntegration: false,
        session:         ses,
      }
    });

    const timeout = setTimeout(() => {
      console.error('[claim] Timeout — destroying window');
      try { win.destroy(); } catch {}
      resolve({ error: 'Timeout' });
    }, 20000);

    win.webContents.on('did-finish-load', async () => {
      try {
        console.log('[claim] Page loaded, calling AddFreeLicense...');

        const result = await win.webContents.executeJavaScript(`
          (async () => {
            try {
              if (typeof AddFreeLicense === 'function') {
                console.log('[claim-js] Found AddFreeLicense function')
                AddFreeLicense(${subId}, null)
                await new Promise(r => setTimeout(r, 3000))
                return { success: true, method: 'AddFreeLicense' }
              }

              const btn = document.querySelector(
                'a[href*="addfreelicense"], ' +
                'a[onclick*="AddFreeLicense"], ' +
                'a[onclick*="addfreelicense"], ' +
                '.btn_addtocart a, ' +
                'a[class*="add_to_cart"]'
              )

              if (btn) {
                console.log('[claim-js] Found button:', btn.textContent, btn.href, btn.onclick?.toString()?.substring(0,100))
                btn.click()
                await new Promise(r => setTimeout(r, 3000))
                return { success: true, method: 'button_click' }
              }

              const sessionid = document.cookie
                .split('; ')
                .find(r => r.startsWith('sessionid='))
                ?.split('=')[1] || ''

              if (!sessionid) return { error: 'no sessionid in cookie' }

              const result = await new Promise((res, rej) => {
                const xhr = new XMLHttpRequest()
                xhr.open('POST', 'https://store.steampowered.com/checkout/addfreelicense/${subId}', true)
                xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
                xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
                xhr.withCredentials = true
                xhr.onload  = () => res({ status: xhr.status, body: xhr.responseText.substring(0, 500) })
                xhr.onerror = () => rej(new Error('XHR failed'))
                xhr.send('sessionid=' + sessionid + '&action=add_to_cart')
              })

              return result

            } catch(e) {
              return { error: e.message, stack: e.stack?.substring(0, 200) }
            }
          })()
        `);

        clearTimeout(timeout);
        try { win.destroy(); } catch {}

        console.log('[claim] JS result:', JSON.stringify(result));

        if (result.error) return resolve({ error: result.error });
        if (result.success) return resolve({ success: true });

        if (result.status === 200) {
          const body = result.body ?? '';
          if (body.includes('<title>Sign In</title>')) {
            return resolve({ error: 'Требуется авторизация' });
          }
          try {
            const data   = JSON.parse(body);
            const detail = data?.purchaseresultdetail;
            console.log(`[claim] purchaseresultdetail: ${detail}`);
            if (detail === 9)  return resolve({ success: false, alreadyOwned: true });
            if (detail === 24) return resolve({ success: false, msg: 'Регион не поддерживается' });
            if (detail === 53) return resolve({ success: false, msg: 'Слишком много попыток' });
            return resolve({ success: true });
          } catch {
            return resolve({ success: true });
          }
        }

        resolve({ success: false, msg: `HTTP ${result.status ?? 'unknown'}` });

      } catch (err) {
        clearTimeout(timeout);
        try { win.destroy(); } catch {}
        console.error('[claim] error:', err.message);
        resolve({ error: err.message });
      }
    });

    win.webContents.on('did-fail-load', (_, code, desc) => {
      clearTimeout(timeout);
      try { win.destroy(); } catch {}
      console.error(`[claim] Page failed to load: ${code} ${desc}`);
      resolve({ error: `Page load failed: ${desc}` });
    });

    win.webContents.on('console-message', (_, level, message) => {
      if (message.includes('[claim-js]')) {
        console.log('[BrowserWindow console]', message);
      }
    });

    win.loadURL(`https://store.steampowered.com/app/${appId}/`);
  });
}

// ─── Auto Claim ───────────────────────────────────────────────────

async function autoClaimFreeGames() {
  const settings = loadFreeGamesSettings();
  if (!settings.autoClaim?.enabled) return;

  console.log('[autoClaim] Checking for free games to claim...');

  try {
    const epicGames     = settings.platforms.epic
      ? await fetchEpicFreeGames()   : [];
    const gamerPower    = await fetchGamerPowerGames();

    const allGames = [...epicGames, ...gamerPower];

    // 1. Steam games
    const steamGames = allGames.filter(g => {
      const platform = (g.platform ?? '').toLowerCase();
      return platform.includes('steam') && (g.steamAppId || g.canAutoClaim);
    });

    console.log(`[autoClaim] Found ${steamGames.length} claimable Steam games`);

    for (const game of steamGames) {
      const appId = game.steamAppId ?? game.appId;
      if (!appId) continue;

      if (_claimedGames.has(String(appId))) continue;

      if (settings.autoClaim.notifyBefore) {
        new Notification({
          title: `⚡ Авто-получение (Steam): ${game.title}`,
          body:  `Добавляю бесплатную игру в библиотеку...`,
        }).show();
      }

      await new Promise(r => setTimeout(r, 2000));
      const result = await claimSteamGame(appId);

      if (result.success || result.alreadyOwned) {
        saveClaimedGame(appId);
        if (result.success && settings.autoClaim.notifyAfter) {
          new Notification({
            title: `✓ Получено: ${game.title}`,
            body:  `Игра добавлена в Steam библиотеку!`,
          }).show();
        }
      } else {
        console.error(`[autoClaim] Failed: ${game.title} — ${result.msg || result.error}`);
      }
    }

    // 2. EGS games
    if (settings.autoClaim.egsEnabled) {
      const egsGames = allGames.filter(g => {
        const platform = (g.platform ?? '').toLowerCase();
        const isDirectEgsUrl = (g.url ?? '').startsWith('https://store.epicgames.com/');
        return platform.includes('epic') && isDirectEgsUrl;
      });

      if (egsGames.length > 0) {
        const hasSession = await checkEgsSession();
        if (hasSession) {
          console.log(`[autoClaim] Found ${egsGames.length} claimable EGS games`);
          
          for (const game of egsGames) {
            if (_claimedGames.has(String(game.id))) continue;

            if (settings.autoClaim.notifyBefore) {
              new Notification({
                title: `⚡ Авто-получение (EGS): ${game.title}`,
                body:  `Забираю игру в Epic Games Store...`,
              }).show();
            }

            await new Promise(r => setTimeout(r, 5000));
            const result = await claimEgsGame(game.url);

            if (result.success || result.alreadyOwned) {
              saveClaimedGame(game.id);
              if (result.alreadyOwned) {
                console.log(`[autoClaim] EGS: "${game.title}" already in library — skipped`);
              } else {
                console.log(`[autoClaim] ✅ EGS: "${game.title}" claimed successfully!`);
                if (settings.autoClaim.notifyAfter) {
                  new Notification({
                    title: `✅ Получена (EGS): ${game.title}`,
                    body:  `Игра добавлена на ваш аккаунт Epic Games.`,
                  }).show();
                }
              }
            } else {
              console.log(`[autoClaim] EGS claim failed for ${game.title}: ${result.msg}`);
            }
          }
        } else {
          console.log('[autoClaim] EGS auto-claim enabled but no active session found.');
        }
      }
    }

    console.log('[autoClaim] Done');

  } catch (err) {
    console.error('[autoClaim] Error:', err.message);
  }
}

// ─── Polling & Notifications ──────────────────────────────────────

let _autoClaimTimer = null;
let _shownFreeGames = new Set();

function restartFreeGamesPolling() {
  if (_autoClaimTimer) {
    clearInterval(_autoClaimTimer);
    _autoClaimTimer = null;
  }
  
  const settings = loadFreeGamesSettings();
  console.log(`[freeGames] Restarting polling every ${settings.checkInterval} hours`);
  
  _autoClaimTimer = setInterval(() => {
    checkFreeGamesAndNotify();
    autoClaimFreeGames();
  }, settings.checkInterval * 60 * 60 * 1000);
}

async function checkFreeGamesAndNotify() {
  const settings = loadFreeGamesSettings();
  if (!settings.notifications) return;

  try {
    const [epicGames, gamerPowerGames] = await Promise.all([
      settings.platforms.epic ? fetchEpicFreeGames() : Promise.resolve([]),
      fetchGamerPowerGames(),
    ]);

    const platformMap = {
      steam:  ['Steam'],
      gog:    ['GOG'],
      itchio: ['itch.io'],
      epic:   ['Epic Games Store'],
    };

    const allowedPlatforms = Object.entries(settings.platforms)
      .filter(([_, enabled]) => enabled)
      .flatMap(([key]) => platformMap[key] ?? [key]);

    let filtered = gamerPowerGames.filter(g => {
      const platformStr = g.platform ?? '';
      const allowed  = allowedPlatforms.some(p =>
        platformStr.toLowerCase().includes(p.toLowerCase())
      );
      if (!allowed) return false;
      
      if (settings.onlyInstant) {
        const type     = g.type     ?? '';
        
        const isDirectGame = type === 'Game';
        const isOfficialPlatform =
          platformStr.toLowerCase().includes('steam')      ||
          platformStr.toLowerCase().includes('epic games') ||
          platformStr.toLowerCase().includes('gog');
          
        const url = (g.url ?? '').toLowerCase();
        const isDirectUrl =
          url.includes('store.steampowered.com') ||
          url.includes('store.epicgames.com')    ||
          url.includes('gog.com/en/game')        ||
          url.includes('gamerpower.com');

        if (!isDirectGame || (!isOfficialPlatform && !isDirectUrl)) return false;
      }
      return true;
    });

    if (settings.platforms.epic) {
      filtered = filtered.filter(g =>
        !g.platform?.toLowerCase().includes('epic')
      );
    }

    const allGames = [...epicGames, ...filtered];

    for (const game of allGames) {
      if (!_shownFreeGames.has(game.id)) {
        _shownFreeGames.add(game.id);

        new Notification({
          title: `🎮 Бесплатная игра: ${game.title}`,
          body:  `${game.platform}${game.endDate ? ` · до ${game.endDate}` : ''}`,
          icon:  path.join(__dirname, '..', '..', 'build', 'icon.png'),
        }).show();

        console.log(`[freeGames] New free game: ${game.title} (${game.platform})`);
      }
    }
  } catch (err) {
    console.error('[freeGames] Check error:', err.message);
  }
}

// ─── Exported: start polling ──────────────────────────────────────

export function startFreeGamesPolling() {
  loadClaimedGames();
  
  setTimeout(() => {
    checkFreeGamesAndNotify();
    autoClaimFreeGames();
  }, 15000);

  restartFreeGamesPolling();
}

// ─── Registration ─────────────────────────────────────────────────

export function register(ipcMain) {
  ipcMain.handle('free-games:get-settings', () => loadFreeGamesSettings());

  ipcMain.handle('free-games:save-settings', (_, settings) => {
    saveFreeGamesSettings(settings);
    restartFreeGamesPolling();
    return { success: true };
  });

  ipcMain.handle('egs:login', async () => {
    try {
      return await egsDirectLogin();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('egs:check-session', async () => {
    return await checkEgsSession();
  });

  ipcMain.handle('egs:claim', async (_, { url }) => {
    try {
      console.log(`[EGS] Manual claim for url=${url}`);
      const hasSession = await checkEgsSession();
      if (!hasSession) {
        return { error: 'Необходима авторизация в Epic Games Store' };
      }
      return await claimEgsGame(url);
    } catch (err) {
      console.error('[EGS] Error:', err.message);
      return { error: err.message };
    }
  });

  // Free games list
  ipcMain.handle('free-games:get', async () => {
    const settings = loadFreeGamesSettings();

    const [epicGames, gamerPowerGames] = await Promise.all([
      settings.platforms.epic ? fetchEpicFreeGames() : [],
      fetchGamerPowerGames(),
    ]);

    const platformMap = {
      steam:  ['Steam'],
      gog:    ['GOG'],
      itchio: ['itch.io'],
      epic:   ['Epic Games Store'],
    };

    const allowedPlatforms = Object.entries(settings.platforms)
      .filter(([_, enabled]) => enabled)
      .flatMap(([key]) => platformMap[key] ?? [key]);

    let filtered = gamerPowerGames.filter(g => {
      const platform = g.platform ?? '';
      const allowed  = allowedPlatforms.some(p =>
        platform.toLowerCase().includes(p.toLowerCase())
      );
      if (!allowed) return false;

      if (settings.onlyInstant) {
        const type        = g.type     ?? '';
        const platformStr = g.platform ?? '';

        const isDirectGame = type === 'Game';
        const isOfficialPlatform =
          platformStr.toLowerCase().includes('steam')      ||
          platformStr.toLowerCase().includes('epic games') ||
          platformStr.toLowerCase().includes('gog');

        const url = (g.url ?? '').toLowerCase();
        const isDirectUrl =
          url.includes('store.steampowered.com') ||
          url.includes('store.epicgames.com')    ||
          url.includes('gog.com/en/game')        ||
          url.includes('gamerpower.com');

        if (!isDirectGame || (!isOfficialPlatform && !isDirectUrl)) return false;
      }

      return true;
    });

    if (settings.platforms.epic) {
      filtered = filtered.filter(g =>
        !g.platform?.toLowerCase().includes('epic')
      );
    }

    const all = [...epicGames, ...filtered].map(g => {
      const appIdStr = String(g.steamAppId || g.id);
      return {
        ...g,
        isClaimed: _claimedGames.has(appIdStr)
      };
    });

    console.log(`[freeGames] After filters: ${all.length} games`);
    console.log(`[freeGames] Settings:`, settings);

    return { success: true, games: all };
  });

  // Steam claim
  ipcMain.handle('steam:claim-free-game', async (_, { appId, subId: manualSubId }) => {
    try {
      console.log(`[claim] IPC manual claim for appId=${appId} subId=${manualSubId}`);
      const result = await claimSteamGame(appId, manualSubId);

      if (result.error) return { error: result.error };
      if (result.alreadyOwned) return { success: false, alreadyOwned: true, msg: 'Игра уже есть в библиотеке' };
      if (result.success) return { success: true, msg: 'Игра добавлена в библиотеку!' };
      
      return { success: false, msg: result.msg || 'Неизвестная ошибка' };

    } catch (err) {
      console.error('[claim] Error:', err.message);
      return { error: err.message };
    }
  });
}
