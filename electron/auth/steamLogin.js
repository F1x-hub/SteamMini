import { BrowserWindow, session } from 'electron';

/**
 * Opens the internal browser with the Steam login page.
 * After user logs in, extracts steamId from cookies and
 * fetches webapi_token from pointssummary/ajaxgetasyncconfig.
 * 
 * @param {BrowserWindow} mainWindow
 * @returns {Promise<{steamId: string, webApiToken: string, mode: string}>}
 */
export function steamDirectLogin(mainWindow) {
  return new Promise((resolve, reject) => {
    // Open internal browser via IPC
    mainWindow.webContents.send('open-internal-browser', {
      url: 'https://store.steampowered.com/login/',
      partition: 'default' // Use default session for app auth
    });

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
            mainWindow.webContents.send('close-internal-browser');
            return reject(new Error('Failed to extract valid SteamID from cookies'));
          }

          let webApiToken = null;
          try {
            webApiToken = await fetchWebApiToken();
          } catch (e) {
            console.error('WebApiToken extraction error:', e);
            mainWindow.webContents.send('close-internal-browser');
            return reject(new Error('Не удалось получить webapi_token после входа: ' + e.message));
          }

          if (!webApiToken) {
            mainWindow.webContents.send('close-internal-browser');
            return reject(new Error('Не удалось получить webapi_token после входа'));
          }

          mainWindow.webContents.send('close-internal-browser');
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

    // If the browser is closed manually, we should reject the promise
    // But currently internalBrowser doesn't have an IPC for "closed by user"
    // that the main process can listen to easily without more wiring.
  });
}

/**
 * Fetches the webapi_token from Steam's async config endpoint.
 * Uses a hidden window to ensure we can execute script in the correct session.
 * 
 * @returns {Promise<string|null>}
 */
async function fetchWebApiToken() {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      session: session.defaultSession
    }
  });

  try {
    await win.loadURL('https://store.steampowered.com');
    const config = await win.webContents.executeJavaScript(`
      fetch('/pointssummary/ajaxgetasyncconfig')
        .then(r => r.json())
    `);
    
    const token = config?.data?.webapi_token || config?.webapi_token || null;
    return token;
  } finally {
    win.close();
  }
}
