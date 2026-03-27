import http from 'http';
import { shell, BrowserWindow, session } from 'electron';

/**
 * Steam OpenID login flow:
 * 1. Start local HTTP server on a dynamic port
 * 2. Open system browser with Steam OpenID login page
 * 3. Receive callback with SteamID64
 * 4. Fetch webapi_token via hidden BrowserWindow (same session)
 * 
 * @returns {Promise<{steamId: string, webApiToken: string|null, mode: string}>}
 */
export function openIdLogin() {
  console.log('[OpenID] Starting openIdLogin process...');
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      console.log('[OpenID] Received request on callback server:', req.url);
      try {
        const url = new URL(req.url, `http://localhost`);

        // Only handle the callback path
        if (!url.pathname.startsWith('/auth/callback')) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const claimedId = url.searchParams.get('openid.claimed_id');
        console.log('[OpenID] Extracted claimedId:', claimedId);
        
        if (!claimedId) {
          console.error('[OpenID] Missing openid.claimed_id parameter');
          res.writeHead(400);
          res.end('Missing openid.claimed_id');
          return;
        }

        // SteamID64 is the last segment of the claimed_id URL
        const steamId = claimedId.split('/').pop();
        console.log('[OpenID] Extracted SteamID64:', steamId);

        if (!steamId || !/^\d{17}$/.test(steamId)) {
          res.writeHead(400);
          res.end('Invalid SteamID');
          server.close();
          reject(new Error('Invalid SteamID from OpenID response'));
          return;
        }

        // Success page
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Steam Auth</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                display: flex; align-items: center; justify-content: center;
                min-height: 100vh; margin: 0;
                background: #171a21; color: #c7d5e0;
              }
              .card {
                background: #1b2838; border-radius: 12px; padding: 2rem 3rem;
                text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
              }
              .icon { font-size: 3rem; margin-bottom: 1rem; }
              h2 { margin: 0 0 0.5rem; }
              p { color: #8f98a0; margin: 0; }
            </style>
          <script>
            // Auto close window
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
          </head>
          <body>
            <div class="card">
              <div class="icon">✅</div>
              <h2>Авторизация успешна!</h2>
              <p>Можно закрыть эту вкладку и вернуться в приложение.</p>
            </div>
          </body>
          </html>
        `);

        server.close();
        console.log('[OpenID] Server closed, proceeding to fetch webapi_token for SteamID:', steamId);

        let webApiToken = null;
        try {
          webApiToken = await fetchWebApiTokenHidden();
          console.log('[OpenID] Successfully fetched webapi_token:', webApiToken ? 'Token exists' : 'Token is null');
        } catch (e) {
          console.error('WebApiToken extraction error:', e);
          res.writeHead(500);
          res.end('Authentication failed: Could not fetch webapi_token. Please try again.');
          server.close();
          reject(new Error('Не удалось получить webapi_token после OpenID входа: ' + e.message));
          return;
        }

        if (!webApiToken) {
          res.writeHead(500);
          res.end('Authentication failed: Missing webapi_token.');
          server.close();
          reject(new Error('Не удалось получить webapi_token после OpenID входа'));
          return;
        }

        resolve({
          steamId,
          webApiToken,
          mode: 'openid'
        });
      } catch (err) {
        res.writeHead(500);
        res.end('Internal error');
        server.close();
        reject(err);
      }
    });

    // Use port 0 — OS assigns a free port dynamically
    server.listen(0, () => {
      const port = server.address().port;
      console.log(`[OpenID] Callback server listening on port ${port}`);

      const params = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': `http://localhost:${port}/auth/callback`,
        'openid.realm': `http://localhost:${port}`,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
      });

      const loginUrl = `https://steamcommunity.com/openid/login?${params}`;
      console.log('[OpenID] Opening system browser for login:', loginUrl);
      shell.openExternal(loginUrl);
    });

    server.on('error', (err) => {
      console.error('[OpenID] Server error:', err);
      reject(new Error(`Failed to start OpenID server: ${err.message}`));
    });

    // Timeout — if user doesn't complete login within 5 minutes
    setTimeout(() => {
      try {
        server.close();
        console.warn('[OpenID] Timeout: server closed after 5 minutes');
        reject(new Error('OpenID login timed out'));
      } catch (_) {
        // Server already closed
      }
    }, 5 * 60 * 1000);
  });
}

/**
 * Opens a hidden BrowserWindow with Steam store (using defaultSession),
 * navigates to pointssummary/ajaxgetasyncconfig to fetch the webapi_token.
 * 
 * @returns {Promise<string|null>}
 */
async function fetchWebApiTokenHidden() {
  console.log('[OpenID] Opening hidden BrowserWindow to fetch webapi_token...');
  const tokenWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      session: session.defaultSession // same session as main window
    }
  });

  try {
    console.log('[OpenID] Hidden BrowserWindow navigating to https://store.steampowered.com...');
    await tokenWin.loadURL('https://store.steampowered.com');
    console.log('[OpenID] Hidden BrowserWindow loaded store page, executing executeJavaScript for config...');

    const config = await tokenWin.webContents.executeJavaScript(`
      fetch('/pointssummary/ajaxgetasyncconfig')
        .then(r => r.json())
    `);
    
    console.log('[OpenID] ajaxgetasyncconfig response received:', JSON.stringify(config));

    const token = config?.data?.webapi_token || config?.webapi_token || null;
    console.log('[OpenID] Extracted webapi_token:', token ? 'Success' : 'Failed');
    return token;
  } catch (err) {
    console.error('[OpenID] Error inside fetchWebApiTokenHidden:', err);
    throw err;
  } finally {
    tokenWin.close();
  }
}
