import { steamDirectLogin } from '../auth/steamLogin.js';
import { openIdLogin } from '../auth/openid.js';

/**
 * Authentication IPC handlers.
 * Channels: auth:steam-direct, auth:openid
 */
export function register(ipcMain) {
  ipcMain.handle('auth:steam-direct', async () => {
    try {
      const result = await steamDirectLogin();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:openid', async () => {
    try {
      const result = await openIdLogin();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
