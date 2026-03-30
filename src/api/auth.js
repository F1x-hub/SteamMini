import storage from '../utils/storage.js';
import { isTokenExpired } from '../utils/jwt.js';

class AuthAPI {
  constructor() {
    this.authEndpoint = '/api/store/pointssummary/ajaxgetasyncconfig';
  }

  /**
   * Direct Steam login via Electron BrowserWindow.
   * Opens Steam login page, extracts cookies & token.
   * @returns {Promise<Object>} credentials
   */
  async steamDirectLogin() {
    if (!window.electronAuth) {
      throw new Error('Steam Direct login is only available in Electron');
    }

    const result = await window.electronAuth.steamDirectLogin();

    if (!result.success) {
      throw new Error(result.error || 'Steam Direct login failed');
    }

    const credentials = {
      steamId: result.data.steamId,
      accessToken: result.data.webApiToken,
      mode: 'steam_direct'
    };

    storage.setEncrypted('steam_credentials', credentials);
    return credentials;
  }

  /**
   * Manual login using user-provided keys.
   * @param {Object} params - Contains webApiKey, accessToken, steamId
   */
  manualLogin({ accessToken, steamId }) {
    if (!steamId) {
      throw new Error('SteamID is required');
    }

    const credentials = {
      steamId,
      apiKey: null,
      accessToken: accessToken || null,
      mode: 'manual'
    };

    storage.setEncrypted('steam_credentials', credentials);
    return credentials;
  }

  /**
   * Checks current credentials and validates token.
   * @returns {Object|null} Valid credentials or null if not authenticated
   */
  async getValidCredentials() {
    const credentials = storage.getDecrypted('steam_credentials');
    if (!credentials) return null;

    // If there's a JWT-style accessToken, check expiry
    if (credentials.accessToken && isTokenExpired(credentials.accessToken)) {
      console.warn('Access token expired for mode:', credentials.mode);
      return null; // User must re-authenticate
    }

    return credentials;
  }

  async logout() {
    storage.remove('steam_credentials');
    if (window.electronAuth && window.electronAuth.clearSessions) {
      try {
        await window.electronAuth.clearSessions();
      } catch (err) {
        console.error('Failed to clear electron sessions:', err);
      }
    }
  }
}

const authApi = new AuthAPI();
export default authApi;
