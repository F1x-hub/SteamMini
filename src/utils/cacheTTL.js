/**
 * Cache TTL constants (milliseconds).
 * Central place to configure how long each data type lives in cache.
 */
export const CACHE_TTL = {
  PRICES:     5  * 60 * 1000,       // 5 min  — market prices change frequently
  INVENTORY:  15 * 60 * 1000,       // 15 min — card inventory
  PROFILE:    30 * 60 * 1000,       // 30 min — user profile
  LIBRARY:    60 * 60 * 1000,       // 1 h    — game library (rarely changes)
  WISHLIST:   60 * 60 * 1000,       // 1 h    — wishlist
  BADGES:     10 * 60 * 1000,       // 10 min — badge data (card farming)
  FREE_GAMES: 30 * 60 * 1000,       // 30 min — free games list
  RATES:      24 * 60 * 60 * 1000,  // 24 h   — currency exchange rates
  DEFAULT:    60 * 60 * 1000,       // 1 h    — default fallback
};
