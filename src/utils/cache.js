/**
 * Simple Cache Module with TTL backed by localStorage
 */
import { CACHE_TTL } from './cacheTTL.js';

class Cache {
  /**
   * Set cache item with time-to-live
   * @param {string} key 
   * @param {any} data 
   * @param {number} ttlMs Time to live in milliseconds
   */
  set(key, data, ttlMs = CACHE_TTL.DEFAULT) {
    const payload = {
      data,
      expiresAt: Date.now() + ttlMs
    };
    try {
      localStorage.setItem(`cache_${key}`, JSON.stringify(payload));
    } catch (e) {
      console.warn('Cache write failed (storage full?)', e);
    }
  }

  /**
   * Get cache item if not expired
   * @param {string} key 
   * @returns {any|null}
   */
  get(key) {
    try {
      const stored = localStorage.getItem(`cache_${key}`);
      if (!stored) return null;

      const payload = JSON.parse(stored);
      if (Date.now() > payload.expiresAt) {
        this.remove(key);
        return null;
      }
      return payload.data;
    } catch (e) {
      return null;
    }
  }

  remove(key) {
    localStorage.removeItem(`cache_${key}`);
  }

  clearAll() {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('cache_')) localStorage.removeItem(k);
    });
  }
}

const cache = new Cache();
export default cache;
