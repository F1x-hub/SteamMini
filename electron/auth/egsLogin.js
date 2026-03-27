import { BrowserWindow, session } from 'electron';

/**
 * Opens a BrowserWindow with the Epic Games login page.
 * Uses a persistent partition 'persist:egs' for cookies.
 * 
 * @returns {Promise<{success: boolean}>}
 */
export function egsDirectLogin() {
  return new Promise((resolve, reject) => {
    const egsSession = session.fromPartition('persist:egs');
    
    const authWin = new BrowserWindow({
      width: 1000,
      height: 800,
      title: 'Epic Games Login',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        session: egsSession
      }
    });

    // Use Epic Games login URL
    authWin.loadURL('https://www.epicgames.com/id/login');

    let isResolving = false;

    // We don't necessarily need to extract tokens here if we just want to keep the session.
    // The user logs in, and Electron saves the cookies in the partition.
    // We can check if the user is logged in by looking for specific cookies or 
    // simply by letting the user close the window after successful login.

    authWin.on('page-title-updated', (e, title) => {
      // Often after login, it redirects to a dashboard or home page
      if (title.includes('Epic Games Store') || title.includes('Personal Details')) {
        // Potentially logged in. We can wait a bit or let user close it.
      }
    });

    authWin.on('closed', async () => {
      if (!isResolving) {
        isResolving = true;
        
        // Check if we have cookies that indicate a session
        const cookies = await egsSession.cookies.get({});
        const hasSid = cookies.some(c => c.name === 'sid' || c.name === 'EPIC_BEARER_TOKEN');
        
        if (hasSid) {
          resolve({ success: true });
        } else {
          reject(new Error('Epic Games login was not completed or failed.'));
        }
      }
    });
  });
}

/**
 * Checks if there is an active EGS session in the 'persist:egs' partition.
 * @returns {Promise<boolean>}
 */
export async function checkEgsSession() {
  const egsSession = session.fromPartition('persist:egs');
  const cookies = await egsSession.cookies.get({});
  // EPIC_BEARER_TOKEN or sid are usually present when logged in
  return cookies.some(c => c.name === 'sid' || c.name === 'EPIC_BEARER_TOKEN' || c.name === 'EPIC_SESSION_ID');
}
