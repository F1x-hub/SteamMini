import https from 'https';
import { app, session } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { httpsGet, timer, sellerPriceFromBuyerPrice } from '../utils/helpers.js';
import { invalidateInventoryCache } from './inventory.js';

// ─── Price Cache with 24h TTL ─────────────────────────────────────

const priceCache = new Map();
const PRICE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getPriceCached(marketHashName) {
  const entry = priceCache.get(marketHashName);
  if (entry && Date.now() - entry.timestamp < PRICE_CACHE_TTL) {
    return entry;
  }
  return null;
}

function setPriceCached(marketHashName, data) {
  priceCache.set(marketHashName, { ...data, timestamp: Date.now() });
}

// ─── Disk Persistence ─────────────────────────────────────────────

let priceCacheFile = null;

function getPriceCacheFile() {
  if (!priceCacheFile) {
    priceCacheFile = join(app.getPath('userData'), 'price-cache.json');
  }
  return priceCacheFile;
}

function loadPriceCache() {
  try {
    const data = JSON.parse(readFileSync(getPriceCacheFile(), 'utf-8'));
    const now = Date.now();
    let loaded = 0;
    for (const [key, val] of Object.entries(data)) {
      // Only load entries that haven't expired
      if (val.timestamp && now - val.timestamp < PRICE_CACHE_TTL) {
        priceCache.set(key, val);
        loaded++;
      }
    }
    console.log(`[priceCache] Loaded ${loaded} entries from disk (${Object.keys(data).length} total on disk)`);
  } catch { /* file doesn't exist yet — ok */ }
}

function savePriceCache() {
  try {
    const obj = Object.fromEntries(priceCache);
    writeFileSync(getPriceCacheFile(), JSON.stringify(obj));
    console.log(`[priceCache] Saved ${priceCache.size} entries to disk`);
  } catch (err) {
    console.error('[priceCache] Failed to save:', err.message);
  }
}

// Load cache at module init
loadPriceCache();

// Save every 5 minutes
setInterval(savePriceCache, 5 * 60 * 1000);

// Save on app quit
app.on('before-quit', savePriceCache);

/**
 * Market IPC handlers.
 * Channels: market:get-price, market:sell-item, market:auto-sell-batch,
 *           market:get-histogram, market:get-item-nameid, market:get-listings,
 *           market:cancel-listing, market:get-history, market:cancel-batch
 *
 * Exports: getHistogram, getItemNameId — used by freeGames for insta-sell
 */

// ─── Helpers ──────────────────────────────────────────────────────

export async function fetchPriceWithRetry(marketHashName, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'steamcommunity.com',
          path:     '/market/priceoverview/?' +
                    new URLSearchParams({
                      appid: '753', currency: '1',
                      market_hash_name: marketHashName,
                    }).toString(),
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer':    'https://steamcommunity.com/market/',
          }
        }, res => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            console.log(`[price] ${marketHashName}: HTTP ${res.statusCode}`);
            
            if (res.statusCode === 429) {
              const retryAfter = parseInt(res.headers['retry-after'] || '60');
              const waitMs = retryAfter * 1000;
              console.warn(`[price] 429 Rate Limit — waiting ${waitMs}ms before retry...`);
              reject({ statusCode: 429, waitMs });
              return;
            }

            if (!body.trim().startsWith('{')) {
              console.error(`[price] Not JSON (attempt ${attempt + 1}):`, body.substring(0, 100));
              reject(new Error('Not JSON response'));
              return;
            }
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(new Error('Invalid JSON')); }
          });
        });
        req.on('error', reject);
        req.end();
      });
      return result;
    } catch (err) {
      if (err.statusCode === 429) {
        await new Promise(r => setTimeout(r, err.waitMs));
        // Retry one more time after 429
        if (attempt < retries - 1) continue;
      }
      
      console.error(`[price] Attempt ${attempt + 1} failed:`, err.message || err);
      if (attempt < retries - 1) {
        const delay = 1000 * Math.pow(2, attempt);
        console.log(`[price] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  return null;
}

export async function getHistogram(itemNameId) {
  const data = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'steamcommunity.com',
      path:     `/market/itemordershistogram?` +
                `country=US&language=english&currency=1` +
                `&item_nameid=${itemNameId}&two_factor=0`,
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer':    'https://steamcommunity.com/market/',
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid JSON histogram')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
  return data;
}

export async function getItemNameId(marketHashName) {
  const data = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'steamcommunity.com',
      path:     `/market/listings/753/${encodeURIComponent(marketHashName)}`,
      method:   'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.end();
  });
  const match = data.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
  if (!match) throw new Error('item_nameid not found');
  return match[1];
}

// ─── Cache to avoid redundant API hits for pagination ───────
let activeListingsCache = { timestamp: 0, data: null };

function invalidateListingsCache() {
  activeListingsCache.timestamp = 0;
  activeListingsCache.data = null;
}

async function cancelSingleListing(listingId) {
  try {
    const ses         = session.defaultSession;
    const allCookies  = await ses.cookies.get({ domain: 'steamcommunity.com' });
    const sessionId   = allCookies.find(c => c.name === 'sessionid')?.value      ?? '';
    const loginSecure = allCookies.find(c => c.name === 'steamLoginSecure')?.value ?? '';

    const body = new URLSearchParams({ sessionid: sessionId }).toString();

    const result = await httpsGet({
      hostname: 'steamcommunity.com',
      path:     `/market/removelisting/${listingId}`,
      method:   'POST',
      headers: {
        'Cookie':         `sessionid=${sessionId}; steamLoginSecure=${loginSecure}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'Mozilla/5.0',
        'Referer':        'https://steamcommunity.com/market/',
        'Origin':         'https://steamcommunity.com',
      }
    }, body);

    invalidateListingsCache(); // force refresh cache after cancellation
    return { success: result.status === 200 };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Queue Helper ─────────────────────────────────────────────────

