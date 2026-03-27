import * as idleManager from '../idleManager.js';

/**
 * Idle (game farming) IPC handlers.
 * Channels: idle:start, idle:stop, idle:stop-all, idle:active
 */
export function register(ipcMain) {
  ipcMain.handle('idle:start', async (event, appId) => {
    return await idleManager.startGame(appId);
  });

  ipcMain.handle('idle:stop', async (event, appId) => {
    return await idleManager.stopGame(appId);
  });

  ipcMain.handle('idle:stop-all', async () => {
    idleManager.stopAll();
    return { success: true };
  });

  ipcMain.handle('idle:active', async () => {
    return await idleManager.getActiveIdles();
  });
}
