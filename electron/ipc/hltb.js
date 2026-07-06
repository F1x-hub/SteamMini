// electron/ipc/hltb.js
// IPC handlers for HowLongToBeat integration.
// Cache and fetch logic lives in electron/hltb.js — this module
// is only responsible for wire-up with ipcMain.

import { app, ipcMain, net } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  HLTB_BASE_URL,
  buildHltbSearchPayload,
  extractHltbSecurityInit,
  getHltbHeaders,
  hasHltbTiming,
  mapHltbSearchResponse,
} from '../hltb.js';

// ──────────────────────────────────────────
// File-based persistent cache
// ──────────────────────────────────────────

const HLTB_CACHE_SCHEMA  = 2;
const HLTB_TTL_MS        = 7 * 24 * 60 * 60 * 1000; // 7 days
const HLTB_TTL_NOT_FOUND =     24 * 60 * 60 * 1000; // 1 day

let _hltbCache = null; // in-memory mirror

// In-flight deduplication: appId → Promise
const _inflight = new Map();

// Batch guard: предотвращает параллельный запуск двух batch
let _batchRunning = false;
let _batchQueue   = null; // последний pending batch пока текущий не завершится

// Debounced save — не чаще 1 раза в 2 сек
let _saveTimer = null;
function scheduleSaveHltbCache() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveHltbCache();
  }, 2000);
}

function hltbCachePath() {
  return path.join(app.getPath('userData'), 'hltb_cache.json');
}

function loadHltbCache() {
  if (_hltbCache) return _hltbCache;
  try {
    _hltbCache = JSON.parse(fs.readFileSync(hltbCachePath(), 'utf8'));
  } catch {
    _hltbCache = {};
  }
  return _hltbCache;
}

function saveHltbCache() {
  try {
    fs.writeFileSync(hltbCachePath(), JSON.stringify(_hltbCache, null, 2), 'utf8');
  } catch (e) {
    console.warn('[HLTB] Cache write failed:', e.message);
  }
}

// ──────────────────────────────────────────
// Network: Finder API (title search)
// ──────────────────────────────────────────

async function fetchHltbByTitle(gameName) {
  try {
    console.log(`[HLTB] Finder lookup for name: "${gameName}"`);

    const initRes = await net.fetch(`${HLTB_BASE_URL}/api/find/init?t=${Date.now()}`, {
      headers: getHltbHeaders(),
    });

    console.log(`[HLTB] Finder init status=${initRes.status}`);
    if (!initRes.ok) throw new Error(`Init failed with status ${initRes.status}`);

    const security = extractHltbSecurityInit(await initRes.json());
    if (!security) throw new Error('Could not extract search security init');

    const doSearch = async (auth) => {
      const response = await net.fetch(`${HLTB_BASE_URL}/api/find`, {
        method: 'POST',
        headers: getHltbHeaders({
          'Content-Type': 'application/json',
          'x-auth-token': auth.token,
          'x-hp-key': auth.hpKey,
          'x-hp-val': auth.hpVal,
        }),
        body: JSON.stringify(buildHltbSearchPayload(gameName, auth.hpKey, auth.hpVal)),
      });

      if (response.status === 403) {
        console.warn('[HLTB] Search token expired, refreshing and retrying...');
        const retryInitRes = await net.fetch(`${HLTB_BASE_URL}/api/find/init?t=${Date.now()}`, {
          headers: getHltbHeaders(),
        });
        if (!retryInitRes.ok) throw new Error(`Retry init failed with status ${retryInitRes.status}`);
        const retrySecurity = extractHltbSecurityInit(await retryInitRes.json());
        if (!retrySecurity) throw new Error('Could not extract retry search security init');
        return doSearch(retrySecurity);
      }

      return response;
    };

    const searchRes = await doSearch(security);
    console.log(`[HLTB] Finder search status=${searchRes.status}`);
    if (!searchRes.ok) throw new Error(`Search failed with status ${searchRes.status}`);

    const data = mapHltbSearchResponse(await searchRes.json(), gameName);
    if (data._notFound) {
      console.log(`[HLTB] name="${gameName}" → no finder match`);
    } else {
      console.log(`[HLTB] name="${gameName}" → main=${data.mainStory ?? '-'}h extra=${data.mainExtra ?? '-'}h compl=${data.completionist ?? '-'}h`);
    }

    return data;
  } catch (err) {
    console.error('[HLTB] Finder API error:', err.message);
    return null;
  }
}

// ──────────────────────────────────────────
// Core lookup: appId (codepotatoes) → fallback title search
// ──────────────────────────────────────────