let marketQueue = Promise.resolve();
const MARKET_DELAY_MS = 4000;

function queueMarketRequest(fn) {
  marketQueue = marketQueue.then(() =>
    new Promise(resolve => setTimeout(resolve, MARKET_DELAY_MS)).then(fn)
  );
  return marketQueue;
}

// ─── Registration ─────────────────────────────────────────────────

export function register(ipcMain) {
  // ─── Get Price ──────────────────────────────────────────
  ipcMain.handle('market:get-price', async (_, { marketHashName, knownPriceCents }) => {
    if (knownPriceCents != null) {
      return { success: true, lowestPriceCents: knownPriceCents, medianPriceCents: null, lowestPrice: null, medianPrice: null, volume: null };
    }

    // Check cache first
    const cached = getPriceCached(marketHashName);
    if (cached !== null) {
      console.log(`[price] ${marketHashName}: cache hit (${cached.lowestPriceCents}¢)`);
      return {
        success:          true,
        lowestPriceCents: cached.lowestPriceCents,
        medianPriceCents: cached.medianPriceCents ?? null,
        lowestPrice:      cached.lowestPrice ?? null,
        medianPrice:      cached.medianPrice ?? null,
        volume:           cached.volume ?? null,
      };
    }

    return queueMarketRequest(async () => {
      // Re-check cache (might have been filled while waiting in queue)
      const cachedAgain = getPriceCached(marketHashName);
      if (cachedAgain !== null) {
        console.log(`[price] ${marketHashName}: cache hit after queue (${cachedAgain.lowestPriceCents}¢)`);
        return {
          success:          true,
          lowestPriceCents: cachedAgain.lowestPriceCents,
          medianPriceCents: cachedAgain.medianPriceCents ?? null,
          lowestPrice:      cachedAgain.lowestPrice ?? null,
          medianPrice:      cachedAgain.medianPrice ?? null,
          volume:           cachedAgain.volume ?? null,
        };
      }

      console.log('[market:get-price] Input marketHashName:', JSON.stringify(marketHashName));
      const t = timer(`market:get-price "${marketHashName}"`);
      try {
        const data = await fetchPriceWithRetry(marketHashName);
        if (!data || !data.success) {
          t.end(`(error: Failed to fetch price)`);
          return { error: 'Failed to fetch price' };
        }
        
        const parsePriceCents = (str) => {
          if (!str) return null;
          const num = parseFloat(str.replace(/[^0-9.]/g, ''));
          return Math.round(num * 100);
        };

        const result = {
          success:          true,
          lowestPriceCents: parsePriceCents(data.lowest_price),
          medianPriceCents: parsePriceCents(data.median_price),
          lowestPrice:      data.lowest_price  ?? null,
          medianPrice:      data.median_price  ?? null,
          volume:           data.volume        ?? null,
        };

        // Save to cache
        setPriceCached(marketHashName, result);

        t.end();
        return result;
      } catch (err) {
        t.end(`(error: ${err.message})`);
        return { error: err.message };
      }
    });
  });

  // ─── Get Histogram ──────────────────────────────────────
  ipcMain.handle('market:get-histogram', async (_, { itemNameId }) => {
    try {
      const data = await getHistogram(itemNameId);

      const parseOrderTable = (html) => {
        if (!html || typeof html !== 'string') return [];
        const rows = [];
        const regex = /<td[^>]*>\s*([^<]+)\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
          const price = match[1].trim();
          const qty   = match[2].trim();
          if (price === 'Price' || price === 'Quantity') continue;
          rows.push({ price, quantity: qty });
        }
        return rows.slice(0, 5);
      };

      const centsToPrice = (str) => {
        if (!str) return '—';
        const cents = parseInt(str);
        if (isNaN(cents)) return str;
        return `$${(cents / 100).toFixed(2)}`;
      };

      const sellOrders = parseOrderTable(data.sell_order_table);
      const buyOrders  = parseOrderTable(data.buy_order_table);

      return {
        success:         data.success === 1,
        sellOrders,
        buyOrders,
        sellOrderCount:  sellOrders.reduce((sum, o) => sum + (parseInt(o.quantity.replace(/,/g, '')) || 0), 0),
        buyOrderCount:   buyOrders.reduce((sum, o) => sum + (parseInt(o.quantity.replace(/,/g, '')) || 0), 0),
        lowestSellOrder:  centsToPrice(data.lowest_sell_order),
        highestBuyOrder:  centsToPrice(data.highest_buy_order),
        lowestSellOrderCents:  parseInt(data.lowest_sell_order || '0'),
        highestBuyOrderCents:  parseInt(data.highest_buy_order || '0'),
      };
    } catch (err) {
      console.error('[histogram] error:', err.message);
      return { error: err.message };
    }
  });

  // ─── Get Item Name ID ───────────────────────────────────
  ipcMain.handle('market:get-item-nameid', async (_, { marketHashName }) => {
    try {
      const itemNameId = await getItemNameId(marketHashName);
      return { success: true, itemNameId };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ─── Sell Item ──────────────────────────────────────────
  ipcMain.handle('market:sell-item', async (_, { assetId, priceCents }) => {
    try {
      const ses = session.defaultSession;
      const allCookies = await ses.cookies.get({ domain: 'steamcommunity.com' });
      const sessionId = allCookies.find(c => c.name === 'sessionid')?.value ?? '';
      const loginSecure = allCookies.find(c => c.name === 'steamLoginSecure')?.value ?? '';
      if (!sessionId || !loginSecure) return { error: 'Steam cookies not found' };

      const sellerPrice = sellerPriceFromBuyerPrice(priceCents);
      const postData = new URLSearchParams({
        sessionid: sessionId,
        appid: '753',
        contextid: '6',
        assetid: String(assetId),
        amount: '1',
        price: String(sellerPrice),
      }).toString();

      const data = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'steamcommunity.com',
          path: '/market/sellitem/',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Content-Length': postData.length,
            'Cookie': `sessionid=${sessionId}; steamLoginSecure=${loginSecure}`,
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://steamcommunity.com/market/',
          }
        }, res => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
      return data;
    } catch (err) {
      return { error: err.message };
    }
  });

  // ─── Auto Sell Batch ────────────────────────────────────
  ipcMain.handle('market:auto-sell-batch', async (event, { cards, offsetCents, delayMs = 1000, instaSell = false }) => {
    const ses = session.defaultSession;
    const allCookies = await ses.cookies.get({ domain: 'steamcommunity.com' });
    const sessionId = allCookies.find(c => c.name === 'sessionid')?.value ?? '';
    const loginSecure = allCookies.find(c => c.name === 'steamLoginSecure')?.value ?? '';
    if (!sessionId || !loginSecure) return { error: 'Steam cookies not found' };

    const results = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      event.sender.send('market:auto-sell-progress', {
        index: i, total: cards.length, card: card.name, status: 'fetching_price'
      });

      try {
        let buyerPriceCents = null;

        if (instaSell) {
          const nameId = await getItemNameId(card.marketHashName || card.name);
          const histo  = await getHistogram(nameId);
          buyerPriceCents = parseInt(histo?.highest_buy_order ?? '0');

          if (buyerPriceCents === 0) {
            results.push({ ...card, status: 'error', error: 'No buyers' });
            continue;
          }
          console.log(`[instaSell] ${card.name}: highest buyer=$${(buyerPriceCents/100).toFixed(2)}`);
        } else {
          if (card.knownPriceCents) {
            buyerPriceCents = card.knownPriceCents;
            console.log(`[auto-sell] Using cached price for ${card.name}: ${buyerPriceCents}¢`);
          } else {
            const priceData = await fetchPriceWithRetry(card.marketHashName || card.name);
            if (!priceData || !priceData.success || !priceData.lowest_price) {
              results.push({ assetId: card.assetId, name: card.name, status: 'error', error: 'No price available' });
              continue;
            }
            buyerPriceCents = Math.round(parseFloat(priceData.lowest_price.replace(/[^0-9.]/g, '')) * 100);
          }
          buyerPriceCents = Math.max(1, buyerPriceCents + offsetCents);
        }

        const targetBuyerPrice = buyerPriceCents;
        const sellPrice = sellerPriceFromBuyerPrice(targetBuyerPrice);

        console.log(`[auto-sell] ${card.name}: target buyer=$${(targetBuyerPrice/100).toFixed(2)} seller receives=$${(sellPrice/100).toFixed(2)}`);

        event.sender.send('market:auto-sell-progress', {
          index: i, total: cards.length, card: card.name, status: 'selling', price: targetBuyerPrice
        });

        const body = new URLSearchParams({
          sessionid: sessionId, appid: '753', contextid: '6', assetid: String(card.assetId), amount: '1', price: String(sellPrice)
        }).toString();

        const sellResult = await httpsGet({
          hostname: 'steamcommunity.com',
          path: '/market/sellitem/',
          method: 'POST',
          headers: {
            'Cookie': `sessionid=${sessionId}; steamLoginSecure=${loginSecure}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://steamcommunity.com/my/inventory/',
            'Origin': 'https://steamcommunity.com',
          }
        }, body).then(r => {
          try { return { status: r.status, ...JSON.parse(r.body) }; }
          catch { return { status: r.status, success: false, message: 'Invalid JSON' }; }
        });

        results.push({
          assetId: card.assetId, name: card.name, status: sellResult.success ? 'success' : 'error',
          soldPriceCents: sellPrice, requiresConfirmation: sellResult.requires_confirmation === 1,
          error: sellResult.success ? null : sellResult.message
        });
      } catch (err) {
        results.push({ assetId: card.assetId, name: card.name, status: 'error', error: err.message });
      }

      if (i < cards.length - 1) {
        const pause = Math.max(delayMs, 1000);
        console.log(`[auto-sell] Waiting ${pause}ms...`);
        await new Promise(r => setTimeout(r, pause));
      }
    }

    invalidateInventoryCache();
    return { success: true, results };
  });

// ─── Get Listings ───────────────────────────────────────
  ipcMain.handle('market:get-listings', async (_, params = {}) => {
    const t = timer('market:get-listings');
    try {
      const forceRefresh = !!params?.forceRefresh;

      const ses         = session.defaultSession;
      const allCookies  = await ses.cookies.get({ domain: 'steamcommunity.com' });
      const sessionId   = allCookies.find(c => c.name === 'sessionid')?.value      ?? '';
      const loginSecure = allCookies.find(c => c.name === 'steamLoginSecure')?.value ?? '';

      if (!loginSecure) {
        t.end(`(error: Steam cookies not found)`);
        return { error: 'Steam cookies not found' };
      }

      if (forceRefresh || Date.now() - activeListingsCache.timestamp > 30000 || !activeListingsCache.data) {
        let allListings = [];
        let totalCount = 0;
        let reqStart = 0;
        let reqCount = 100;

        while (true) {
          const data = await httpsGet({
            hostname: 'steamcommunity.com',
            path:     `/market/mylistings?norender=1&start=${reqStart}&count=${reqCount}`,
            method:   'GET',
            headers: {
              'Cookie':          `sessionid=${sessionId}; steamLoginSecure=${loginSecure}`,
              'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer':         'https://steamcommunity.com/market/',
              'Accept':          'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
            }
          }).then(r => {
            try { return JSON.parse(r.body); }
            catch { throw new Error('Invalid JSON'); }
          });

          if (!data.success) {
            throw new Error('Failed to load listings');
          }

          totalCount = data.num_active_listings ?? data.total_count ?? 0;
          const currentListings = data.listings ?? [];
          
          if (currentListings.length === 0) break;

          for (const listing of currentListings) {
            const asset = listing.asset ?? {};
            const sellerCents = parseInt(listing.converted_price_per_unit ?? 0);
            const feeCents    = parseInt(listing.converted_fee_per_unit   ?? 0);
            const buyerCents  = sellerCents + feeCents;

            allListings.push({
              listingId:        listing.listingid,
              buyerPriceCents:  buyerCents,
              sellerPriceCents: sellerCents,
              buyerPrice:       `$${(buyerCents  / 100).toFixed(2)}`,
              sellerPrice:      `$${(sellerCents / 100).toFixed(2)}`,
              name:             asset.market_name  ?? asset.name ?? '—',
              gameName:         asset.type         ?? '',
              iconUrl:          asset.icon_url
                ? `https://community.akamai.steamstatic.com/economy/image/${asset.icon_url}/96fx96f`
                : null,
              listedOn:         listing.time_created ?? 0,
              listedOnStr:      listing.time_created_str ?? '',
              cancelUrl:        listing.cancel_url ?? null,
            });
          }

          reqStart += reqCount;
          if (reqStart >= totalCount || allListings.length >= 2000) break;
          await new Promise(r => setTimeout(r, 600)); // Rate limit pause
        }

        const totalBuyer  = allListings.reduce((s, l) => s + l.buyerPriceCents,  0);
        const totalSeller = allListings.reduce((s, l) => s + l.sellerPriceCents, 0);

        activeListingsCache.data = {
          totalCount,
          totalBuyer,
          totalSeller,
          allListings
        };
        activeListingsCache.timestamp = Date.now();
      }

      const cache = activeListingsCache.data;
      t.end(`(${cache.allListings.length} total active listings fetched)`);

      return {
        success:      true,
        total:        cache.totalCount,
        totalBuyer:   `$${(cache.totalBuyer  / 100).toFixed(2)}`,
        totalSeller:  `$${(cache.totalSeller / 100).toFixed(2)}`,
        allListings:  cache.allListings,
      };

    } catch (err) {
      console.error('[listings] Error:', err.message);
      t.end(`(error: ${err.message})`);
      return { error: err.message };
    }
  });

  // ─── Cancel Listing ─────────────────────────────────────
  ipcMain.handle('market:cancel-listing', async (_, { listingId }) => {
    return await cancelSingleListing(listingId);
  });

  // ─── Get History ────────────────────────────────────────
  ipcMain.handle('market:get-history', async (_, { start = 0, count = 25 } = {}) => {
    const t = timer('market:get-history');
    try {
      const ses         = session.defaultSession;
      const allCookies  = await ses.cookies.get({ domain: 'steamcommunity.com' });
      const sessionId   = allCookies.find(c => c.name === 'sessionid')?.value      ?? '';
      const loginSecure = allCookies.find(c => c.name === 'steamLoginSecure')?.value ?? '';

      const data = await httpsGet({
        hostname: 'steamcommunity.com',
        path:     `/market/myhistory?norender=1&count=${count}&start=${start}`,
        method:   'GET',
        headers: {
          'Cookie':     `sessionid=${sessionId}; steamLoginSecure=${loginSecure}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }).then(r => {
        try { return JSON.parse(r.body); }
        catch (e) { throw e; }
      });

      console.log('[history] success:', data.success);
      console.log('[history] events count:', data.events?.length);
      console.log('[history] listings type:', typeof data.listings,
        Array.isArray(data.listings) ? 'array' : 'object',
        'keys:', Object.keys(data.listings ?? {}).length);
      console.log('[history] purchases type:', typeof data.purchases,
        Array.isArray(data.purchases) ? 'array' : 'object',
        'keys:', Object.keys(data.purchases ?? {}).length);

      const events = (data.events ?? []).map(event => {
        const listing  = (data.listings  ?? {})[event.listingid];
        const purchase = (data.purchases ?? {})[event.listingid]
                      ?? (data.purchases ?? {})[event.purchaseid];

        const assetRef  = listing?.asset ?? purchase?.asset ?? {};
        const appId     = String(assetRef.appid     ?? '753');
        const contextId = String(assetRef.contextid ?? '6');
        const assetId   = String(assetRef.id        ?? '');

        let asset = data.assets?.[appId]?.[contextId]?.[assetId] ?? {};

        if (Object.keys(asset).length === 0 && assetRef.unowned_id) {
          asset = data.assets?.[appId]?.[contextId]?.[assetRef.unowned_id] ?? {};
        }

        console.log(`[history] ${event.listingid} price fields:`, {
          price:                        listing?.price,
          original_price:               listing?.original_price,
          fee:                          listing?.fee,
          converted_price:              listing?.converted_price,
          converted_price_per_unit:     listing?.converted_price_per_unit,
          converted_fee_per_unit:       listing?.converted_fee_per_unit,
          steam_fee:                    listing?.steam_fee,
          publisher_fee:                listing?.publisher_fee,
        });

        console.log(`[history] ${event.listingid}: assetId=${assetId} found=${!!asset.market_name} name=${asset.market_name}`);

        const iconHash = asset.icon_url ?? asset.icon_url_large ?? '';
        const iconUrl  = iconHash && iconHash.length > 20
          ? `https://community.akamai.steamstatic.com/economy/image/${iconHash}/96fx96f`
          : null;

        const sellerPrice = parseInt(listing?.original_price ?? 0);
        const buyerPrice  = parseInt(purchase?.original_price ?? 0);

        console.log(`[history] ${event.listingid}: sellerPrice=${sellerPrice} buyerPrice=${buyerPrice}`);

        const isSale     = event.event_type === 3;
        const isPurchase = event.event_type === 1;

        const amountCents = isSale ? sellerPrice : buyerPrice;
        const amountFmt   = amountCents > 0
          ? (isSale
              ? `+$${(sellerPrice / 100).toFixed(2)}`
              : `-$${(buyerPrice / 100).toFixed(2)}`)
          : '$0.00';

        return {
          type:        event.event_type,
          listingId:   event.listingid,
          date:        event.time_event,
          dateStr:     event.date_event ?? event.time_event_description ?? '',
          name:        asset.market_name ?? asset.name ?? '—',
          gameName:    asset.type        ?? '',
          iconUrl,
          amountCents,
          amountFmt,
          isSale,
          isPurchase,
        };
      });

      if (events.length > 0) {
        console.log('[history] First processed:', JSON.stringify(events[0], null, 2));
        console.log('[history] Has icon:', !!events[0]?.iconUrl);
        console.log('[history] Has name:', events[0]?.name !== '—');
      }

      t.end(`(${events.length} events)`);
      return {
        success: true,
        total:   data.total_count ?? 0,
        events:  events
      };
    } catch (err) {
      console.error('[history] Error:', err.message);
      t.end(`(error: ${err.message})`);
      return { error: err.message };
    }
  });

  // ─── Cancel Batch ───────────────────────────────────────
  ipcMain.handle('market:cancel-batch', async (event, { listingIds }) => {
    const results = [];

    for (let i = 0; i < listingIds.length; i++) {
      const id = listingIds[i];

      event.sender.send('market:cancel-progress', {
        index: i, total: listingIds.length, listingId: id
      });

      const result = await cancelSingleListing(id);
      results.push({ listingId: id, success: result.success });

      if (i < listingIds.length - 1)
        await new Promise(r => setTimeout(r, 300));
    }

    return { success: true, results };
  });

  // ─── Prefetch Prices (background) ──────────────────────
  ipcMain.handle('market:prefetch-prices', async (_, marketHashNames) => {
    const missing = marketHashNames.filter(n => {
      const cached = getPriceCached(n);
      return !cached || cached.lowestPriceCents == null;
    });
    console.log(`[prefetch] ${missing.length} prices to load in background (${marketHashNames.length - missing.length} already cached)`);

    if (missing.length === 0) return { queued: 0 };

    // Fire-and-forget background task
    ;(async () => {
      const parsePriceCents = (str) => {
        if (!str) return null;
        const num = parseFloat(str.replace(/[^0-9.]/g, ''));
        return Math.round(num * 100);
      };

      for (const name of missing) {
        // Re-check — may have been loaded while waiting
        if (getPriceCached(name) !== null) continue;

        await queueMarketRequest(async () => {
          // One more check after queue wait
          if (getPriceCached(name) !== null) return;

          try {
            const data = await fetchPriceWithRetry(name);
            if (data && data.success) {
              setPriceCached(name, {
                success:          true,
                lowestPriceCents: parsePriceCents(data.lowest_price),
                medianPriceCents: parsePriceCents(data.median_price),
                lowestPrice:      data.lowest_price  ?? null,
                medianPrice:      data.median_price  ?? null,
                volume:           data.volume        ?? null,
              });
              console.log(`[prefetch] ${name}: cached (${parsePriceCents(data.lowest_price)}¢)`);
            }
          } catch (err) {
            console.error(`[prefetch] ${name}: error — ${err.message}`);
          }
        });
      }
      savePriceCache();
      console.log('[prefetch] Background price loading complete');
    })();

    return { queued: missing.length };
  });
}
