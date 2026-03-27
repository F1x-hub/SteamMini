import https from 'https';
import { session } from 'electron';
import { timer } from '../utils/helpers.js';

/**
 * Inventory IPC handlers.
 * Channels: inventory:get-cards
 * 
 * Local cache: inventoryCardsCache (module-scoped)
 */

// Module-local cache
let inventoryCardsCache = {
  data: null,
  timestamp: 0,
};

/**
 * Invalidate the inventory cache.
 * Called by market module after batch sell.
 */
export function invalidateInventoryCache() {
  inventoryCardsCache = { data: null, timestamp: 0 };
}

export function register(ipcMain) {
  ipcMain.handle('inventory:get-cards', async (event, steamId, forceRefresh = false) => {
    const t = timer('inventory:get-cards');
    try {
      const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
      if (!forceRefresh && inventoryCardsCache.data && (Date.now() - inventoryCardsCache.timestamp < CACHE_TTL)) {
        t.end(`(${inventoryCardsCache.data.length} cards, cached)`);
        return { success: true, data: inventoryCardsCache.data };
      }

      const ses = session.defaultSession;
      const allCookies = await ses.cookies.get({ domain: 'steamcommunity.com' });
      const sessionId = allCookies.find(c => c.name === 'sessionid')?.value ?? '';
      const loginSecure = allCookies.find(c => c.name === 'steamLoginSecure')?.value ?? '';

      console.log('[inventory] sessionId:', sessionId ? 'OK' : 'MISSING');
      console.log('[inventory] loginSecure:', loginSecure ? 'OK' : 'MISSING');

      if (!loginSecure) {
        t.end(`(error: Steam cookies not found)`);
        return { success: false, error: 'Steam cookies not found' };
      }

      const cookieStr = [
        sessionId ? `sessionid=${sessionId}` : '',
        `steamLoginSecure=${loginSecure}`,
        'Steam_Language=english'
      ].filter(Boolean).join('; ');

      const data = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'steamcommunity.com',
          path: `/profiles/${steamId}/inventory/json/753/6?l=russian`,
          method: 'GET',
          headers: {
            'Cookie': cookieStr,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://steamcommunity.com/',
          }
        };

        const req = https.request(options, (res) => {
          console.log('[inventory] HTTP status:', res.statusCode);

          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode !== 200) {
              console.log('[inventory] Response body (first 200):', body.substring(0, 200));
              reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`));
              return;
            }
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(new Error('Invalid JSON response')); }
          });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        req.end();
      });

      if (!data.success && data.Error) {
        t.end(`(error: ${data.Error})`);
        return { success: false, error: data.Error };
      }

      const descriptions = Object.values(data.rgDescriptions ?? {});
      const assets       = Object.values(data.rgInventory    ?? {});

      // Group assets by classid+instanceid to calculate amounts correctly for old API
      const assetAmounts = new Map();
      for (const asset of assets) {
        const key = `${asset.classid}_${asset.instanceid}`;
        const amount = parseInt(asset.amount || 1, 10);
        
        if (!assetAmounts.has(key)) {
          assetAmounts.set(key, { amount: amount, assetId: asset.id, assetIds: [asset.id] });
        } else {
          assetAmounts.get(key).amount += amount;
          if (!assetAmounts.get(key).assetIds.includes(asset.id)) {
            assetAmounts.get(key).assetIds.push(asset.id);
          }
        }
      }

      const finalCards = [];
      
      for (const [key, itemInfo] of assetAmounts.entries()) {
        const desc = descriptions.find(d => `${d.classid}_${d.instanceid}` === key);
        if (!desc) continue;
        
        const isCard = desc.tags?.some(t => t.category === 'item_class' && t.internal_name === 'item_class_2');
        if (!isCard) continue;

        const gameTag = desc.tags?.find(t => t.category === 'Game');
        const gameName = gameTag?.localized_tag_name ?? gameTag?.name ?? '';

        finalCards.push({
          assetId: itemInfo.assetId,
          assetIds: itemInfo.assetIds,
          classId: desc.classid,
          amount: itemInfo.amount,
          name: desc.name ?? '',
          marketHashName: desc.market_hash_name ?? desc.name ?? '',
          gameName: gameName,
          tradable: desc.tradable === 1,
          marketable: desc.marketable === 1,
          iconUrl: desc.icon_url ? `https://community.akamai.steamstatic.com/economy/image/${desc.icon_url}/96fx96f` : null
        });
      }

      // Sort by game name then card name
      finalCards.sort((a, b) => {
        const gCmp = a.gameName.localeCompare(b.gameName);
        if (gCmp !== 0) return gCmp;
        return a.name.localeCompare(b.name);
      });

      console.log(`[inventory] Found ${finalCards.length} trading cards`);

      inventoryCardsCache = {
        data: finalCards,
        timestamp: Date.now()
      };

      t.end(`(${finalCards.length} cards)`);
      return { success: true, data: finalCards };
    } catch (error) {
      console.error('[inventory:get-cards] Failed:', error);
      t.end(`(error: ${error.message})`);
      return { success: false, error: error.message };
    }
  });
}
