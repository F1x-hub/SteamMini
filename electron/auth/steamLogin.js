import { BrowserWindow, session } from 'electron';
import { decodeJWT, saveRefreshToken } from './tokenStore.js';

/**
 * Captures refresh token from cookies after successful login.
 * Looks for long-lived JWTs with 'client' audience or >7 day expiry.
 */
async function captureRefreshToken(steamId) {
  const tag = `[Auth][captureRefreshToken][${steamId}]`;
  console.log(`${tag} Starting capture...`);
  try {
    const domains = ['store.steampowered.com', 'steamcommunity.com', '.steamcommunity.com'];
    let allDomainCookies = [];

    for (const domain of domains) {
      const c = await session.defaultSession.cookies.get({ domain });
      console.log(`${tag} Domain "${domain}": ${c.length} cookies [${c.map(x => x.name).join(', ')}]`);
      allDomainCookies.push(...c);
    }

    // Дополнительно: steamLoginSecure по имени
    const commCookies = await session.defaultSession.cookies.get({
      domain: 'steamcommunity.com', name: 'steamLoginSecure'
    });
    allDomainCookies.push(...commCookies);

    let found = false;
    for (const cookie of allDomainCookies) {
      if (!cookie.value.includes('||')) continue;
      const token = cookie.value.split('||')[1];
      const payload = decodeJWT(token);
      const isClient = payload?.aud?.includes('client');
      const lifeDays = payload?.exp && payload?.iat ? ((payload.exp - payload.iat) / 86400).toFixed(1) : null;
      const isLongLived = lifeDays && parseFloat(lifeDays) > 7;

      console.log(`${tag} Cookie "${cookie.name}" | aud: ${JSON.stringify(payload?.aud)} | lifeDays: ${lifeDays} | isClient: ${isClient} | isLongLived: ${isLongLived}`);

      if (isClient || isLongLived) {
        saveRefreshToken(steamId, token);
        console.log(`${tag} ✓ Refresh token saved | expires: ${new Date(payload.exp * 1000).toISOString()} | sub: ${payload?.sub}`);
        found = true;
        return token;
      }
    }

    if (!found) {
      console.warn(`${tag} ✗ No suitable refresh token found among ${allDomainCookies.length} cookies`);
    }
    return null;
  } catch (e) {
    console.error(`${tag} ✗ Exception: ${e.message}`, e.stack);
    return null;
  }
}

/**
 * Opens the internal browser with the Steam login page.
 * After user logs in, extracts steamId from cookies and
 * fetches webapi_token from pointssummary/ajaxgetasyncconfig.
 * 
 * @param {BrowserWindow} mainWindow
 * @returns {Promise<{steamId: string, webApiToken: string, mode: string}>}
 */
export function steamDirectLogin(mainWindow) {
  return new Promise(async (resolve, reject) => {
    const tag = '[steamDirectLogin]';
    const t0 = Date.now();
    const elapsed = () => `+${Date.now() - t0}ms`;

    console.log(`${tag} ── START ── platform: ${process.platform} arch: ${process.arch}`);

    // ── 1. Очищаем старые куки ──
    for (const url of ['https://store.steampowered.com', 'https://steamcommunity.com']) {
      try {
        await session.defaultSession.cookies.remove(url, 'steamLoginSecure');
        console.log(`${tag} Cleared steamLoginSecure @ ${url} ${elapsed()}`);
      } catch (e) {
        console.warn(`${tag} Could not clear cookie @ ${url}: ${e.message}`);
      }
    }

    // ── 2. Открываем браузер ──
    console.log(`${tag} Opening internal browser → steam login ${elapsed()}`);
    mainWindow.webContents.send('open-internal-browser', {
      url: 'https://store.steampowered.com/login/',
      partition: 'default'
    });

    let checkInterval = null;
    let isResolving = false;
    let pollCount = 0;

    const checkCookies = async () => {
      if (isResolving) return;
      pollCount++;

      try {
        const cookies = await session.defaultSession.cookies.get({ name: 'steamLoginSecure' });

        if (pollCount % 20 === 0) {
          // Лог каждые ~10 секунд чтобы знать что polling живой
          console.log(`${tag} Polling... attempt #${pollCount} ${elapsed()}`);
        }

        if (cookies && cookies.length > 0) {
          isResolving = true;
          clearInterval(checkInterval);

          console.log(`${tag} ✓ steamLoginSecure detected on attempt #${pollCount} ${elapsed()}`);
          console.log(`${tag} Cookie domain: ${cookies[0].domain} | secure: ${cookies[0].secure} | httpOnly: ${cookies[0].httpOnly} | expirationDate: ${cookies[0].expirationDate ? new Date(cookies[0].expirationDate * 1000).toISOString() : 'session'}`);

          const steamLoginSecure = decodeURIComponent(cookies[0].value);
          const steamId = steamLoginSecure.split('||')[0];

          console.log(`${tag} Extracted steamId: ${steamId} | valid: ${/^\d{17}$/.test(steamId)}`);

          if (!steamId || !/^\d{17}$/.test(steamId)) {
            console.error(`${tag} ✗ Invalid steamId "${steamId}" — rejecting`);
            mainWindow.webContents.send('close-internal-browser');
            return reject(new Error('Failed to extract valid SteamID from cookies'));
          }

          // ── Синхронизация куки ──
          try {
            await session.defaultSession.cookies.set({
              url: 'https://steamcommunity.com',
              name: 'steamLoginSecure',
              value: cookies[0].value,
              domain: '.steamcommunity.com',
              path: '/',
              secure: true,
              httpOnly: true,
              sameSite: 'no_restriction',
            });
            console.log(`${tag} ✓ steamLoginSecure synced to steamcommunity.com ${elapsed()}`);
          } catch (e) {
            console.warn(`${tag} ✗ Cookie sync failed: ${e.message}`);
          }

          mainWindow.webContents.send('close-internal-browser');
          console.log(`${tag} Waiting 1500ms for session to settle... ${elapsed()}`);
          await new Promise(r => setTimeout(r, 1500));

          // ── webApiToken ──
          let webApiToken = null;
          try {
            console.log(`${tag} Fetching webApiToken for steamId: ${steamId} ${elapsed()}`);
            webApiToken = await fetchWebApiToken();
          } catch (e) {
            console.error(`${tag} ✗ fetchWebApiToken threw: ${e.message}`, e.stack);
            return reject(new Error('Не удалось получить webapi_token после входа: ' + e.message));
          }

          if (!webApiToken) {
            console.error(`${tag} ✗ webApiToken is null after all retries | steamId: ${steamId} ${elapsed()}`);
            return reject(new Error('Не удалось получить webapi_token после входа'));
          }

          console.log(`${tag} ✓ webApiToken obtained (len: ${webApiToken.length}) ${elapsed()}`);

          captureRefreshToken(steamId).catch(e =>
            console.warn(`${tag} captureRefreshToken background error: ${e.message}`)
          );

          console.log(`${tag} ── SUCCESS ── steamId: ${steamId} | total: ${elapsed()}`);
          resolve({ steamId, webApiToken, mode: 'steam_direct' });
        }
      } catch (err) {
        console.error(`${tag} ✗ checkCookies exception on attempt #${pollCount}: ${err.message}`, err.stack);
      }
    };

    // ── 4. Небольшая задержка перед стартом polling — даём браузеру открыться ──
    await new Promise(r => setTimeout(r, 300));
    checkInterval = setInterval(checkCookies, 500);
  });
}

