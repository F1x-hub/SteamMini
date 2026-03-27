import authApi from './auth.js';
import cache from '../utils/cache.js';
import { CACHE_TTL } from '../utils/cacheTTL.js';

const GLOBAL_API_KEY = "08FB1451659E540949A6AF2A3F5D99E5"; // <-- Вставьте ваш WebAPI ключ сюда

class SteamAPI {
  constructor() {
    const isPackaged = window.location.protocol === 'file:';
    this.proxiedStoreAPI = isPackaged ? 'https://store.steampowered.com/api' : '/api/store';
    this.proxiedWebAPI = isPackaged ? 'https://api.steampowered.com' : '/api/steam';
    this.communityAPI = isPackaged ? 'https://steamcommunity.com' : '/api/community';
  }

  async _getCredentials() {
    return await authApi.getValidCredentials() || {};
  }

  async _fetch(endpoint, isStore = false, params = {}) {
    // Determine the base url based on Vite proxy paths
    const baseURL = isStore ? this.proxiedStoreAPI : this.proxiedWebAPI;
    const urlStr = baseURL.startsWith('http') ? `${baseURL}${endpoint}` : `${window.location.origin}${baseURL}${endpoint}`;
    const url = new URL(urlStr);
    
    // Check tokens and refresh if needed
    const creds = await this._getCredentials();
    const { accessToken } = creds;
    const apiKey = GLOBAL_API_KEY; // Use hardcoded API key
    console.log(`[SteamAPI _fetch] Endpoint: ${endpoint}, Credentials present:`, { hasApiKey: !!apiKey, hasAccessToken: !!accessToken, steamId: creds.steamId });
    
    // Add default params like API key if needed
    if (!isStore) {
      if (apiKey) {
        url.searchParams.append('key', apiKey);
      } else if (accessToken) {
        url.searchParams.append('access_token', accessToken);
      }
    }

    // Add specific params
    Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));

    console.log(`[SteamAPI _fetch] Sending fetch request to internal proxy URL:`, url.toString());
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[SteamAPI _fetch] Failed with status ${response.status}`, response.statusText);
      throw new Error(`Steam API error: ${response.status} ${response.statusText}`);
    }
    
    const responseJson = await response.json();
    console.log(`[SteamAPI _fetch] Success for endpoint: ${endpoint}`);
    return responseJson;
  }

  /**
   * IPlayerService/GetOwnedGames
   */
  async getOwnedGames() {
    const { steamId } = await this._getCredentials();

    if (!steamId) throw new Error('SteamID missing');

    return this._fetch('/IPlayerService/GetOwnedGames/v1/', false, {
      steamid: steamId,
      include_appinfo: 1,
      include_played_free_games: 1
    });
  }

  /**
   * ISteamUser/GetPlayerSummaries
   */
  async getPlayerSummaries() {
    const creds = await this._getCredentials();
    const { steamId } = creds;
    const apiKey = GLOBAL_API_KEY; // Use hardcoded API key
    
    if (!steamId) throw new Error('SteamID missing');

    if (apiKey) {
      try {
        const response = await this._fetch('/ISteamUser/GetPlayerSummaries/v2/', false, {
          steamids: steamId
        });
        return response;
      } catch (e) {
        console.warn('[SteamAPI] GetPlayerSummaries via WebAPI failed, falling back to XML:', e.message);
      }
    } else {
      console.log('[SteamAPI] No API key available, using XML profile fallback for GetPlayerSummaries');
    }

    // Fallback to XML profile parsing
    console.log(`[SteamAPI] Fetching public XML profile for ${steamId}`);
    const commBase = this.communityAPI;
    const urlStr = commBase.startsWith('http') 
        ? `${commBase}/profiles/${steamId}/?xml=1` 
        : `${window.location.origin}${commBase}/profiles/${steamId}/?xml=1`;
    const xmlUrl = new URL(urlStr);
    const response = await fetch(xmlUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch XML profile: ${response.status} ${response.statusText}`);
    }
    
    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/xml");
    
    // Check for error in XML
    const errorNode = doc.querySelector('error');
    if (errorNode) {
      throw new Error(errorNode.textContent || 'Unknown XML profile error');
    }

    // Map XML to match the WebAPI JSON structure for backwards compatibility
    const personaname = doc.querySelector('steamID')?.textContent || 'Unknown';
    const avatarfull = doc.querySelector('avatarFull')?.textContent || '';
    const profileurl = `https://steamcommunity.com/profiles/${steamId}`;
    
    console.log(`[SteamAPI] Successfully parsed XML profile for ${personaname}`);
    
    return {
      response: {
        players: [
          {
            personaname,
            avatarfull,
            profileurl,
            steamid: steamId
          }
        ]
      }
    };
  }

  /**
   * IPlayerService/GetSteamLevel/v1
   */
  async getSteamLevel() {
    const creds = await this._getCredentials();
    const { steamId } = creds;
    if (!steamId) throw new Error('SteamID missing');

    try {
      const response = await this._fetch('/IPlayerService/GetSteamLevel/v1/', false, { steamid: steamId });
      return response?.response?.player_level;
    } catch (e) {
      console.warn('[SteamAPI] GetSteamLevel failed:', e.message);
      return null;
    }
  }

  /**
   * IPlayerService/GetBadges/v1
   */
  async getBadges() {
    const creds = await this._getCredentials();
    const { steamId } = creds;
    if (!steamId) throw new Error('SteamID missing');

    try {
      const response = await this._fetch('/IPlayerService/GetBadges/v1/', false, { steamid: steamId });
      return response?.response; // returns { player_xp, player_level, player_xp_needed_current_level, player_xp_needed_to_level_up }
    } catch (e) {
      console.warn('[SteamAPI] GetBadges failed:', e.message);
      return null;
    }
  }

  /**
   * Fetch remaining card drops by parsing the Steam Community Badges page HTML
   */
  async getRemainingCardDrops() {
    try {
      if (window.electronAuth && window.electronAuth.cardsGetAll) {
        const { steamId } = await this._getCredentials();
        if (!steamId) {
          console.warn('[SteamAPI] Cannot fetch card drops: SteamId is missing.');
          return {};
        }

        console.log('[Cards] Calling C# backend for steamId:', steamId);
        const res = await window.electronAuth.cardsGetAll(steamId);
        console.log('[Cards] Raw result:', JSON.stringify(res, null, 2));

        if (res && res.success && res.games) {
          console.log(`[Cards] Success. Total games found: ${res.total}`);
          
          const drops = {};
          res.games.forEach(g => {
            // C# output uses capitalized property names
            const appId = g.AppId || g.appId;
            const remaining = g.Remaining !== undefined ? g.Remaining : g.remaining;
            
            if (appId && remaining > 0) {
              drops[String(appId)] = remaining;
            }
          });

          console.log('[Cards] Final map size:', Object.keys(drops).length);
          console.log('[Cards] Sample entries (String appId):', Object.entries(drops).slice(0, 3));
          
          return drops;
        } else {
          console.warn('[Cards] C# backend failed:', res?.error || 'Unknown error');
          return {};
        }
      }
    } catch (e) {
      console.error('[Cards] Exception in getRemainingCardDrops:', e);
    }
    return {};
  }

  /**
   * IWishlistService/GetWishlistSortedFiltered — returns enriched store data
   * (names, prices, images, reviews, release dates) when data_request is provided.
   * Falls back to basic GetWishlist if the enriched call fails.
   */
  async getWishlist() {
    const { steamId } = await this._getCredentials();
    if (!steamId) throw new Error('SteamID missing');

    let countryCode = 'US';
    try {
      const summaries = await this.getPlayerSummaries();
      const player = summaries?.response?.players?.[0];
      if (player && player.loccountrycode) {
        countryCode = player.loccountrycode;
      }
    } catch (e) {
      console.warn('[SteamAPI] Failed to fetch loccountrycode for wishlist, defaulting to US:', e.message);
    }

    try {
      const data = await this._fetch('/IWishlistService/GetWishlistSortedFiltered/v1/', false, {
        input_json: JSON.stringify({
          steamid: steamId,
          context: { language: 'english', country_code: countryCode },
          data_request: {
            include_basic_info: true,
            include_assets: true,
            include_release: true,
            include_reviews: true
          },
          start_index: 0,
          page_size: 500
        })
      });
      return { ...data, _method: 'sorted_filtered' };
    } catch (e) {
      console.warn('[SteamAPI] GetWishlistSortedFiltered failed, falling back to GetWishlist:', e.message);
      const data = await this._fetch('/IWishlistService/GetWishlist/v1/', false, {
        steamid: steamId
      });
      return { ...data, _method: 'basic' };
    }
  }

  /**
   * Fetch game details from Steam Store API with cache
   */
  async getAppDetails(appId) {
    const cacheKey = `appdetails_${appId}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`[SteamAPI getAppDetails] Cache hit for ${appId}`);
      return cachedData;
    }

    try {
      console.log(`[SteamAPI getAppDetails] Fetching store data for ${appId}`);
      let data = null;

      if (window.electronAuth && window.electronAuth.fetchSteamHtml) {
        // Fetch via Electron main process to bypass CORS/Redirects and include session cookies
        const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=russian`;
        const res = await window.electronAuth.fetchSteamHtml(url);
        if (res && res.success) {
          data = JSON.parse(res.data);
        } else {
          throw new Error(`IPC fetch failed: ${res?.error}`);
        }
      } else {
        data = await this._fetch('/appdetails', true, {
          appids: appId,
          l: 'russian'
        });
      }

      if (data && data[appId] && data[appId].success) {
        const result = data[appId].data;
        cache.set(cacheKey, result, CACHE_TTL.LIBRARY);
        return result;
      }
      return null;
    } catch (e) {
      console.error(`[SteamAPI getAppDetails] Failed for appId ${appId}:`, e);
      return null;
    }
  }

  /**
   * Fetch price for a specific region
   * @param {string|number} appId 
   * @param {string} countryCode 
   */
  async getAppPrice(appId, countryCode) {
    const cacheKey = `price_${appId}_${countryCode}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) return cachedData;

    try {
      let data = null;
      const params = {
        appids: appId,
        cc: countryCode,
        filters: 'price_overview'
      };

      if (window.electronAuth && window.electronAuth.fetchSteamHtml) {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${countryCode}&filters=price_overview`;
        const res = await window.electronAuth.fetchSteamHtml(url);
        if (res && res.success) {
          data = JSON.parse(res.data);
        }
      } else {
        data = await this._fetch('/appdetails', true, params);
      }

      if (data && data[appId] && data[appId].success) {
        const result = data[appId].data.price_overview || { unavailable: true };
        cache.set(cacheKey, result, CACHE_TTL.PRICES);
        return result;
      }
      return { unavailable: true };
    } catch (e) {
      console.error(`[SteamAPI getAppPrice] Failed for ${appId} region ${countryCode}:`, e);
      return { unavailable: true };
    }
  }
}

const steamApi = new SteamAPI();
export default steamApi;
