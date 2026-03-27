import { app, BrowserWindow, Menu, MenuItem, shell } from 'electron';
import { isAppQuitting } from '../main.js';

/**
 * Window management IPC handlers.
 * Channels: window:minimize, window:maximize, window:close,
 *           open-external, show-input-context-menu
 */
export function register(ipcMain, { mainWindow }) {
  ipcMain.on('open-external', (event, url) => {
    if (url.startsWith('steam://')) {
      shell.openExternal(url);
    } else if (mainWindow) {
      mainWindow.webContents.send('open-internal-browser', url);
    }
  });

  ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.on('window:hide', () => {
    if (mainWindow) mainWindow.hide();
  });

  ipcMain.on('window:quit', () => {
    // Requires setting isQuitting boolean true so that window.on('close') doesn't prevent it!
    // Since we export isAppQuitting from main.js, this needs to be passed. Actually, we can just call app.quit(), but mainWindow.close() check relies on it. To circumvent, we can just destroy or tell app to quit natively but the variable is readonly across closures unless we expose a setter, or just rely on main.js to handle quit. Wait, IPC is in main context!
    app.quit();
  });

  ipcMain.handle('system:get-startup', () => {
    return app.getLoginItemSettings();
  });

  ipcMain.handle('system:set-startup', (e, { openAtLogin, openAsHidden }) => {
    app.setLoginItemSettings({
      openAtLogin,
      args: openAsHidden ? ['--minimized'] : []
    });
    return app.getLoginItemSettings();
  });

  ipcMain.on('show-input-context-menu', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const menu = new Menu();

    menu.append(new MenuItem({
      label: 'Вырезать',
      role: 'cut',
    }));
    menu.append(new MenuItem({
      label: 'Копировать',
      role: 'copy',
    }));
    menu.append(new MenuItem({
      label: 'Вставить',
      role: 'paste',
    }));
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({
      label: 'Выделить всё',
      role: 'selectAll',
    }));

    menu.popup({ window: win });
  });
}
