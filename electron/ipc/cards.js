import https from 'https';
import zlib from 'zlib';
import { session, webContents } from 'electron';
import { getSteamCookies, dedupe } from '../utils/helpers.js';
import cardsBridge from '../cardsBridge.js';

/**
 * Card drops and game cards IPC handlers.
 * Channels: cards:get-all, cards:get-for-app, cards:debug, cards:debug-electron-cookies,
 *           cards:debug-all-sessions, game:get-cards
 *
 * Local caches: cardsParseCache (module-scoped)
 */

// ─── Module-local caches ──────────────────────────────────────────
let cardsParseInProgress = false;
let cardsParseCache = null;
let cardsParseCacheTime = 0;
const CARDS_PARSE_TTL = 10 * 60 * 1000; // 10 minutes

const STEAM_ID = '76561198271597868';

// ─── Helpers ──────────────────────────────────────────────────────

function httpsGetJson(url, extraHeaders = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'Accept-Encoding': 'gzip',
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        ...extraHeaders
      }
    }, (res) => {
      let stream = res;
      if (res.headers['content-encoding'] === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      }
      let data = '';
      stream.on('data', chunk => data += chunk);
      stream.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

// ─── Registration ─────────────────────────────────────────────────

export function register(ipcMain) {
  // ─── Cards: Get All (badge parser) ──────────────────────
  ipcMain.handle('cards:get-all', async (event, steamId) => {
    const now = Date.now();
    if (cardsParseCache && (now - cardsParseCacheTime) < CARDS_PARSE_TTL) {
      console.log('[Cards] Returning cached parse result');
      return cardsParseCache;
    }

    if (cardsParseInProgress) {
      console.log('[Cards] Parse already in progress, skipping');
      return cardsParseCache || { error: 'Parse already in progress' };
    }
    cardsParseInProgress = true;
    try {
      const { sessionId, loginSecure } = await getSteamCookies();

      if (!sessionId || !loginSecure) {
        return { 
          error: 'Steam cookies not found in Electron session. Make sure you are logged into Steam community.' 
        };
      }

      const result = await cardsBridge.send('get_all_drops', {
        sessionId,
        loginSecure,
        steamId,
      });
      if (result && !result.error) {
        cardsParseCache = result;
        cardsParseCacheTime = Date.now();
      }
      return result;
    } catch (err) {
      return { error: err.message };
    } finally {
      cardsParseInProgress = false;
    }
  });

  // ─── Cards: Get For App ─────────────────────────────────
  ipcMain.handle('cards:get-for-app', async (_, { appId, steamId }) => {
    try {
      const { sessionId, loginSecure } = await getSteamCookies();

      if (!sessionId || !loginSecure)
        return { error: 'Steam cookies not found' };

      return await cardsBridge.send('get_drops_for_app', {
        appId: String(appId),
        sessionId,
        loginSecure,
        steamId,
      });
    } catch (err) {
      return { error: err.message };
    }
  });

  // ─── Cards: Debug ───────────────────────────────────────
  ipcMain.handle('cards:debug', async () => {
    return await cardsBridge.send('debug_cookies');
  });

  ipcMain.handle('cards:debug-electron-cookies', async () => {
    const ses     = session.defaultSession;
    const domains = [
      'steamcommunity.com',
      'store.steampowered.com',
      'help.steampowered.com',
      'checkout.steampowered.com',
      'steam-chat.com',
    ];

    const result = {};
    for (const domain of domains) {
      const cookies = await ses.cookies.get({ domain });
      result[domain] = cookies.map(c => c.name);
    }

    return result;
  });

  ipcMain.handle('cards:debug-all-sessions', async () => {
    const result = {
      defaultSession: {},
      webContents: [],
    };

    for (const domain of ['steamcommunity.com', 'store.steampowered.com']) {
      const cookies = await session.defaultSession.cookies.get({ domain });
      result.defaultSession[domain] = cookies.map(c => c.name);
    }

    const { webContents: wcModule } = await import('electron');
    for (const wc of wcModule.getAllWebContents()) {
      if (wc.isDestroyed()) continue;
      const wcInfo = {
        id:  wc.id,
        url: wc.getURL(),
        cookies: {}
      };
      for (const domain of ['steamcommunity.com', 'store.steampowered.com']) {
        try {
          const cookies = await wc.session.cookies.get({ domain });
          wcInfo.cookies[domain] = cookies.map(c => c.name);
        } catch (e) {
          wcInfo.cookies[domain] = [`Error: ${e.message}`];
        }
      }
      result.webContents.push(wcInfo);
    }

    return result;
  });

  // ─── Game Cards (Market search + inventory ownership) ───
  ipcMain.handle('game:get-cards', (event, appId) => {
    return dedupe(`cards-${appId}`, async () => {
      const cookies = await session.defaultSession.cookies.get({ domain: 'steamcommunity.com' });
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      async function fetchAllMarketCards() {
        const base =
          `https://steamcommunity.com/market/search/render/` +
          `?appid=753` +
          `&category_753_Game[]=tag_app_${appId}` +
          `&category_753_cardborder[]=tag_cardborder_0` +
          `&category_753_item_class[]=tag_item_class_2` +
          `&norender=1&language=english&count=10`;

        const first = await httpsGetJson(`${base}&start=0`);
        if (!first?.success || !first.total_count) return { totalCount: 0, cards: [] };

        const totalCount = first.total_count;
        let results = [...(first.results || [])];

        let start = 10;
        while (results.length < totalCount) {
          const page = await httpsGetJson(`${base}&start=${start}`);
          if (!page?.results?.length) break;
          results = results.concat(page.results);
          start += 10;
        }

        const cards = results.map(item => ({
          name: item.name,
          hash: item.hash_name,
          icon: item.asset_description?.icon_url || ''
        }));

        return { totalCount, cards };
      }

      async function fetchInventory() {
        const url = `https://steamcommunity.com/profiles/${STEAM_ID}/inventory/json/753/6?l=english&trading=1`;
        const json = await httpsGetJson(url, {
          'Cookie': cookieHeader,
          'Referer': 'https://steamcommunity.com/'
        });
        console.log(`[cards] inv response keys:`, json ? Object.keys(json) : 'null');

        if (!json) return null;

        const descriptions = json.rgDescriptions
          ? Object.values(json.rgDescriptions)
          : (json.descriptions || []);

        console.log(`[cards] descriptions count: ${descriptions.length}`);
        if (descriptions.length > 0) {
          console.log(`[cards] sample:`, JSON.stringify(descriptions[0]).slice(0, 200));
        }

        return { descriptions };
      }

      const [{ totalCount, cards: allCards }, inventoryData] = await Promise.all([
        fetchAllMarketCards(),
        fetchInventory()
      ]);

      if (!totalCount) return { hasCards: false, cards: [] };

      const ownedHashes = new Set();
      const descriptions = inventoryData?.descriptions || [];

      descriptions.forEach(desc => {
        const tags = desc.tags || [];
        const isCard     = tags.some(t => t.internal_name === 'item_class_2');
        const isThisGame = tags.some(t => t.internal_name === `app_${appId}`);
        const isNotFoil  = tags.some(t => t.internal_name === 'cardborder_0');
        if (isCard && isThisGame && isNotFoil) {
          ownedHashes.add(desc.market_hash_name);
        }
      });

      console.log(`[cards] appId=${appId} total=${totalCount} shown=${allCards.length} owned=${ownedHashes.size}`);

      const cards = allCards.map(card => ({
        ...card,
        owned: ownedHashes.has(card.hash)
      }));

      const ownedCount = cards.filter(c => c.owned).length;
      const remaining  = totalCount - ownedCount;

      return { hasCards: true, totalCount, ownedCount, remaining, cards };
    });
  });
}
