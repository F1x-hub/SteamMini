const { autoUpdater } = require('electron-updater');
const { dialog, ipcMain } = require('electron');
const log = require('electron-log');

/**
 * Настроить авто-обновление через GitHub Releases.
 * Вызывать ТОЛЬКО когда app.isPackaged === true.
 *
 * @param {BrowserWindow} mainWindow
 */
function setupAutoUpdater(mainWindow) {
  // Логировать обновления через electron-log
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;          // скачивать только с подтверждения
  autoUpdater.autoInstallOnAppQuit = true;

  // Проверить обновление при старте (через 3 сек чтобы окно успело открыться)
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);

  // ── Найдено обновление — спросить пользователя ──
  autoUpdater.on('update-available', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Доступно обновление',
        message: `Версия ${info.version} доступна для установки`,
        detail: 'Скачать и установить при следующем закрытии?',
        buttons: ['Скачать', 'Позже'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate();
          // Уведомить renderer что идёт загрузка
          mainWindow.webContents.send('update:downloading');
        }
      });
  });

  // ── Нет обновлений ──
  autoUpdater.on('update-not-available', () => {
    log.info('[Updater] App is up to date');
  });

  // ── Прогресс загрузки — отправить в renderer ──
  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update:progress', {
      percent: Math.round(progress.percent),
      speed: Math.round(progress.bytesPerSecond / 1024), // KB/s
    });
  });

  // ── Загрузка завершена ──
  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Обновление загружено',
        message: `Версия ${info.version} готова к установке`,
        detail: 'Установить сейчас и перезапустить приложение?',
        buttons: ['Установить и перезапустить', 'Позже'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  // ── Ошибка ──
  autoUpdater.on('error', (err) => {
    log.error('[Updater] Error:', err);
    mainWindow.webContents.send('update:error', err.message);
  });

  // ── IPC — ручная проверка обновлений из UI ──
  ipcMain.handle('update:check', async () => {
    return new Promise((resolve) => {
      let resolved = false;

      const onAvailable = (info) => {
        if (resolved) return; resolved = true;
        cleanup(); resolve({ status: 'available', version: info.version });
      };
      const onNotAvailable = (info) => {
        if (resolved) return; resolved = true;
        cleanup(); resolve({ status: 'not-available', version: info.version });
      };
      const onError = (err) => {
        if (resolved) return; resolved = true;
        cleanup(); resolve({ status: 'error', message: err.message });
      };

      const cleanup = () => {
        autoUpdater.removeListener('update-available', onAvailable);
        autoUpdater.removeListener('update-not-available', onNotAvailable);
        autoUpdater.removeListener('error', onError);
      };

      autoUpdater.once('update-available', onAvailable);
      autoUpdater.once('update-not-available', onNotAvailable);
      autoUpdater.once('error', onError);

      autoUpdater.checkForUpdates().catch(err => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ status: 'error', message: err.message });
        }
      });
    });
  });

  // ── IPC — установить после скачивания ──
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall();
  });
}

module.exports = { setupAutoUpdater };
