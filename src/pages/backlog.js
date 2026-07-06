import steamApi from '../api/steam.js';
import { icons } from '../utils/icons.js';
import { cacheGet, cacheSet, TTL } from '../cache/pageCache.js';
import { renderPlaylist } from '../components/Playlist.js';
import router from '../router/index.js';
import { buildPlaylists } from '../services/backlogEngine.js';
import {
  clearHltbCache,
  filterUncached,
  getCached,
  setCached,
} from '../services/hltbCache.js';

const LIBRARY_CACHE_KEY = 'library:ownedGames';
const HLTB_BATCH_SIZE = 150;
const GENRE_ENRICH_LIMIT = 24;
const ACHIEVEMENT_ENRICH_LIMIT = 2000;

export async function renderBacklog() {
  const page = document.createElement('div');
  page.className = 'page-container backlog-page';
  await populateBacklog(page);
  return page;
}

function _showRefreshBadge(header) {
  const badge = header.querySelector('#backlog-refresh-badge');
  if (!badge) return;
  badge.style.display = 'flex';
  badge.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;
      background:var(--color-bg-surface);border:1px solid var(--color-border);
      color:var(--color-text-secondary);font-size:11px;">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" style="animation:_bspin 1.4s linear infinite">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      обновляется
    </div>
  `;
  if (!document.getElementById('_bspin-style')) {
    const s = document.createElement('style');
    s.id = '_bspin-style';
    s.textContent = '@keyframes _bspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
}

function _hideRefreshBadge(header) {
  const badge = header?.querySelector('#backlog-refresh-badge');
  if (badge) badge.style.display = 'none';
}

async function populateBacklog(page, options = {}) {
  const { forceRefresh = false } = options;

  page.innerHTML = '';

  // ─── Header ────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'backlog-header';
  header.innerHTML = `
    <h1 style="display:flex;align-items:center;gap:8px;">${icons.game} Во что поиграть?</h1>
    <p class="backlog-desc">Умные подборки из твоей библиотеки на основе HLTB и прогресса</p>
    <div class="backlog-actions" style="display:flex;align-items:center;gap:8px;">
      ${import.meta.env.DEV ? `<button id="btn-refresh-hltb" class="btn-secondary" style="display:flex;align-items:center;gap:6px;">${icons.refresh} Обновить HLTB данные</button>` : ''}
      <div id="backlog-refresh-badge" style="display:none;"></div>
    </div>
  `;
  page.appendChild(header);

  header.querySelector('#btn-refresh-hltb')?.addEventListener('click', async () => {
    clearHltbCache();
    await populateBacklog(page, { forceRefresh: true });
  });

  // ─── 1. Персистентный кэш → мгновенный рендер ─────────────────────────
  let playlistsContainer = null;
  let cachedGames = null;

  if (!forceRefresh && window.electronAuth?.backlogGetCache) {
    const persisted = await window.electronAuth.backlogGetCache();

    if (persisted?.games?.length) {
      cachedGames = persisted.games;

      // Восстанавливаем HLTB в renderer-кэш из встроенных данных
      cachedGames.forEach(g => {
        if (g._hltb) setCached(String(g.appid), g._hltb);
      });

      const playlists = buildPlaylists(cachedGames);
      if (playlists.length) {
        playlistsContainer = document.createElement('div');
        playlistsContainer.className = 'playlists-container';
        renderPlaylists(playlistsContainer, playlists);
        page.appendChild(playlistsContainer);
      }

      if (!persisted.stale) {
        // Кэш свежий — фоновый сбор не нужен
        return;
      }

      // Кэш устарел — показываем badge, данные уже на экране
      _showRefreshBadge(header);
    }
  }

  // ─── 2. Скелетон только если кэша нет ─────────────────────────────────
  let loader = null;
  if (!cachedGames) {
    loader = document.createElement('div');
    loader.id = 'backlog-loader';
    loader.className = 'backlog-loader';
    loader.innerHTML = buildSkeletons(3);
    page.appendChild(loader);
  }

  // ─── 3. Фоновый сбор данных ────────────────────────────────────────────
  try {
    const games = await waitForGames(10000);

    if (!games.length) {
      loader?.remove();
      _hideRefreshBadge(header);
      if (!cachedGames) showEmpty(page, 'Библиотека пуста или ещё не успела загрузиться.');
      return;
    }

    const MAX_FETCH = 200;
    const prioritized = [...games].sort((a, b) =>
      (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0)
    );
    const uncached = filterUncached(prioritized).slice(0, MAX_FETCH);

    if (uncached.length > 0 && window.electronAuth?.hltbGetBatch) {
      const TIME_PER_GAME = 0.5; // ~500ms на игру (зависит от конкаренси на бэке)
      let remainingSeconds = Math.round(uncached.length * TIME_PER_GAME);
      let timerInterval = null;

      if (loader) {
        const updateText = () => {
          let timeStr = '';
          if (remainingSeconds >= 60) {
            timeStr = `(~${Math.ceil(remainingSeconds / 60)} мин)`;
          } else {
            timeStr = '(< 1 мин)';
          }
          updateLoaderText(loader, `Загружаем HLTB для ${uncached.length} игр... ${timeStr}`);
        };
        updateText();
        
        timerInterval = setInterval(() => {
          remainingSeconds -= 1;
          if (remainingSeconds < 0) remainingSeconds = 0;
          updateText();
        }, 1000);
      }

      try {
        const payload = uncached.map((game) => ({ appId: game.appid, name: game.name }));
        const fresh = await window.electronAuth.hltbGetBatch(payload);
        Object.entries(fresh || {}).forEach(([appId, data]) => {
          const normalized = normalizeHltb(data);
          if (normalized) setCached(appId, normalized);
        });
      } finally {
        if (timerInterval) clearInterval(timerInterval);
      }
    } else if (!window.electronAuth?.hltbGetBatch) {
      if (loader) updateLoaderText(loader, 'HLTB batch API недоступен...');
    }

    const playlists = buildPlaylists(games);
    loader?.remove();
    _hideRefreshBadge(header);

    if (!playlists.length) {
      if (!cachedGames) showEmpty(page, 'Не удалось собрать подборки. Попробуй обновить HLTB данные.');
      return;
    }

    // ─── Атомарная замена (старые данные → новые без мигания) ────────────
    const newContainer = document.createElement('div');
    newContainer.className = 'playlists-container';
    renderPlaylists(newContainer, playlists);

    if (playlistsContainer) {
      playlistsContainer.replaceWith(newContainer);
    } else {
      page.appendChild(newContainer);
    }
    playlistsContainer = newContainer;

    // ─── Фоновое обогащение + сохранение кэша ────────────────────────────
    void enrichBacklogMetadata(games)
      .then((didChange) => {
        const withAch = games.filter(g =>
          typeof g.achievements_total === 'number' && g.achievements_total > 0
        );
        const platClose = games.filter(g => {
          const total    = g.achievements_total || 0;
          const unlocked = g.achievements_unlocked || 0;
          if (total < 3 || unlocked === 0 || unlocked >= total) return false;
          return unlocked / total >= 0.25;
        });
        console.log(`[backlog] После enrichment: игр с достижениями=${withAch.length}, подходят platinum_close=${platClose.length}`);
        if (platClose.length === 0) {
          console.warn('[backlog] platinum_close пуст — вероятно achievement_total не загружены или нет игр с 25%+');
          console.log('[backlog] Топ-5 игр по ачивкам:', games
            .filter(g => (g.achievements_total || 0) > 0)
            .sort((a, b) => {
              const pA = (a.achievements_unlocked || 0) / (a.achievements_total || 1);
              const pB = (b.achievements_unlocked || 0) / (b.achievements_total || 1);
              return pB - pA;
            })
            .slice(0, 5)
            .map(g => `${g.name}: ${g.achievements_unlocked}/${g.achievements_total} (${Math.round(((g.achievements_unlocked||0)/(g.achievements_total||1))*100)}%)`)
          );
        }

        if (didChange && playlistsContainer) {
          renderPlaylists(playlistsContainer, buildPlaylists(games));
        }

        // Сохраняем обогащённые данные — встраиваем HLTB в объекты игр
        if (window.electronAuth?.backlogSetCache) {
          const gamesForCache = games.map(g => ({
            ...g,
            _hltb: getCached(String(g.appid)) ?? undefined,
          }));
          window.electronAuth.backlogSetCache(gamesForCache)
            .catch(e => console.warn('[backlog] Cache save failed:', e));
        }
      })
      .catch((error) => {
        console.warn('[backlog] Metadata enrichment skipped:', error);
      });

  } catch (error) {
    console.error('[backlog] Ошибка:', error);
    loader?.remove();
    _hideRefreshBadge(header);
    if (!cachedGames) showEmpty(page, `Ошибка: ${error.message}`);
  }
}

function waitForGames(timeoutMs = 10000) {
  return new Promise((resolve) => {
    const check = () => {
      const games = cacheGet(LIBRARY_CACHE_KEY, TTL.GAMES_LIST) || [];
      if (games.length > 0) return resolve(games.map(cloneGame));
    };
    check(); // сразу проверяем

    const interval = setInterval(() => {
      const games = cacheGet(LIBRARY_CACHE_KEY, TTL.GAMES_LIST) || [];
      if (games.length > 0) {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve(games.map(cloneGame));
      }
    }, 300);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      resolve([]); // таймаут → пустой массив → showEmpty
    }, timeoutMs);
  });
}

async function enrichBacklogMetadata(games) {
  let changed = false;

  const genreCandidates = games
    .filter((game) => {
      const hltb = getCached(game.appid);
      return hltb?.complete >= 100 && (!Array.isArray(game.genres) || game.genres.length === 0);
    })
    .slice(0, GENRE_ENRICH_LIMIT);

  const achievementCandidates = games
    .filter(
      (game) =>
        (game.playtime_forever || 0) > 0 &&
        (typeof game.achievements_total !== 'number' ||
          typeof game.achievements_unlocked !== 'number') &&
        // Пропускаем игры где уже знаем что нет достижений
        game.achievements_total !== 0
    )
    // Приоритет: сначала игры с известными достижениями, потом неизвестные
    .sort((a, b) => {
      const aHas = typeof a.achievements_total === 'number' ? 1 : 0;
      const bHas = typeof b.achievements_total === 'number' ? 1 : 0;
      return bHas - aHas;
    })
    .slice(0, ACHIEVEMENT_ENRICH_LIMIT);

  console.log(`[backlog] achievementCandidates: ${achievementCandidates.length} игр для обогащения`);

  await runBatches(genreCandidates, 6, async (game) => {
    const details = await steamApi.getAppDetails(game.appid);
    const genres = (details?.genres || []).map((genre) => genre.description).filter(Boolean);
    if (genres.length > 0) {
      game.genres = genres;
      changed = true;
    }
  });

  if (typeof steamApi.getAchievementSummary === 'function') {
    await runBatches(achievementCandidates, 6, async (game) => {
      const summary = await steamApi.getAchievementSummary(game.appid);
      if (!summary || typeof summary.total !== 'number') {
        // Помечаем что у игры нет достижений — не будем пробовать снова
        game.achievements_total = 0;
        game.achievements_unlocked = 0;
        return;
      }

      game.achievements_total = summary.total;
      game.achievements_unlocked = summary.unlocked;
      console.log(`[backlog] Ачивки загружены: ${game.name} — ${summary.unlocked}/${summary.total}`);
      changed = true;
    });
  }

  return changed;
}

async function runBatches(items, batchSize, worker) {
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    await Promise.allSettled(batch.map((item) => worker(item)));
  }
}

function renderPlaylists(container, playlists) {
  container.innerHTML = '';

  playlists.forEach((playlist, index) => {
    const section = renderPlaylist(playlist, (game) => {
      router.navigate(`/game/${game.appid}`);
    });
    section.style.animationDelay = `${index * 80}ms`;
    container.appendChild(section);
  });
}

function normalizeHltb(data) {
  if (!data) return null;

  return {
    main: data.mainStory || null,
    extra: data.mainExtra || null,
    complete: data.completionist || null,
  };
}

function cloneGame(game) {
  return {
    ...game,
    genres: Array.isArray(game.genres) ? [...game.genres] : game.genres,
  };
}

function showEmpty(page, message) {
  const empty = document.createElement('div');
  empty.className = 'backlog-empty';
  empty.innerHTML = `<span style="display:flex;justify-content:center;margin-bottom:8px;transform:scale(1.5)">${icons.coffee}</span><p>${message}</p>`;
  page.querySelector('.backlog-loader')?.remove();
  page.appendChild(empty);
}

function updateLoaderText(loader, text) {
  const label = loader.querySelector('.loader-label');
  if (label) {
    label.textContent = text;
  }
}

function buildSkeletons(count) {
  return `
    <div style="padding: 0 24px; min-height: 18px; margin-top: 8px;">
      <p class="loader-label" style="margin: 0;"></p>
    </div>
    ${Array.from(
      { length: count },
      (_, i) => `
        <section class="playlist-section" style="animation-delay: ${i * 80}ms;">
          <div class="playlist-header">
            <div class="playlist-title-group">
              <div class="skel" style="width: 160px; height: 20px; border-radius: 4px; margin-bottom: 6px;"></div>
              <div class="skel" style="width: 240px; height: 14px; border-radius: 4px;"></div>
            </div>
            <div class="skel" style="width: 50px; height: 14px; border-radius: 4px;"></div>
          </div>
          <div class="playlist-track" style="overflow-x: hidden;">
            ${Array.from({ length: 8 }, () => `
              <div class="bl-card" style="cursor: default; transform: none;">
                <div class="skel skel-card" style="border: none; box-shadow: none;"></div>
                <div class="bl-card-info" style="padding-top: 10px;">
                  <div class="skel" style="width: 90%; height: 14px; border-radius: 3px; margin-bottom: 6px;"></div>
                  <div class="skel" style="width: 60%; height: 12px; border-radius: 3px;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      `
    ).join('')}
  `;
}
