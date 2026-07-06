const CACHE_KEY = 'hltb_cache_v1';
const TTL = 7 * 24 * 60 * 60 * 1000;

export function getHltbCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setHltbCache(map) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(map));
}

export function clearHltbCache() {
  localStorage.removeItem(CACHE_KEY);
}

export function getCached(appId) {
  const cache = getHltbCache();
  return getFreshEntry(cache, appId);
}

export function setCached(appId, data) {
  const cache = getHltbCache();
  cache[String(appId)] = { data, ts: Date.now() };
  setHltbCache(cache);
}

export function filterUncached(games) {
  const cache = getHltbCache();
  return games.filter((game) => !getFreshEntry(cache, game.appid));
}

export function getAll(games) {
  const cache = getHltbCache();
  return Object.fromEntries(
    games.map((game) => [String(game.appid), getFreshEntry(cache, game.appid)])
  );
}

function getFreshEntry(cache, appId) {
  const entry = cache[String(appId)];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) return null;
  return entry.data;
}
