import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import * as vdf from 'vdf-parser';

// ── Steam path — cached after first call ─────────────────────────────────────

let _steamPathCache = null;

function getSteamPath() {
  if (_steamPathCache) return _steamPathCache;

  if (process.platform === 'win32') {
    try {
      const reg = execSync(
        'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath',
        { encoding: 'utf-8', timeout: 3000 }
      );
      const match = reg.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (match) {
        _steamPathCache = match[1].trim().replace(/\//g, '\\');
        console.log('[Steam] Found via registry:', _steamPathCache);
        return _steamPathCache;
      }
    } catch (e) {
      console.warn('[Steam] Registry read failed:', e.message);
    }

    const fallbacks = [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam',
      'D:\\game\\steam',
      'E:\\Steam',
      'E:\\SteamLibrary',
    ];
    for (const p of fallbacks) {
      if (fs.existsSync(path.join(p, 'steam.exe'))) {
        _steamPathCache = p;
        console.log('[Steam] Found via fallback:', _steamPathCache);
        return _steamPathCache;
      }
    }
    throw new Error('Steam installation not found on Windows');
  }

  if (process.platform === 'linux') {
    _steamPathCache = path.join(os.homedir(), '.steam', 'steam');
    return _steamPathCache;
  }
  if (process.platform === 'darwin') {
    _steamPathCache = path.join(os.homedir(), 'Library', 'Application Support', 'Steam');
    return _steamPathCache;
  }

  throw new Error('Unsupported platform: ' + process.platform);
}

// ── Steamapps paths (main + extra libraries) ──────────────────────────────────

function getSteamappsPaths(steamPath) {
  const paths = [ path.join(steamPath, 'steamapps') ];

  const libraryFoldersPath = path.join(steamPath, 'config', 'libraryfolders.vdf');
  if (fs.existsSync(libraryFoldersPath)) {
    try {
      const raw  = fs.readFileSync(libraryFoldersPath, 'utf-8');
      const data = vdf.parse(raw);
      const libs = data?.libraryfolders ?? data?.LibraryFolders ?? {};
      Object.values(libs).forEach(lib => {
        if (lib?.path) paths.push(path.join(lib.path, 'steamapps'));
      });
    } catch (e) {
      console.warn('[NewGame] Failed to parse libraryfolders.vdf:', e.message);
    }
  }

  return paths.filter(p => fs.existsSync(p));
}

// ── isNew detection via appmanifest ──────────────────────────────────────────

function getNewGameIds(steamPath, recentGames) {
  const newIds = new Set();
  const TWO_WEEKS_AGO = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
  const steamappsPaths = getSteamappsPaths(steamPath);

  for (const game of recentGames) {
    if (game.playtime > 0) continue; // already played — not "new"

    for (const appsPath of steamappsPaths) {
      const manifestPath = path.join(appsPath, `appmanifest_${game.appId}.acf`);
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const raw      = fs.readFileSync(manifestPath, 'utf-8');
        const data     = vdf.parse(raw);
        const state    = data?.AppState ?? data?.appstate ?? {};
        const lastUpd  = parseInt(state?.LastUpdated ?? state?.lastupdated ?? '0', 10);

        if (lastUpd > TWO_WEEKS_AGO) {
          newIds.add(game.appId);
          console.log(`[NewGame] ${game.appId} installed`, new Date(lastUpd * 1000).toLocaleDateString());
        }
      } catch (e) {
        console.warn(`[NewGame] manifest parse error for ${game.appId}:`, e.message);
      }
      break; // found the manifest — no need to check other paths
    }
  }

  return newIds;
}

// ── localconfig.vdf path ─────────────────────────────────────────────────────

function getLocalConfigPath() {
  const steamPath    = getSteamPath();
  const userdataPath = path.join(steamPath, 'userdata');

  if (!fs.existsSync(userdataPath)) {
    throw new Error(`userdata folder not found: ${userdataPath}`);
  }

  const userDirs = fs.readdirSync(userdataPath)
    .filter(d => /^\d+$/.test(d) && d !== '0');

  if (userDirs.length === 0) {
    throw new Error('No Steam user folders found in userdata');
  }

  const userId = userDirs.sort((a, b) => {
    const fa = path.join(userdataPath, a, 'config', 'localconfig.vdf');
    const fb = path.join(userdataPath, b, 'config', 'localconfig.vdf');
    return (fs.existsSync(fb) ? fs.statSync(fb).mtimeMs : 0)
         - (fs.existsSync(fa) ? fs.statSync(fa).mtimeMs : 0);
  })[0];

  const configPath = path.join(userdataPath, userId, 'config', 'localconfig.vdf');

  if (!fs.existsSync(configPath)) {
    throw new Error(`localconfig.vdf not found: ${configPath}`);
  }

  return configPath;
}

export { getLocalConfigPath as getLocalConfigPathExported };

// ── Cover URL ─────────────────────────────────────────────────────────────────

export function getCoverUrl(appId) {
  let steamPath;
  try { steamPath = getSteamPath(); } catch { steamPath = ''; }

  const localPaths = steamPath ? [
    path.join(steamPath, 'appcache', 'librarycache', `${appId}_library_600x900.jpg`),
    path.join(steamPath, 'appcache', 'librarycache', `${appId}_library_600x900_2x.jpg`),
  ] : [];

  for (const p of localPaths) {
    if (fs.existsSync(p)) return `file://${p}`;
  }

  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

// ── Parse recent games ────────────────────────────────────────────────────────

export function parseRecentGames(limit = 20) {
  try {
    const steamPath  = getSteamPath();
    const configPath = getLocalConfigPath();
    const raw        = fs.readFileSync(configPath, 'utf-8');
    const data       = vdf.parse(raw);

    const apps =
      data?.UserLocalConfigStore?.Software?.Valve?.Steam?.apps ??
      data?.UserLocalConfigStore?.software?.valve?.steam?.apps ??
      {};

    const totalCount = Object.keys(apps).length;

    const TWO_WEEKS_AGO = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;

    const recent = Object.entries(apps)
      .map(([appId, info]) => ({
        appId,
        lastPlayed:   parseInt(info?.LastPlayed   ?? info?.lastplayed   ?? '0', 10),
        playtime:     parseInt(info?.Playtime     ?? info?.playtime     ?? '0', 10),
        playtime2wks: parseInt(info?.Playtime2wks ?? info?.playtime2wks ?? '0', 10),
        coverUrl:     getCoverUrl(appId),
      }))
      .filter(g => g.lastPlayed > TWO_WEEKS_AGO)
      .sort((a, b) => b.lastPlayed - a.lastPlayed)
      .slice(0, limit);

    // Detect "new" games (installed < 2 weeks ago, never played)
    const newIds = getNewGameIds(steamPath, recent);

    return {
      total: totalCount,
      recent: recent.map(g => ({ ...g, isNew: newIds.has(g.appId) }))
    };

  } catch (err) {
    console.error('[VDF] Fatal error:', err.message);
    return { total: 0, recent: [] };
  }
}
