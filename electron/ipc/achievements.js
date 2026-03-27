import achievementBridge from '../achievementBridge.js';

/**
 * Steam achievements IPC handlers.
 * Channels: achievements:load, achievements:unlock, achievements:lock, achievements:unlock-all, achievements:close
 */
export function register(ipcMain) {
  ipcMain.handle('achievements:load', async (_, appId) => {
    try {
      return await achievementBridge.loadAchievements(appId);
    } catch (err) {
      console.error('[achievements:load] Error:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('achievements:unlock', async (_, { appId, achievementId }) => {
    try {
      return await achievementBridge.send('unlock', { appId: parseInt(appId), achievementId });
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('achievements:lock', async (_, { appId, achievementId }) => {
    try {
      return await achievementBridge.send('lock', { appId: parseInt(appId), achievementId });
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('achievements:unlock-all', async (_, appId) => {
    try {
      return await achievementBridge.send('unlock_all', { appId: parseInt(appId) });
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('achievements:close', async () => {
    try {
      await achievementBridge.closeGame();
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
}
