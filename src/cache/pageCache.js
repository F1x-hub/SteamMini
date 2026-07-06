// src/cache/pageCache.js
// In-memory кеш рендерера с TTL. Синхронный доступ — 0ms на повторный рендер.

const _cache = new Map();

/**
 * @param {string} key
 * @param {number} ttlMs  — время жизни в миллисекундах
 * @returns {any|null}
 */
export function cacheGet(key, ttlMs) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * @param {string} key
 * @param {any} data
 */
export function cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

/** Принудительно сбросить конкретный ключ (после продажи карточки и т.д.) */
export function cacheInvalidate(key) {
  _cache.delete(key);
}

/** Сбросить всё (например, при логауте) */
export function cacheClear() {
  _cache.clear();
}

/** Удобные TTL-константы для всего приложения (в мс) */
export const TTL = {
  GAMES_LIST:    30 * 60 * 1000,
  COVER_URL:     24 * 60 * 60 * 1000,
  CARDS:          3 * 60 * 1000,
  INVENTORY:      3 * 60 * 1000,
  BADGES:         5 * 60 * 1000,
  WALLET:         2 * 60 * 1000,
  FREE_GAMES:     6 * 60 * 60 * 1000,
  MARKET_PRICE:  10 * 60 * 1000,
};
