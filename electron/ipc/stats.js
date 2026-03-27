import { recordCardDrop, endSession, getStatsForUI } from '../farmStats.js';
import { notifyCardDrop, notifyAllCardsReceived, notifyFarmComplete } from '../notifications.js';
import { loadSettings, saveSettings } from '../farmSettings.js';

/**
 * Farm stats, notifications, and settings IPC handlers.
 * Channels: stats:*, notify:*, settings:*
 */
export function register(ipcMain) {
  ipcMain.handle('stats:get',           ()                    => getStatsForUI());
  ipcMain.handle('stats:record-drop',   (_, appId, gameName)  => recordCardDrop(appId, gameName));
  ipcMain.handle('stats:end-session',   ()                    => endSession());

  ipcMain.handle('notify:card-drop',    (_, gameName)    => notifyCardDrop(gameName));
  ipcMain.handle('notify:all-received', (_, gameName)    => notifyAllCardsReceived(gameName));
  ipcMain.handle('notify:farm-complete',(_, totalDrops)  => notifyFarmComplete(totalDrops));

  ipcMain.handle('settings:get',  ()           => loadSettings());
  ipcMain.handle('settings:save', (_, settings) => saveSettings(settings));
}
