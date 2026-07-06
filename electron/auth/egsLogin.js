import { BrowserWindow, session } from 'electron';

/**
 * Opens a BrowserWindow with the Epic Games login page.
 * Uses a persistent partition 'persist:egs' for cookies.
 * 
 * @returns {Promise<{success: boolean}>}
 */
export function egsDirectLogin() {
  return new Promise((resolve, reject) => {
    const tag = '[egsDirectLogin]';
    const t0 = Date.now();
    console.log(`${tag} ── START ──`);

    const egsSession = session.fromPartition('persist:egs');
    const authWin = new BrowserWindow({
      width: 1000, height: 800,
      title: 'Epic Games Login',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, session: egsSession }
    });

    authWin.loadURL('https://www.epicgames.com/id/login');
    console.log(`${tag} BrowserWindow opened, loading login page...`);

    let isResolving = false;

    authWin.webContents.on('did-navigate', (e, url) => {
      console.log(`${tag} Navigated to: ${url} | +${Date.now() - t0}ms`);
    });

    authWin.webContents.on('did-fail-load', (e, code, desc, url) => {
      console.error(`${tag} Load failed: ${code} "${desc}" @ ${url}`);
    });

    authWin.on('page-title-updated', (e, title) => {
      console.log(`${tag} Page title: "${title}"`);
    });

    authWin.on('closed', async () => {
      if (isResolving) return;
      isResolving = true;

      console.log(`${tag} Window closed at +${Date.now() - t0}ms — checking cookies...`);
      const cookies = await egsSession.cookies.get({});
      console.log(`${tag} Total cookies in persist:egs: ${cookies.length} | names: [${cookies.map(c => c.name).join(', ')}]`);

      const hasSid = cookies.some(c => c.name === 'EPIC_SSO');
      if (hasSid) {
        const ssoCookie = cookies.find(c => c.name === 'EPIC_SSO');
        console.log(`${tag} ✓ EPIC_SSO found | domain: ${ssoCookie.domain} | expires: ${ssoCookie.expirationDate ? new Date(ssoCookie.expirationDate * 1000).toISOString() : 'session'}`);
        resolve({ success: true });
      } else {
        console.error(`${tag} ✗ EPIC_SSO not found — login incomplete or failed`);
        reject(new Error('Epic Games login was not completed or failed.'));
      }
    });
  });
}

/**
 * Checks if there is an active EGS session in the 'persist:egs' partition.
 * If EPIC_SSO is missing (e.g. dropped on restart as a session cookie),
 * silently loads the store page to restore cookies from existing auth tokens.
 * @returns {Promise<boolean>}
 */
export async function checkEgsSession() {
  const egsSession = session.fromPartition('persist:egs');

  // Fast path — cookie already present
  const cookies = await egsSession.cookies.get({});
  if (cookies.some(c => c.name === 'EPIC_SSO')) return true;

  // No EPIC_SSO — but the partition may have valid auth tokens that can
  // regenerate it.  Only attempt if we have *some* epic cookies at all
  // (i.e. user logged in at least once in this partition).
  const hasAnyEpicCookies = cookies.some(c =>
    (c.domain || '').includes('epicgames.com')
  );
  if (!hasAnyEpicCookies) return false;

  console.log('[EGS] EPIC_SSO missing — attempting silent session restore...');
  await refreshEpicSession();

  // Re-check after refresh
  const refreshed = await egsSession.cookies.get({});
  const restored = refreshed.some(c => c.name === 'EPIC_SSO');
  console.log(`[EGS] Session restore ${restored ? 'succeeded ✓' : 'failed ✗'}`);
  return restored;
}

/**
 * Silently refreshes the EGS session by loading the store page
 * in a hidden window to keep cookies alive.
 * @returns {Promise<void>}
 */
export function refreshEpicSession() {
  return new Promise((resolve) => {
    const tag = '[EGS][refreshEpicSession]';
    const t0 = Date.now();
    console.log(`${tag} Starting hidden window refresh...`);

    const win = new BrowserWindow({
      show: false, width: 1, height: 1,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true,
        session: session.fromPartition('persist:egs')
      }
    });

    let resolved = false;
    const done = (reason) => {
      if (resolved) return;
      resolved = true;
      try { win.destroy(); } catch {}
      console.log(`${tag} Done (${reason}) | +${Date.now() - t0}ms`);
      resolve();
    };

    win.webContents.on('did-fail-load', (e, code, desc, url) => {
      console.error(`${tag} Load failed: ${code} "${desc}" @ ${url}`);
    });

    win.webContents.on('did-finish-load', async () => {
      const url = win.webContents.getURL();
      console.log(`${tag} Page loaded: ${url} | +${Date.now() - t0}ms — waiting for cookies...`);
      await new Promise(r => setTimeout(r, 3000));

      const cookies = await session.fromPartition('persist:egs').cookies.get({});
      const hasSid = cookies.some(c => c.name === 'EPIC_SSO');
      console.log(`${tag} After load: EPIC_SSO present: ${hasSid} | total cookies: ${cookies.length}`);

      if (hasSid) {
        done('success');
      } else if (url.includes('store.epicgames.com')) {
        console.log(`${tag} SSO missing on store page, trying login page redirect...`);
        win.loadURL('https://www.epicgames.com/id/login', {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
      } else {
        done('failed-after-all-checks');
      }
    });

    setTimeout(() => done('timeout-25s'), 25000);

    win.loadURL('https://store.epicgames.com/', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  });
}
