import { app, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { loadSettings, saveSettings } from '../farmSettings.js';
import { loadStats, saveStats } from '../farmStats.js';
import { loadFreeGamesSettings, saveFreeGamesSettings, restoreClaimedGames } from './freeGames.js';

// Schema version
const SCHEMA_VERSION = 1;

export function register(ipcMain) {
  ipcMain.handle('backup:export', async (event, steamId) => {
    const tag = `[Backup][SteamID:${steamId || 'guest'}][Export]`;
    console.log(`${tag} Start export`);
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'Экспорт настроек',
        defaultPath: path.join(app.getPath('downloads'), 'steammini-backup.steammini-backup'),
        filters: [
          { name: 'SteamMini Backup', extensions: ['steammini-backup'] }
        ]
      });

      if (!filePath) {
        console.log(`${tag} Export cancelled by user`);
        return { success: false, reason: 'cancelled' };
      }

      // Collect data using domain modules
      const farmSettings = loadSettings();
      const farmStats = loadStats();
      const freeGamesSettings = loadFreeGamesSettings();

      // Read claimed games
      let claimedGames = [];
      const claimedFile = path.join(app.getPath('userData'), 'claimed-games.json');
      if (fs.existsSync(claimedFile)) {
        try {
          claimedGames = JSON.parse(fs.readFileSync(claimedFile, 'utf8'));
        } catch (e) {
          console.warn(`${tag} Failed to read claimed-games.json:`, e.message);
        }
      }

      // Create manifest
      const manifest = {
        schemaVersion: SCHEMA_VERSION,
        appVersion: app.getVersion(),
        timestamp: Date.now()
      };

      const zip = new AdmZip();
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
      zip.addFile('farm-settings.json', Buffer.from(JSON.stringify(farmSettings, null, 2), 'utf8'));
      zip.addFile('farm-stats.json', Buffer.from(JSON.stringify(farmStats, null, 2), 'utf8'));
      zip.addFile('free-games-settings.json', Buffer.from(JSON.stringify(freeGamesSettings, null, 2), 'utf8'));
      zip.addFile('claimed-games.json', Buffer.from(JSON.stringify(claimedGames, null, 2), 'utf8'));

      zip.writeZip(filePath);
      console.log(`${tag} Export successful: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      console.error(`${tag} Export failed:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('backup:import', async (event, steamId) => {
    const tag = `[Backup][SteamID:${steamId || 'guest'}][Import]`;
    console.log(`${tag} Start import`);
    
    let backupDir = null;
    try {
      const { filePaths } = await dialog.showOpenDialog({
        title: 'Импорт настроек',
        filters: [
          { name: 'SteamMini Backup', extensions: ['steammini-backup'] }
        ],
        properties: ['openFile']
      });

      if (!filePaths || filePaths.length === 0) {
        console.log(`${tag} Import cancelled by user`);
        return { success: false, reason: 'cancelled' };
      }

      const filePath = filePaths[0];
      const zip = new AdmZip(filePath);

      // Check for manifest
      const manifestEntry = zip.getEntry('manifest.json');
      if (!manifestEntry) {
        console.error(`${tag} manifest.json not found in archive`);
        return { success: false, error: 'Неверный формат резервной копии: отсутствует манифест.' };
      }

      const manifest = JSON.parse(zip.readAsText(manifestEntry));
      if (manifest.schemaVersion !== SCHEMA_VERSION) {
        console.error(`${tag} Incompatible schema version: backup=${manifest.schemaVersion}, app=${SCHEMA_VERSION}`);
        return { success: false, error: `Несовместимая версия схемы резервной копии: ${manifest.schemaVersion}. Ожидается: ${SCHEMA_VERSION}.` };
      }

      // Check app version compatibility (e.g. major/minor check)
      const currentAppVersion = app.getVersion();
      const [bMajor, bMinor] = (manifest.appVersion || '0.0.0').split('.').map(Number);
      const [cMajor, cMinor] = currentAppVersion.split('.').map(Number);
      if (bMajor > cMajor || (bMajor === cMajor && bMinor > cMinor)) {
        console.error(`${tag} Incompatible app version: backup=${manifest.appVersion}, app=${currentAppVersion}`);
        return { success: false, error: `Резервная копия создана в более новой версии приложения (${manifest.appVersion}). Текущая версия: ${currentAppVersion}.` };
      }

      // Make local backup of existing files before overwriting
      const userDataDir = app.getPath('userData');
      const backupTimestamp = Date.now();
      backupDir = path.join(userDataDir, `backup_local_${backupTimestamp}`);
      fs.mkdirSync(backupDir, { recursive: true });

      const filesToBackup = [
        'farm-settings.json',
        'farm-stats.json',
        'free-games-settings.json',
        'claimed-games.json'
      ];

      for (const file of filesToBackup) {
        const src = path.join(userDataDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(backupDir, file));
        }
      }
      console.log(`${tag} Created local pre-restore backup in ${backupDir}`);

      // Extract and restore
      try {
        const farmSettingsEntry = zip.getEntry('farm-settings.json');
        const farmStatsEntry = zip.getEntry('farm-stats.json');
        const freeGamesSettingsEntry = zip.getEntry('free-games-settings.json');
        const claimedGamesEntry = zip.getEntry('claimed-games.json');

        if (farmSettingsEntry) {
          const settings = JSON.parse(zip.readAsText(farmSettingsEntry));
          saveSettings(settings);
        }
        if (farmStatsEntry) {
          const stats = JSON.parse(zip.readAsText(farmStatsEntry));
          saveStats(stats);
        }
        if (freeGamesSettingsEntry) {
          const settings = JSON.parse(zip.readAsText(freeGamesSettingsEntry));
          saveFreeGamesSettings(settings);
        }
        if (claimedGamesEntry) {
          const claimed = JSON.parse(zip.readAsText(claimedGamesEntry));
          restoreClaimedGames(claimed);
        }

        console.log(`${tag} Import successful`);
        return { success: true };
      } catch (restoreErr) {
        console.error(`${tag} Restore failed, rolling back...`, restoreErr);
        // Rollback from local backup
        for (const file of filesToBackup) {
          const src = path.join(backupDir, file);
          const dest = path.join(userDataDir, file);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
          } else if (fs.existsSync(dest)) {
            fs.unlinkSync(dest);
          }
        }
        return { success: false, error: `Сбой при восстановлении данных. Изменения откатаны. Ошибка: ${restoreErr.message}` };
      } finally {
        // Clean up temporary local backup
        try {
          fs.rmSync(backupDir, { recursive: true, force: true });
        } catch (rmErr) {
          console.warn(`${tag} Failed to cleanup backupDir:`, rmErr.message);
        }
      }
    } catch (error) {
      console.error(`${tag} Import failed:`, error);
      return { success: false, error: error.message };
    }
  });
}
