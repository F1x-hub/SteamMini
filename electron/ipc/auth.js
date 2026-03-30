import { steamDirectLogin } from '../auth/steamLogin.js';
import { session } from 'electron';

/**
 * Authentication IPC handlers.
 * Channels: auth:steam-direct, auth:clear-sessions
 */
export function register(ipcMain, { mainWindow }) {
  ipcMain.handle('auth:steam-direct', async () => {
    try {
      const result = await steamDirectLogin(mainWindow);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:clear-sessions', async () => {
    try {
      const sessionsToClear = [
        session.defaultSession,
        session.fromPartition('persist:steam'),
        session.fromPartition('persist:egs')
      ];

      for (const ses of sessionsToClear) {
        await ses.clearStorageData({
          storages: ['cookies', 'localstorage', 'indexdb']
        });
      }
      console.log('[Auth IPC] All sessions cleared');
      return { success: true };
    } catch (error) {
      console.error('[Auth IPC] Clear sessions error:', error);
      return { success: false, error: error.message };
    }
  });
}
