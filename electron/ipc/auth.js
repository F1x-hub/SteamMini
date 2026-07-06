import { steamDirectLogin, silentRefreshWebApiToken } from '../auth/steamLogin.js';
import { session } from 'electron';

/**
 * Authentication IPC handlers.
 * Channels: auth:steam-direct, auth:silent-refresh-token, auth:clear-sessions
 */
export function register(ipcMain, { mainWindow }) {
  ipcMain.handle('auth:steam-direct', async () => {
    const tag = '[IPC][auth:steam-direct]';
    const t0 = Date.now();
    console.log(`${tag} Invoked`);
    try {
      const result = await steamDirectLogin(mainWindow);
      console.log(`${tag} ✓ Success | steamId: ${result.data?.steamId || result.steamId} | +${Date.now() - t0}ms`);
      return { success: true, data: result };
    } catch (error) {
      console.error(`${tag} ✗ Failed: ${error.message} | +${Date.now() - t0}ms`, error.stack);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:silent-refresh-token', async () => {
    const tag = '[IPC][auth:silent-refresh-token]';
    console.log(`${tag} Invoked`);
    try {
      const token = await silentRefreshWebApiToken();
      if (token) {
        console.log(`${tag} ✓ Token refreshed`);
        return { success: true, token };
      }
      console.warn(`${tag} ✗ No token returned`);
      return { success: false, reason: 'no_token' };
    } catch (e) {
      console.error(`${tag} ✗ Exception: ${e.message}`, e.stack);
      return { success: false, reason: e.message };
    }
  });

  ipcMain.handle('auth:clear-sessions', async () => {
    const tag = '[IPC][auth:clear-sessions]';
    console.log(`${tag} Invoked`);
    try {
      await session.defaultSession.clearStorageData({ storages: ['cookies'] });
      console.log(`${tag} defaultSession cookies cleared`);

      for (const name of ['persist:steam', 'persist:egs']) {
        const ses = session.fromPartition(name);
        await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb'] });
        console.log(`${tag} Partition "${name}" fully cleared`);
      }

      console.log(`${tag} ✓ All sessions cleared`);
      return { success: true };
    } catch (error) {
      console.error(`${tag} ✗ Exception: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  });
}
