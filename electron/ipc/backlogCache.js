import path from 'path';
import fs from 'fs';
import { app, ipcMain } from 'electron';

const CACHE_FILE = 'backlog_cache.json';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

export function registerBacklogCacheHandlers() {
  ipcMain.handle('backlog:getCache', () => {
    try {
      const filePath = path.join(app.getPath('userData'), CACHE_FILE);
      if (!fs.existsSync(filePath)) return null;
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!raw?.games?.length || !raw.ts) return null;
      return { games: raw.games, ts: raw.ts, stale: Date.now() - raw.ts > CACHE_TTL_MS };
    } catch (e) {
      console.error('[backlogCache] Read error:', e.message);
      return null;
    }
  });

  ipcMain.handle('backlog:setCache', (_, games) => {
    try {
      fs.writeFileSync(
        path.join(app.getPath('userData'), CACHE_FILE),
        JSON.stringify({ games, ts: Date.now() }),
        'utf8'
      );
      return { success: true };
    } catch (e) {
      console.error('[backlogCache] Write error:', e.message);
      return { success: false };
    }
  });
}
