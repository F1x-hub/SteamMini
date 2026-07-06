const GG_KEY = 'eweWGed62TasvgKaxXFct_D2leDL62H9'; // https://gg.deals/api/
const GG_REGION = 'us';

const isPackaged = window.location.protocol === 'file:';
const GG_API_BASE = isPackaged ? 'https://api.gg.deals' : '/api/ggdeals';

const cache = new Map();
const TTL = 15 * 60 * 1000; // 15 min

/**
 * Fetches keyshop prices for a Steam app from GG.deals.
 * Uses the Vite dev proxy at /api/ggdeals.
 * @param {string|number} appId - Steam App ID
 * @returns {Promise<object|null>}
 */
export async function getGGDealsKeyshops(appId) {
  const cacheKey = `gg_${appId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;

  const res = await fetch(
    `${GG_API_BASE}/v1/prices/by-steam-app-id/?key=${GG_KEY}&ids=${appId}&region=${GG_REGION}`
  );
  if (res.status === 429) throw new Error('rate_limit');
  if (!res.ok) return null;

  const json = await res.json();
  const data = json?.data?.[String(appId)] ?? null;

  cache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

export async function getGGDealsKeyshopsBatch(appIds) {
  if (!appIds || appIds.length === 0) return {};

  const uniqueIds = [...new Set(appIds.map(String))];
  const results = {};
  const neededIds = [];

  for (const id of uniqueIds) {
    const cacheKey = `gg_${id}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < TTL) {
      results[id] = hit.data;
    } else {
      neededIds.push(id);
    }
  }

  if (neededIds.length === 0) return results;

  const chunkSize = 50;
  for (let i = 0; i < neededIds.length; i += chunkSize) {
    const chunk = neededIds.slice(i, i + chunkSize);
    try {
      const res = await fetch(`${GG_API_BASE}/v1/prices/by-steam-app-id/?key=${GG_KEY}&ids=${chunk.join(',')}&region=${GG_REGION}`);
      if (!res.ok) continue;
      const json = await res.json();
      
      const dataMap = json?.data || {};
      for (const id of chunk) {
        const data = dataMap[id] ?? null;
        results[id] = data;
        cache.set(`gg_${id}`, { data, ts: Date.now() });
      }
    } catch (e) {
      console.error('Failed to fetch ggdeals keyshops batch:', e);
    }
  }
  
  return results;
}

export { GG_REGION };
