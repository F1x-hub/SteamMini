/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showSkeleton, hideSkeleton } from '../utils/skeleton.js';
import { renderFreeGames } from '../pages/freeGames.js';
import { initUpdaterNotification } from '../components/updaterNotification.js';
import { createUserPopup } from '../components/userPopup.js';

// Mocks for userPopup dependencies
vi.mock('../store/index.js', () => ({
  default: {
    subscribe: vi.fn(),
    set: vi.fn(),
    get: vi.fn(() => false),
    loginManual: vi.fn(),
    logout: vi.fn(),
    fetchUserProfile: vi.fn()
  }
}));

vi.mock('../router/index.js', () => ({
  default: {
    navigate: vi.fn(),
    handleRoute: vi.fn()
  }
}));

vi.mock('../utils/storage.js', () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    getDecrypted: vi.fn(() => ({}))
  }
}));

vi.mock('../cache/pageCache.js', () => ({
  cacheGet: vi.fn(() => null),
  cacheSet: vi.fn(),
  TTL: { FREE_GAMES: 3600 }
}));

describe('UI Refactoring Verification', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    // Setup window mocks
    globalThis.window.electronAuth = {
      freeGamesGetSettings: vi.fn().mockResolvedValue({ platforms: {} }),
      freeGamesGet: vi.fn().mockResolvedValue({ games: [] }),
      onUpdateNotifyAvailable: vi.fn(),
      onUpdateNotifyDownloaded: vi.fn(),
      onUpdateProgress: vi.fn(),
      getStartupSettings: vi.fn().mockResolvedValue({ openAtLogin: false, openAsHidden: false }),
      getAppVersion: vi.fn().mockResolvedValue('1.0.0')
    };
    globalThis.window._currentSettingsCache = {};
  });

  describe('Skeleton Utility', () => {
    it('showSkeleton adds grid and N items', () => {
      const container = document.createElement('div');
      showSkeleton(container, 3);
      
      const grid = container.querySelector('.skeleton-grid');
      expect(grid).not.toBeNull();
      
      const cards = container.querySelectorAll('.skeleton-card');
      expect(cards.length).toBe(3);
    });

    it('hideSkeleton clears container', () => {
      const container = document.createElement('div');
      container.innerHTML = '<div class="something"></div>';
      hideSkeleton(container);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('freeGames Page', () => {
    it('does not create inline style tags', async () => {
      const container = renderFreeGames();
      
      vi.runAllTimers();
      
      const styles = container.querySelectorAll('style');
      expect(styles.length).toBe(0);
    });

    it('immediately calls showSkeleton without setTimeout', () => {
      const container = renderFreeGames();
      
      // Should instantly have skeleton grid inside the inner free-games-grid
      const grid = container.querySelector('#free-games-grid');
      expect(grid).not.toBeNull();
      
      // showSkeleton creates .skeleton-grid inside
      const skeletonGrid = grid.querySelector('.skeleton-grid');
      expect(skeletonGrid).not.toBeNull();
      
      const skeletonCards = skeletonGrid.querySelectorAll('.skeleton-card');
      expect(skeletonCards.length).toBe(8); // from our refactoring
    });
  });

  describe('updaterNotification Component', () => {
    it('does not create inline style tags and adds correct classes', () => {
      initUpdaterNotification();
      
      const container = document.querySelector('.updater-notification-container');
      expect(container).not.toBeNull();
      
      const styles = container.querySelectorAll('style');
      expect(styles.length).toBe(0);
    });
  });

  describe('userPopup Component', () => {
    it('does not create inline style tags and uses classes', () => {
      const container = createUserPopup();
      
      expect(container.className).toContain('user-popup-overlay');
      
      const styles = container.querySelectorAll('style');
      expect(styles.length).toBe(0);
    });
  });
});
