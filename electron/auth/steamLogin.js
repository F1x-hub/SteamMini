import { BrowserWindow, session } from 'electron';

/**
 * Opens a BrowserWindow with the Steam login page.
 * After user logs in, extracts steamId from cookies and
 * fetches webapi_token from pointssummary/ajaxgetasyncconfig.
 * 
 * @returns {Promise<{steamId: string, webApiToken: string, mode: string}>}
 */
export function steamDirectLogin() {
  return new Promise((resolve, reject) => {
    const authWin = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'Steam Login',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        session: session.defaultSession
      }
    });

    authWin.loadURL('https://store.steampowered.com/login/');

    let checkInterval = null;
    let isResolving = false;

    // Function to check cookies
    const checkCookies = async () => {
      if (isResolving) return;

      try {
        const cookies = await session.defaultSession.cookies.get({
          name: 'steamLoginSecure'
        });

        if (cookies && cookies.length > 0) {
          isResolving = true;
          clearInterval(checkInterval);

          const steamLoginSecure = decodeURIComponent(cookies[0].value);
          const steamId = steamLoginSecure.split('||')[0];

          if (!steamId || !/^\d{17}$/.test(steamId)) {
            authWin.close();
            return reject(new Error('Failed to extract valid SteamID from cookies'));
          }

          let webApiToken = null;
          try {
            webApiToken = await fetchWebApiToken(authWin);
          } catch (e) {
            console.error('WebApiToken extraction error:', e);
            authWin.close();
            return reject(new Error('Не удалось получить webapi_token после входа: ' + e.message));
          }

          if (!webApiToken) {
            authWin.close();
            return reject(new Error('Не удалось получить webapi_token после входа'));
          }

          authWin.close();
          resolve({
            steamId,
            webApiToken,
            mode: 'steam_direct'
          });
        }
      } catch (err) {
        console.error('Error checking cookies:', err);
      }
    };

    // Start polling every 500ms
    checkInterval = setInterval(checkCookies, 500);

    authWin.on('closed', () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      if (!isResolving) {
        reject(new Error('Steam login window was closed'));
      }
    });
  });
}

/**
 * Fetches the webapi_token from Steam's async config endpoint.
 * Uses the current session cookies in the given BrowserWindow.
 * 
 * @param {BrowserWindow} win 
 * @returns {Promise<string|null>}
 */
async function fetchWebApiToken(win) {
  const config = await win.webContents.executeJavaScript(`
    fetch('/pointssummary/ajaxgetasyncconfig')
      .then(r => r.json())
  `);
  
  const token = config?.data?.webapi_token || config?.webapi_token || null;
  return token;
}
