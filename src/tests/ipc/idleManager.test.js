/**
 * @vitest-environment node
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

// ─── Mock child_process.fork ──────────────────────────────────────────
const mockChild = {
  on: vi.fn(),
  kill: vi.fn(),
  pid: 1234,
};

vi.mock('child_process', () => ({
  fork: vi.fn(() => mockChild),
}));

let startGame, stopGame, getActiveIdles, stopAll;

beforeEach(async () => {
  vi.clearAllMocks();

  // Reset mock child
  mockChild.on = vi.fn();
  mockChild.kill = vi.fn();

  // We need to reimport to reset the internal activeIdles Map
  // Use vi.resetModules to clear module cache
  vi.resetModules();

  // Re-mock child_process after resetModules
  vi.doMock('child_process', () => ({
    fork: vi.fn(() => ({
      on: vi.fn(),
      kill: vi.fn(),
      pid: Math.floor(Math.random() * 10000),
    })),
  }));

  const mod = await import('../../../electron/idleManager.js');
  startGame = mod.startGame;
  stopGame = mod.stopGame;
  getActiveIdles = mod.getActiveIdles;
  stopAll = mod.stopAll;
});

describe('IdleManager', () => {

  test('startGame returns success', async () => {
    const result = await startGame(570);
    expect(result.success).toBe(true);
  });

  test('startGame on duplicate returns already running', async () => {
    await startGame(570);
    const result = await startGame(570);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Already running');
  });

  test('startGame at 32 limit returns failure', async () => {
    // Start 32 games
    for (let i = 0; i < 32; i++) {
      await startGame(i);
    }

    // 33rd should fail
    const result = await startGame(999);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Maximum limit');
  });

  test('stopGame kills child process', async () => {
    await startGame(570);

    const result = await stopGame(570);
    expect(result.success).toBe(true);
  });

  test('stopGame on non-existent game still returns success', async () => {
    const result = await stopGame(99999);
    expect(result.success).toBe(true);
  });

  test('getActiveIdles returns list of active app IDs', async () => {
    await startGame(570);
    await startGame(730);

    const result = await getActiveIdles();
    expect(result.success).toBe(true);
    expect(result.data).toContain('570');
    expect(result.data).toContain('730');
    expect(result.data).toHaveLength(2);
  });

  test('getActiveIdles returns empty when nothing running', async () => {
    const result = await getActiveIdles();
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  test('stopAll clears all active idles', async () => {
    await startGame(570);
    await startGame(730);
    await startGame(440);

    stopAll();

    const result = await getActiveIdles();
    expect(result.data).toHaveLength(0);
  });

  test('stopped game frees a slot', async () => {
    // Fill to capacity
    for (let i = 0; i < 32; i++) {
      await startGame(i);
    }

    // Can't add more
    let result = await startGame(999);
    expect(result.success).toBe(false);

    // Stop one
    await stopGame(0);

    // Now can add
    result = await startGame(999);
    expect(result.success).toBe(true);
  });

  test('app IDs are stored as strings', async () => {
    await startGame(570);
    const result = await getActiveIdles();
    expect(typeof result.data[0]).toBe('string');
  });
});