async function resolveHltbTime(appId, gameName) {
  const key = String(appId);
  const cache = loadHltbCache();

  const entry = cache[key];
  if (entry) {
    if (entry.v === HLTB_CACHE_SCHEMA) {
      const ttl = entry.data?._notFound ? HLTB_TTL_NOT_FOUND : HLTB_TTL_MS;
      if (Date.now() - entry.ts < ttl) {
        console.log(`[HLTB] appId=${appId} → cache hit`);
        return entry.data;
      }
    } else {
      delete cache[key];
    }
  }

  // Если запрос для этого appId уже летит — ждём его результат
  if (_inflight.has(key)) {
    console.log(`[HLTB] appId=${appId} → dedup (in-flight)`);
    return _inflight.get(key);
  }

  const promise = _doFetch(appId, gameName, key, cache);
  _inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    _inflight.delete(key);
  }
}

async function _doFetch(appId, gameName, key, cache) {
  // First pass: codepotatoes (appId-based mapping)
  let data = null;
  const url = `https://hltbapi.codepotatoes.de/steam/${appId}`;
  console.log(`[HLTB] Fetching appId=${appId}`);

  try {
    const res = await net.fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'SteamMini/1.0', 'Accept': 'application/json' },
    });

    console.log(`[HLTB] appId=${appId} API status=${res.status}`);

    if (res.status === 200) {
      const json = await res.json();
      console.log(`[HLTB] appId=${appId} → main=${json.mainStory}h extra=${json.mainStoryWithExtras}h compl=${json.completionist}h`);
      const mappedData = {
        mainStory:     json.mainStory            || null,
        mainExtra:     json.mainStoryWithExtras  || null,
        completionist: json.completionist        || null,
      };
      data = hasHltbTiming(mappedData) ? mappedData : null;
    }
  } catch (e) {
    console.log(`[HLTB] API error: ${e.message}`);
  }

  // Second pass: fallback to title-based finder
  if (!data && gameName) {
    data = await fetchHltbByTitle(gameName);
  }

  if (data) {
    cache[key] = { data, ts: Date.now(), v: HLTB_CACHE_SCHEMA };
    scheduleSaveHltbCache(); // ← batched write вместо на каждую игру
  }

  return data;
}

// ──────────────────────────────────────────
// IPC registration
// ──────────────────────────────────────────

export function registerHltbHandlers() {
  // Single game lookup (used from gameDetail page)
  ipcMain.handle('hltb:getTime', async (_event, appId, gameName) => {
    return resolveHltbTime(appId, gameName);
  });

  // Batch lookup (used from library page cards)
  ipcMain.handle('hltb:getBatch', async (_event, games) => {
    // Если batch уже выполняется — не запускаем второй параллельно,
    // возвращаем промис уже идущего (или ставим в очередь последний)
    if (_batchRunning) {
      console.log(`[HLTB:batch] Skipping duplicate batch call (already running)`);
      if (_batchQueue) return _batchQueue;
      _batchQueue = new Promise(resolve => {
        const origGames = games;
        const check = setInterval(() => {
          if (!_batchRunning) {
            clearInterval(check);
            _batchQueue = null;
            resolve(_runBatch(origGames));
          }
        }, 100);
      });
      return _batchQueue;
    }

    _batchRunning = true;
    try {
      return await _runBatch(games);
    } finally {
      _batchRunning = false;
    }
  });
}

async function _runBatch(games) {
  // games: [{ appId, name }]
  const results = {};
  const CONCURRENCY = 3;
  const DELAY_MS = 150;

  const cache = loadHltbCache();
  const toFetch = [];

  for (const { appId, name } of games) {
    const key = String(appId);
    const entry = cache[key];
    let hasValidCache = false;

    if (entry && entry.v === HLTB_CACHE_SCHEMA) {
      const ttl = entry.data?._notFound ? HLTB_TTL_NOT_FOUND : HLTB_TTL_MS;
      if (Date.now() - entry.ts < ttl) {
        hasValidCache = true;
        if (entry.data && !entry.data._notFound) {
          results[key] = entry.data;
        }
      }
    }

    if (!hasValidCache) {
      toFetch.push({ appId, name });
    }
  }

  console.log(`[HLTB:batch] cached=${games.length - toFetch.length}, toFetch=${toFetch.length}`);

  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const chunk = toFetch.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async ({ appId, name }) => {
      const data = await resolveHltbTime(appId, name);
      if (data && !data._notFound) {
        results[String(appId)] = data;
      }
    }));
    if (i + CONCURRENCY < toFetch.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return results;
}