/**
 * Fetches the webapi_token from Steam's async config endpoint.
 * Uses session.defaultSession.fetch directly — no hidden window needed,
 * cookies are already in the session after login.
 * 
 * @returns {Promise<string|null>}
 */
async function fetchWebApiToken() {
  const tag = '[fetchWebApiToken]';
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = Date.now();
    try {
      console.log(`${tag} Attempt ${attempt + 1}/3...`);
      const resp = await session.defaultSession.fetch(
        'https://store.steampowered.com/pointssummary/ajaxgetasyncconfig',
        { method: 'GET', headers: { 'Accept': 'application/json' } }
      );

      console.log(`${tag} Attempt ${attempt + 1}: HTTP ${resp.status} | +${Date.now() - t}ms`);

      if (!resp.ok) {
        console.warn(`${tag} Attempt ${attempt + 1}: Non-OK status ${resp.status} ${resp.statusText}`);
      }

      const config = await resp.json();
      const token = config?.data?.webapi_token || config?.webapi_token || null;

      if (token) {
        console.log(`${tag} ✓ Token obtained on attempt ${attempt + 1} | len: ${token.length}`);
        return token;
      }

      // Логируем весь data при отсутствии токена
      console.warn(`${tag} Attempt ${attempt + 1}: No token. response keys: [${Object.keys(config || {}).join(', ')}] | data keys: [${Object.keys(config?.data || {}).join(', ')}]`);
      console.warn(`${tag} Full response (truncated):`, JSON.stringify(config).slice(0, 500));

    } catch (e) {
      console.error(`${tag} Attempt ${attempt + 1} exception: ${e.message}`, e.stack);
    }

    if (attempt < 2) {
      const delay = 1000 * (attempt + 1);
      console.log(`${tag} Waiting ${delay}ms before retry...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error(`${tag} ✗ All 3 attempts failed`);
  return null;
}

export async function silentRefreshWebApiToken() {
  const tag = '[silentRefresh]';
  const t0 = Date.now();
  try {
    const cookies = await session.defaultSession.cookies.get({ name: 'steamLoginSecure' });
    if (!cookies || cookies.length === 0) {
      console.log(`${tag} No active Steam session (no steamLoginSecure cookie)`);
      return null;
    }

    const steamId = decodeURIComponent(cookies[0].value).split('||')[0];
    console.log(`${tag} Session found for steamId: ${steamId} | cookie expires: ${cookies[0].expirationDate ? new Date(cookies[0].expirationDate * 1000).toISOString() : 'session'}`);

    const token = await fetchWebApiToken();
    console.log(`${tag} ${token ? `✓ Token refreshed (len: ${token.length})` : '✗ Token fetch failed'} | +${Date.now() - t0}ms`);
    return token;
  } catch (e) {
    console.error(`${tag} ✗ Exception: ${e.message}`, e.stack);
    return null;
  }
}
