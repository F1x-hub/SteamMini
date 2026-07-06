/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import { NativeBackendBridge } from '../../electron/utils/NativeBackendBridge.js';
import { initUpdaterNotification } from '../components/updaterNotification.js';

// ─── Mock electron ────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/mock/app/path',
  },
  default: {
    app: {
      isPackaged: false,
      getAppPath: () => '/mock/app/path',
    }
  }
}));

// ─── Mock child_process ───────────────────────────────────────────────
vi.mock('child_process', () => {
  const spawn = vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    once: vi.fn(),
    kill: vi.fn(),
    stdin: { writable: true, write: vi.fn() },
  }));
  return { spawn, default: { spawn } };
});

// ─── Mock fs ──────────────────────────────────────────────────────────
vi.mock('fs', () => {
  const existsSync = vi.fn(() => true);
  return { existsSync, default: { existsSync }, writeFileSync: vi.fn() };
});

describe('Refactoring Verification', () => {
  it('повторный _spawn убивает предыдущий процесс', () => {
    const bridge = new NativeBackendBridge('test.exe');
    const killSpy = vi.spyOn(bridge, '_kill');
    
    bridge._spawn();
    bridge._spawn();
    
    expect(killSpy).toHaveBeenCalledTimes(2);
  });

  it('повторный вызов initUpdaterNotification не добавляет слушателей', () => {
    const cb = vi.fn();
    
    const mockDoc = {
      createElement: vi.fn(() => ({
        appendChild: vi.fn(),
        querySelector: vi.fn(() => ({
          addEventListener: vi.fn()
        })),
        style: {},
        innerHTML: ''
      })),
      body: {
        appendChild: vi.fn()
      }
    };

    // Mock window and document globals
    globalThis.window = {
      electronAuth: {
        onUpdateNotifyAvailable: cb,
        onUpdateNotifyDownloaded: vi.fn(),
        onUpdateProgress: vi.fn()
      },
      document: mockDoc
    };
    globalThis.document = mockDoc;

    initUpdaterNotification();
    initUpdaterNotification();
    initUpdaterNotification();
    
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
