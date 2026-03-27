import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock store and router
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
    }
  };
});

vi.mock('../../router/index.js', () => ({
  default: {
    navigate: vi.fn(),
  }
}));

let store;
let router;
let createTopNav;

beforeEach(async () => {
  vi.clearAllMocks();

  // Clean DOM
  document.body.innerHTML = '';

  // Re-import to get fresh references
  store = (await import('../../store/index.js')).default;
  router = (await import('../../router/index.js')).default;
  createTopNav = (await import('../../components/topNav.js')).createTopNav;

  // Reset store state
  store.state.autoFarmStatus = null;
});

describe('TopNav · Farm Indicator', () => {

  test('farm indicator is hidden when autoFarmStatus is null', () => {
    const nav = createTopNav();
    document.body.appendChild(nav);

    const indicator = document.querySelector('#farm-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.style.display).toBe('none');
  });

  test('farm indicator is hidden when autoFarmStatus.isActive is false', () => {
    store.state.autoFarmStatus = { isActive: false, phase: null };

    const nav = createTopNav();
    document.body.appendChild(nav);

    const indicator = document.querySelector('#farm-indicator');
    expect(indicator.style.display).toBe('none');
  });

  test('farm indicator appears when autoFarmStatus is active', () => {
    store.state.autoFarmStatus = {
      isActive: true,
      phase: 'farming',
      warmupGames: [],
      currentFarmGame: { appid: '100', name: 'Test', remaining: 3 },
      farmNextRestart: Date.now() + 60000,
    };

    const nav = createTopNav();
    document.body.appendChild(nav);

    const indicator = document.querySelector('#farm-indicator');
    expect(indicator.style.display).toBe('inline-flex');
  });

  test('indicator has warmup class during warmup phase', () => {
    store.state.autoFarmStatus = {
      isActive: true,
      phase: 'warmup',
      warmupGames: ['100', '101'],
      warmupTotal: 2,
      warmupNextCheck: Date.now() + 300000,
      currentFarmGame: null,
    };

    const nav = createTopNav();
    document.body.appendChild(nav);

    const indicator = document.querySelector('#farm-indicator');
    expect(indicator.classList.contains('indicator-warmup')).toBe(true);
  });

  test('indicator has farm class during farming phase', () => {
    store.state.autoFarmStatus = {
      isActive: true,
      phase: 'farming',
      warmupGames: [],
      currentFarmGame: { appid: '200', name: 'Test', remaining: 5 },
      farmNextRestart: Date.now() + 120000,
    };

    const nav = createTopNav();
    document.body.appendChild(nav);

    const indicator = document.querySelector('#farm-indicator');
    expect(indicator.classList.contains('indicator-farm')).toBe(true);
  });

  test('indicator has mixed class during mixed phase', () => {
    store.state.autoFarmStatus = {
      isActive: true,
      phase: 'mixed',
      warmupGames: ['100'],
      warmupTotal: 1,
      warmupNextCheck: Date.now() + 300000,
      currentFarmGame: { appid: '200', name: 'Test', remaining: 3 },
      farmNextRestart: Date.now() + 120000,
    };

    const nav = createTopNav();
    document.body.appendChild(nav);

    const indicator = document.querySelector('#farm-indicator');
    expect(indicator.classList.contains('indicator-mixed')).toBe(true);
  });

  test('clicking indicator navigates to /library', () => {
    store.state.autoFarmStatus = {
      isActive: true,
      phase: 'farming',
      warmupGames: [],
      currentFarmGame: { appid: '200', name: 'Test', remaining: 3 },
      farmNextRestart: Date.now() + 120000,
    };

    const nav = createTopNav();
    document.body.appendChild(nav);

    const indicator = document.querySelector('#farm-indicator');
    indicator.click();

    expect(store.set).toHaveBeenCalledWith('farmScrollToStatus', true);
    expect(router.navigate).toHaveBeenCalledWith('/library');
  });

  test('indicator updates reactively via store subscription', () => {
    const nav = createTopNav();
    document.body.appendChild(nav);

    const indicator = document.querySelector('#farm-indicator');
    expect(indicator.style.display).toBe('none');

    // Simulate store updating autoFarmStatus
    store.state.autoFarmStatus = {
      isActive: true,
      phase: 'farming',
      warmupGames: [],
      currentFarmGame: { appid: '200', name: 'Test', remaining: 3 },
      farmNextRestart: Date.now() + 120000,
    };

    // Find and trigger the autoFarmStatus subscriber
    const subscribeCalls = store.subscribe.mock.calls;
    const autoFarmSub = subscribeCalls.find(c => c[0] === 'autoFarmStatus');

    if (autoFarmSub) {
      autoFarmSub[1](store.state.autoFarmStatus);
    }

    expect(indicator.style.display).toBe('inline-flex');
  });
});

describe('TopNav · User Profile', () => {

  test('displays "Guest" when no user is set', () => {
    const nav = createTopNav();
    document.body.appendChild(nav);

    const userName = nav.querySelector('.user-name');
    expect(userName.textContent).toBe('Guest');
  });

  test('user trigger toggles profilePopupOpen in store', () => {
    store.state.profilePopupOpen = false;

    const nav = createTopNav();
    document.body.appendChild(nav);

    const trigger = nav.querySelector('#user-trigger');
    trigger.click();

    expect(store.set).toHaveBeenCalledWith('profilePopupOpen', true);
  });
});
