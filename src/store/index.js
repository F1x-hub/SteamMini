import authApi from '../api/auth.js';
import storage from '../utils/storage.js';
import steamApi from '../api/steam.js';

// Init preferences gracefully
const prefs = storage.get('preferences') || { theme: 'dark', lang: 'en' };
const farmCfg = storage.get('farmConfig') || {
  phase1_max_concurrent: 30,
  phase1_check_interval: 10,
  phase1_hours_threshold: 2.0,
  phase2_restart_interval: 5,
  phase2_stall_timeout: 30,
};

const state = {
  user: null, // { name, avatar, level }
  isAuthenticated: false,
  profilePopupOpen: false,
  isBrowserOpen: false,
  settingsOpen: false,
  currentRoute: '/',
  platform: 'steam', // 'steam', 'epic', 'gog'
  theme: prefs.theme,
  lang: prefs.lang,
  farmConfig: farmCfg,
  previousRoute: null,
  runningAppId: null
};

class Store {
  constructor() {
    this.state = state;
    this.listeners = new Map();
  }

  /**
   * Subscribe to state changes for a specific key
   * @param {string} key 
   * @param {Function} callback 
   * @returns {Function} Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    
    return () => {
      this.listeners.get(key).delete(callback);
    };
  }

  /**
   * Get value from state
   * @param {string} key 
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Set value in state and notify listeners
   * @param {string} key 
   * @param {any} value 
   */
  set(key, value) {
    this.state[key] = value;
    this.notify(key, value);
  }

  /**
   * Update value partially (for objects)
   * @param {string} key 
   * @param {Object} payload 
   */
  update(key, payload) {
    const current = this.state[key] || {};
    const next = { ...current, ...payload };
    this.state[key] = next;
    this.notify(key, next);
  }

  /**
   * Notify all listeners for a key
   * @param {string} key 
   * @param {any} value 
   */
  notify(key, value) {
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(callback => callback(value));
    }
  }

  /**
   * Fetch Steam user profile and save to state
   */
  async fetchUserProfile() {
    const credentials = this.get('auth');
    if (!credentials || !credentials.steamId) return;

    const steamId = credentials.steamId;
    console.log('[Store fetchUserProfile] Starting profile fetch for steamId:', steamId);
    try {
      const data = await steamApi.getPlayerSummaries();
      console.log('[Store fetchUserProfile] Received profile data:', data);
      const players = data?.response?.players;
      
      if (players && players.length > 0) {
        const player = players[0];
        console.log('[Store fetchUserProfile] Found player info:', { name: player.personaname, avatar: player.avatarfull });
        this.set('user', {
          name: player.personaname,
          avatar: player.avatarfull,
          profileUrl: player.profileurl,
          steamId: steamId
        });
        return;
      }
      
      console.warn('[Store fetchUserProfile] No player data found in response schema:', data);
      throw new Error('No player data found in response');
    } catch (e) {
      console.error('[Store fetchUserProfile] Failed to fetch user profile:', e);
      // Fallback
      this.set('user', { name: 'Guest', avatar: null, steamId: steamId });
      
      // Retry in 30 seconds
      console.log('[Store fetchUserProfile] Scheduling retry in 30 seconds...');
      setTimeout(() => {
        // Only retry if still authenticated
        if (this.get('isAuthenticated')) {
          console.log('[Store fetchUserProfile] Executing 30s retry...');
          this.fetchUserProfile();
        }
      }, 30000);
    }
  }

  /**
   * Initialize auth — check cached credentials only.
   * No auto-login attempt; user must choose a login method.
   */
  async initAuth() {
    console.log('[Store initAuth] Initializing auth...');
    this.set('isAuthLoading', true);
    try {
      const credentials = await authApi.getValidCredentials();
      console.log('[Store initAuth] Credentials from authApi:', credentials);

      if (credentials) {
        this.set('auth', credentials);
        this.set('isAuthenticated', true);
      } else {
        this.set('auth', null);
        this.set('isAuthenticated', false);
      }
    } catch (error) {
      console.error('[Store initAuth] error:', error);
      this.set('auth', null);
      this.set('isAuthenticated', false);
    } finally {
      this.set('isAuthLoading', false);
    }
  }

  /**
   * Login via direct Steam window
   */
  async loginSteamDirect() {
    this.set('isAuthLoading', true);
    try {
      const credentials = await authApi.steamDirectLogin();
      this.set('auth', credentials);
      this.set('isAuthenticated', true);
      return true;
    } catch (e) {
      console.error('Steam Direct login error:', e);
      throw e;
    } finally {
      this.set('isAuthLoading', false);
    }
  }

  /**
   * Login via Steam OpenID (system browser)
   */
  async loginOpenId() {
    console.log('[Store loginOpenId] Initiating OpenID login...');
    this.set('isAuthLoading', true);
    try {
      const credentials = await authApi.openIdLogin();
      console.log('[Store loginOpenId] Credentials received:', credentials);
      this.set('auth', credentials);
      this.set('isAuthenticated', true);
      return true;
    } catch (e) {
      console.error('[Store loginOpenId] error:', e);
      throw e;
    } finally {
      this.set('isAuthLoading', false);
    }
  }

  /**
   * Manual login with user-provided credentials
   */
  loginManual(credentials) {
    try {
      const validCreds = authApi.manualLogin(credentials);
      this.set('auth', validCreds);
      this.set('isAuthenticated', true);
      return true;
    } catch (e) {
      console.error('Manual login error:', e);
      throw e;
    }
  }

  logout() {
    authApi.logout();
    this.set('auth', null);
    this.set('isAuthenticated', false);
    this.set('user', null);
  }
}

const store = new Store();

// Initialize default state
store.set('theme', 'dark');
store.set('user', null);
store.set('platform', 'steam');
store.set('auth', null);
store.set('isAuthenticated', false);
store.set('isAuthLoading', true);
store.set('previousRoute', null);

export default store;
