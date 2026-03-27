import { BrowserWindow, Menu, MenuItem, shell } from 'electron';

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
