import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  warmupGames,
  farmReadyGames,
  mixedGames,
  mockCardDropsData,
  generateWarmupGames,
  generateCardDropsForBatch
} from '../mocks/games.mock.js';

// ─── We need to mock store, steamApi, and toast before importing autoFarm ──────
vi.mock('../../store/index.js', () => {
  const state = {};
  const listeners = new Map();
  return {
    default: {
      state,
      get: vi.fn((key) => state[key]),
      set: vi.fn((key, val) => {
        state[key] = val;
        if (listeners.has(key)) {
          listeners.get(key).forEach(cb => cb(val));
        }
      }),
      subscribe: vi.fn((key, cb) => {
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key).add(cb);
        return () => listeners.get(key).delete(cb);
      }),
      update: vi.fn(),
      notify: vi.fn(),
    }
  };
});

vi.mock('../../api/steam.js', () => ({
  default: {
    getRemainingCardDrops: vi.fn().mockResolvedValue({}),
  }
}));

vi.mock('../../utils/toast.js', () => ({
  default: {
    show: vi.fn(),
  }
}));

// Import the singleton AFTER mocks are set up
let autoFarm;

/** Reset all internal state of the autoFarm singleton */
function resetAutoFarm(af) {
  af.isActive = false;
  af.phase = null;
  af.eligibleGames = [];
  af.currentLoopGames = [];
  af.currentIndex = 0;
  af.phaseTimeLeft = 0;
  af.nextActionTime = null;
  if (af._cancelLoop) { af._cancelLoop(); af._cancelLoop = null; }
  if (af.countdownTimer) { clearInterval(af.countdownTimer); af.countdownTimer = null; }
  if (af._timers) { for (const t of af._timers) { clearTimeout(t); clearInterval(t); } af._timers.clear(); }
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  // Re-setup electronAuth mocks
  window.electronAuth.idleStart.mockResolvedValue({ success: true });
  window.electronAuth.idleStop.mockResolvedValue({ success: true });

  // Dynamic import to get the singleton
  const mod = await import('../../utils/autoFarm.js');
  autoFarm = mod.default;
  resetAutoFarm(autoFarm);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// IME Fast Mode Lifecycle
// ═══════════════════════════════════════════════════════════════════════

describe('AutoFarm · IME Fast Mode lifecycle', () => {

  test('starts simultaneous phase first', async () => {
    await autoFarm.start(mixedGames, mockCardDropsData);

    expect(autoFarm.isActive).toBe(true);
    expect(autoFarm.phase).toBe('simultaneous');
    // mixedGames has 4 games total, max_concurrent=30, so all 4 should be idling
    expect(window.electronAuth.idleStart).toHaveBeenCalledTimes(4);
  });

  test('transitions to sequential phase after 5 minutes', async () => {
    // Mock drops for refresh after phase 1
    const steamApi = (await import('../../api/steam.js')).default;
    steamApi.getRemainingCardDrops.mockResolvedValue(mockCardDropsData);

    await autoFarm.start(mixedGames, mockCardDropsData);
    
    // Advance 5 minutes + small buffer
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    
    // Should have stopped all phase 1 idles (4 games)
    expect(window.electronAuth.idleStop).toHaveBeenCalledTimes(4);
    
    // Wait for async loop to progress to sequential
    await vi.waitFor(() => expect(autoFarm.phase).toBe('sequential'));
    
    // Should have started phase 2 for the first game
    expect(window.electronAuth.idleStart).toHaveBeenCalledTimes(5); // 4 (P1) + 1 (P2 first game)
  });

  test('moves through games sequentially (5 seconds each)', async () => {
    const steamApi = (await import('../../api/steam.js')).default;
    steamApi.getRemainingCardDrops.mockResolvedValue(mockCardDropsData);

    await autoFarm.start(mixedGames, mockCardDropsData);
    
    // Skip Phase 1
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    await vi.waitFor(() => expect(autoFarm.phase).toBe('sequential'));
    
    // Advance through 2 games in sequential phase
    await vi.advanceTimersByTimeAsync(5000 + 100); // Game 1 done
    await vi.advanceTimersByTimeAsync(5000 + 100); // Game 2 done
    
    // currentIndex should be 2 (pointing to 3rd game)
    expect(autoFarm.currentIndex).toBe(2);
  });

  test('refreshes drops and repeats cycle after sequential phase', async () => {
    const steamApi = (await import('../../api/steam.js')).default;
    steamApi.getRemainingCardDrops.mockResolvedValue(mockCardDropsData);

    const testGames = mixedGames.slice(0, 2); // Simple 2 games
    await autoFarm.start(testGames, mockCardDropsData);
    
    const startSpy = vi.spyOn(window.electronAuth, 'idleStart');
    
    // 1. Simultaneous (5m)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    
    // 2. Sequential (2 games * 5s)
    await vi.waitFor(() => expect(autoFarm.phase).toBe('sequential'));
    await vi.advanceTimersByTimeAsync(5000 + 100); // Game 1
    await vi.advanceTimersByTimeAsync(5000 + 100); // Game 2
    
    // 3. Should return to simultaneous
    await vi.waitFor(() => expect(autoFarm.phase).toBe('simultaneous'));
    
    // Refresh happens: after P1 (1) + after each sequential game (2) + after full cycle (1) + after new P1 (1) = 5
    expect(steamApi.getRemainingCardDrops).toHaveBeenCalledTimes(5);
  });

  test('stops loop when all cards received', async () => {
    const steamApi = (await import('../../api/steam.js')).default;
    
    // On first refresh (after P1), say 1 game is done
    // On second refresh (after P2), say all are done
    steamApi.getRemainingCardDrops
      .mockResolvedValueOnce({ '100': 3, '101': 5, '200': 8, '201': 0 }) // 1 game gone (201)
      .mockResolvedValueOnce({}); // All gone
      
    await autoFarm.start(mixedGames, mockCardDropsData);
    
    // Complete Phase 1
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    
    // Complete Phase 2 for remaining 3 games
    await vi.waitFor(() => expect(autoFarm.phase).toBe('sequential'));
    await vi.advanceTimersByTimeAsync(5000 * 3 + 300);
    
    // Should be stopped
    await vi.waitFor(() => expect(autoFarm.isActive).toBe(false));
  });

  test('max concurrency limits batch size', async () => {
    const batchGames = generateWarmupGames(45);
    const batchDrops = generateCardDropsForBatch(45);

    await autoFarm.start(batchGames, batchDrops);

    // Should only start 30 games in simultaneous phase
    expect(window.electronAuth.idleStart).toHaveBeenCalledTimes(30);
    expect(autoFarm.currentLoopGames.length).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// State management
// ═══════════════════════════════════════════════════════════════════════

describe('AutoFarm · State', () => {

  test('pause stops timers and sets isActive to false', async () => {
    await autoFarm.start(mixedGames, mockCardDropsData);

    expect(autoFarm.isActive).toBe(true);
    expect(autoFarm.countdownTimer).not.toBeNull();

    await autoFarm.pause();

    expect(autoFarm.isActive).toBe(false);
    expect(autoFarm.countdownTimer).toBeNull();
  });

  test('pause preserves game state (queue, current game)', async () => {
    await autoFarm.start(mixedGames, mockCardDropsData);

    const savedCurrentLoopGames = autoFarm.currentLoopGames;
    const savedCurrentIndex = autoFarm.currentIndex;

    await autoFarm.pause();

    expect(autoFarm.currentLoopGames).toEqual(savedCurrentLoopGames);
    expect(autoFarm.currentIndex).toBe(savedCurrentIndex);
  });

  test('resume restarts idles and timers', async () => {
    await autoFarm.start(mixedGames, mockCardDropsData);
    await autoFarm.pause();

    expect(autoFarm.isActive).toBe(false);

    await autoFarm.resume();

    expect(autoFarm.isActive).toBe(true);
    expect(autoFarm.countdownTimer).not.toBeNull();
  });

  test('resume calls idleStart for the current farm game', async () => {
    await autoFarm.start(mixedGames, mockCardDropsData);
    // After starting, it's in simultaneous phase, all games are idling
    // Pause will stop them. Resume should restart them.
    const initialIdleStarts = window.electronAuth.idleStart.mock.calls.length;

    vi.clearAllMocks(); // Clear idleStart calls from initial start
    await autoFarm.pause();

    vi.clearAllMocks(); // Clear any idleStop calls
    await autoFarm.resume();

    // In simultaneous phase, all currentLoopGames should be started
    expect(window.electronAuth.idleStart).toHaveBeenCalledTimes(autoFarm.currentLoopGames.length);
  });

  test('stop clears all state completely', async () => {
    await autoFarm.start(mixedGames, mockCardDropsData);

    await autoFarm.stop();

    expect(autoFarm.isActive).toBe(false);
    expect(autoFarm.phase).toBeNull();
    expect(autoFarm.eligibleGames.length).toBe(0);
    expect(autoFarm.currentLoopGames.length).toBe(0);
    expect(autoFarm.currentIndex).toBe(0);
    expect(autoFarm.nextActionTime).toBeNull();
  });

  test('does not start if already active', async () => {
    await autoFarm.start(farmReadyGames, mockCardDropsData);

    const idleCallsBefore = window.electronAuth.idleStart.mock.calls.length;

    // Try to start again
    await autoFarm.start(farmReadyGames, mockCardDropsData);

    // No new idle calls should have been made
    expect(window.electronAuth.idleStart.mock.calls.length).toBe(idleCallsBefore);
  });

  test('does not start with empty eligible games', async () => {
    const toast = (await import('../../utils/toast.js')).default;

    await autoFarm.start(farmReadyGames, {}); // no card drops = no eligible

    expect(autoFarm.isActive).toBe(false);
    expect(toast.show).toHaveBeenCalledWith(
      expect.stringContaining('Нет игр'),
      'warning'
    );
  });
});
