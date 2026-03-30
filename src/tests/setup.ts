import { vi } from 'vitest';

// ─── Mock window.electronAuth (Preload Bridge) ────────────────────────
const electronAuthMock = {
  idleStart: vi.fn().mockResolvedValue({ success: true }),
  idleStop: vi.fn().mockResolvedValue({ success: true }),
  idleStopAll: vi.fn().mockResolvedValue({ success: true }),
  getIdleActive: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchSteamHtml: vi.fn().mockResolvedValue({ success: true, data: '' }),
  steamDirectLogin: vi.fn(),
  onAuthResult: vi.fn(),
  minimizeWindow: vi.fn(),
  maximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
};

Object.defineProperty(globalThis, 'window', {
  value: globalThis.window || {},
  writable: true,
});

(globalThis as any).window.electronAuth = electronAuthMock;

// ─── Mock localStorage ────────────────────────────────────────────────
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

// ─── Use fake timers globally ─────────────────────────────────────────
vi.useFakeTimers();
