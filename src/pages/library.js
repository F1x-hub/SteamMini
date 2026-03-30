import steamApi from '../api/steam.js';
import autoFarm from '../utils/autoFarm.js';
import store from '../store/index.js';
import router from '../router/index.js';
import { renderFarmStats } from './farmStats.js';
import { renderFarmSettings } from './farmSettings.js';

export async function renderLibrary() {
  const container = document.createElement('div');
  container.className = 'page-container library-page';
  
  container.innerHTML = `<div class="loading">
    <div class="skeleton-item" style="height:40px;margin-bottom:12px;"></div>
    <div class="skeleton-item" style="height:24px;width:60%;margin-bottom:20px;"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
      ${Array(12).fill('<div class="skeleton-item" style="height:80px;"></div>').join('')}
    </div>
  </div>`;

  try {
    const data = await steamApi.getOwnedGames();
    const games = data?.response?.games || [];

    if (games.length === 0) {
      container.innerHTML = `<div class="empty">No games found in your library.</div>`;
      return container;
    }

    // Sort will be applied dynamically via sortGames()

    container.innerHTML = `
      <div class="library-header">
        <div class="header-top-row">
          <div class="title-group">
            <h2>Your Library</h2>
            <span class="title-dot">·</span>
            <span class="title-count"><span id="library-count">${games.length}</span> игр</span>
          </div>
          <div class="search-container" style="display:flex;align-items:center;gap:12px;">
            <input type="text" id="library-search" class="search-input" placeholder="Search games..." />
            <button
              onclick="showActivateKeyModal()"
              title="Активировать ключ Steam"
              style="
                padding: 8px 16px; border-radius: var(--radius-sm); cursor: pointer;
                border: 1px solid var(--color-border); background: var(--color-bg-surface-light);
                color: var(--color-text-secondary); font-size: 13px; white-space: nowrap;
                display: flex; align-items: center; gap: 6px;
                transition: border-color var(--transition-fast), color var(--transition-fast);
              "
              onmouseover="this.style.borderColor='var(--color-accent-green)';this.style.color='var(--color-accent-green)'"
              onmouseout="this.style.borderColor='var(--color-border)';this.style.color='var(--color-text-secondary)'"
            >
              🔑 Активировать ключ
            </button>
          </div>
        </div>
        <div id="sort-bar" style="padding: 10px 0 4px;"></div>
        <div class="header-divider"></div>
        <div class="filters-row">
          <label class="filter-toggle-cards" id="filter-cards-label">
            <input type="checkbox" id="filter-remaining-drops" style="display: none;">
            <span>🃏 Карточки</span>
          </label>
          <button id="auto-farm-btn" class="auto-farm-btn-round" style="display: none;" title="Запустить авто-фарм">
            <svg class="icon-play" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <svg class="icon-pause" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <div id="global-drops-counter" class="global-drops-count" style="display: none;"></div>
          <button id="btn-show-stats" class="inline-action-btn" style="display:none;" title="Статистика фарма">📊</button>
          <button id="btn-show-settings" class="inline-action-btn" style="display:none;" title="Настройки фарма">⚙</button>
          <button id="stop-all-idle-btn" class="stop-all-btn" style="display: none;">Stop All Idle</button>
        </div>
      </div>
      
      <div id="inline-panels-container">
        <div id="panel-stats" style="display:none;" class="inline-panel-container"></div>
        <div id="panel-settings" style="display:none;" class="inline-panel-container"></div>
      </div>
      
      <div id="auto-farm-status-bar" class="auto-farm-status-bar" style="display: none;"></div>
      <div id="recent-shelf" class="recent-shelf"></div>
      <div class="games-grid" id="games-grid"></div>
    `;

    const grid = container.querySelector('#games-grid');
    const sortBar = container.querySelector('#sort-bar');
    const searchInput = container.querySelector('#library-search');
    const dropsCheckbox = container.querySelector('#filter-remaining-drops');
    const filterCardsLabel = container.querySelector('#filter-cards-label');
    const autoFarmBtn = container.querySelector('#auto-farm-btn');
    const autoFarmStatusBar = container.querySelector('#auto-farm-status-bar');
    const stopAllBtn = container.querySelector('#stop-all-idle-btn');
    const globalDropsEl = container.querySelector('#global-drops-counter');
    const libraryCountEl = container.querySelector('#library-count');
    
    const btnShowStats = container.querySelector('#btn-show-stats');
    const btnShowSettings = container.querySelector('#btn-show-settings');
    const panelStats = container.querySelector('#panel-stats');
    const panelSettings = container.querySelector('#panel-settings');

    let currentSearchQuery = '';
    let filterCardsOnly = false;
    let cardDropsData = {};
    let currentSort = localStorage.getItem('library_sort') ?? 'recent';
    if (currentSort === 'installed') {
      currentSort = 'recent';
      localStorage.setItem('library_sort', 'recent');
    }
    let showInstalled = localStorage.getItem('library_show_installed') === 'true';
    let isDropsLoaded = false;
    let installedIds = new Set(); // populated once below
    
    let showStats = false;
    let showSettings = false;
    
    const updateInlinePanels = () => {
      btnShowStats.style.display = filterCardsOnly ? 'flex' : 'none';
      btnShowSettings.style.display = filterCardsOnly ? 'flex' : 'none';
      
      if (!filterCardsOnly) {
         showStats = false;
         showSettings = false;
      }
      
      if (showStats) {
         btnShowStats.style.borderColor = 'var(--color-accent-green)';
         btnShowStats.style.background = 'rgba(34,197,94,0.15)';
         btnShowStats.style.color = 'var(--color-accent-green)';
         panelStats.style.display = 'block';
         if (!panelStats.hasChildNodes()) {
             const v = renderFarmStats();
             v.style.padding = '0';
             panelStats.appendChild(v);
         }
      } else {
         btnShowStats.style.borderColor = 'var(--color-border)';
         btnShowStats.style.background = 'var(--color-bg-surface-light)';
         btnShowStats.style.color = 'var(--color-text-secondary)';
         panelStats.style.display = 'none';
      }
      
      if (showSettings) {
         btnShowSettings.style.borderColor = 'var(--color-warning)';
         btnShowSettings.style.background = 'rgba(245,158,11,0.15)';
         btnShowSettings.style.color = 'var(--color-warning)';
         panelSettings.style.display = 'block';
         if (!panelSettings.hasChildNodes()) {
             const v = renderFarmSettings();
             v.style.padding = '0';
             panelSettings.appendChild(v);
         }
      } else {
         btnShowSettings.style.borderColor = 'var(--color-border)';
         btnShowSettings.style.background = 'var(--color-bg-surface-light)';
         btnShowSettings.style.color = 'var(--color-text-secondary)';
         panelSettings.style.display = 'none';
      }
    };
    
    btnShowStats.addEventListener('click', () => {
       showStats = !showStats;
       showSettings = false;
       updateInlinePanels();
    });
    
    btnShowSettings.addEventListener('click', () => {
       showSettings = !showSettings;
       showStats = false;
       updateInlinePanels();
    });

    // Fetch installed IDs once, mark game.isInstalled on each object
    if (window.electronAuth && window.electronAuth.steamGetAllInstalled) {
      try {
        const arr = await window.electronAuth.steamGetAllInstalled();
        installedIds = new Set(arr);
        games.forEach(g => { g.isInstalled = installedIds.has(String(g.appid)); });
      } catch (err) {
        console.error('Failed to fetch installed games:', err);
      }
    }

    console.log('[Filter] All games count:', games.length);

    // Fetch card drops asynchronously
    steamApi.getRemainingCardDrops().then(drops => {
      console.log('[Library] Card drops mapping received:', Object.keys(drops).length, 'games');
      cardDropsData = drops;
      store.set('cardDropsMap', drops);
      isDropsLoaded = true;
      renderGames(getFilteredGames());
    }).catch(err => {
      console.error("[Library] Failed to load card drops:", err);
    });

    store.subscribe('cardDropsMap', (newMap) => {
      if (newMap) {
         cardDropsData = newMap;
         if (isDropsLoaded) renderGames(getFilteredGames(), false);
      }
    });

    let activeIdles = new Set();
    if (window.electronAuth && window.electronAuth.getIdleActive) {
      const activeRes = await window.electronAuth.getIdleActive();
      if (activeRes && activeRes.success && activeRes.data) {
        activeIdles = new Set(activeRes.data);
      }
    }
    
    const updateStopAllButtonVisibility = () => {
      const status = store.get('autoFarmStatus') || { isActive: false };
      stopAllBtn.style.display = (activeIdles.size > 0 && !status.isActive) ? 'inline-flex' : 'none';
    };
    updateStopAllButtonVisibility();

    const renderAutoFarmState = () => {
      const status = store.get('autoFarmStatus');
      if (!status || (!status.isActive && !status.phase)) {
        if (!filterCardsOnly) {
          autoFarmBtn.style.display = 'none';
        } else {
          autoFarmBtn.style.display = 'inline-flex';
          autoFarmBtn.classList.remove('active');
          autoFarmBtn.querySelector('.icon-play').style.display = 'block';
          autoFarmBtn.querySelector('.icon-pause').style.display = 'none';
          autoFarmBtn.title = 'Запустить авто-фарм';
        }
        autoFarmStatusBar.style.display = 'none';
        return;
      }
      
      autoFarmBtn.style.display = 'inline-flex';
      
      if (status.isActive) {
        autoFarmBtn.classList.add('active');
        autoFarmBtn.querySelector('.icon-play').style.display = 'none';
        autoFarmBtn.querySelector('.icon-pause').style.display = 'block';
        autoFarmBtn.title = 'Пауза авто-фарма';
        
        autoFarmStatusBar.style.display = 'flex';
        let html = '';
        
        // Phase 1 — Simultaneous status
        if (status.phase === 'simultaneous') {
          const formatTime = (seconds) => {
            if (typeof seconds !== 'number') return '...';
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
          };
          const phaseTimeLeft = status.phaseTimeLeft;
          const timeStr = formatTime(phaseTimeLeft);
          const activeCount = status.currentBatch ? status.currentBatch.length : 0;
          
          html += `
            <div class="status-phase-row simultaneous-row">
              <span class="phase-pill pill-simultaneous">ПРОГРЕВ</span>
              <span class="status-icon">🔥</span>
              <span>${activeCount} игр</span>
              <span class="status-sep">·</span>
              <span>смена фазы через ${timeStr}</span>
            </div>`;
        }
        
        // Phase 2 — Sequential status
        else if (status.phase === 'sequential') {
          let timeStr = '...';
          if (status.nextActionTime) {
            const diff = Math.max(0, status.nextActionTime - Date.now());
            const sec = Math.floor((diff % 60000) / 1000);
            timeStr = `${sec}s`;
          }
          const currentIdx = (status.currentIndex || 0) + 1;
          const totalInBatch = status.currentBatch ? status.currentBatch.length : 0;
          const gameName = status.currentFarmGame ? status.currentFarmGame.name : '...';
          
          html += `
            <div class="status-phase-row sequential-row">
              <span class="phase-pill pill-sequential">ФАРМ</span>
              <span class="status-icon">▶</span>
              <span class="farm-game-name">${gameName}</span>
              <span class="status-sep">·</span>
              <span>${currentIdx}/${totalInBatch}</span>
              <span class="status-sep">·</span>
              <span>смена фазы через ${timeStr}</span>
            </div>`;
        }
        
        autoFarmStatusBar.innerHTML = html;
        
        // Set background based on dominant phase
        autoFarmStatusBar.classList.remove('bar-simultaneous', 'bar-sequential');
        if (status.phase === 'simultaneous') autoFarmStatusBar.classList.add('bar-simultaneous');
        else if (status.phase === 'sequential') autoFarmStatusBar.classList.add('bar-sequential');
        
      } else {
        autoFarmBtn.classList.remove('active');
        autoFarmBtn.querySelector('.icon-play').style.display = 'block';
        autoFarmBtn.querySelector('.icon-pause').style.display = 'none';
        autoFarmBtn.title = 'Продолжить авто-фарм';
        
        autoFarmStatusBar.style.display = 'flex';
        autoFarmStatusBar.classList.remove('bar-warmup', 'bar-farm', 'bar-mixed');
        const totalGames = Object.keys(status.gamesMetadata || {}).length;
        autoFarmStatusBar.innerHTML = `
          <div class="status-phase-row">
            <span class="phase-pill pill-paused">ПАУЗА</span>
            <span>сохранено ${totalGames} игр</span>
          </div>`;
      }
    };

    store.subscribe('autoFarmStatus', () => {
       renderAutoFarmState();
       renderGames(getFilteredGames(), false);
       updateStopAllButtonVisibility();
    });

    const renderGames = async (list, fullRender = true) => {
      console.log('[Filter] Filtered games count:', list.length);

      let totalDrops = 0;
      let gamesWithDropsCount = 0;

      // Calculate totals using ALL games (ignore UI filters)
      games.forEach(game => {
        const drops = cardDropsData[String(game.appid)] || 0;
        if (drops > 0) {
          totalDrops += drops;
          gamesWithDropsCount++;
        }
      });

      if (fullRender) {
        // Chunked rendering — avoid blocking UI with 10k+ DOM nodes
        const CHUNK_SIZE = 60;

        const buildCardHtml = (game, i) => {
          const animDelay = (i % 20) * 20;
          const isInstalled = installedIds.has(String(game.appid));
          
          let actionBtnHtml = '';
          if (isInstalled) {
            actionBtnHtml = `<button class="play-btn" data-appid="${game.appid}">Play</button>`;
          } else {
            actionBtnHtml = `<button class="btn-install" data-appid="${game.appid}">Установить</button>`;
          }

          const hrs = game.playtime_forever ? Math.floor(game.playtime_forever / 60) : 0;
          const playtimeStr = hrs >= 1000 ? `${(hrs/1000).toFixed(1)}k ч` : `${hrs} ч`;
          const lastStr = (currentSort === 'recent' && game.rtime_last_played)
            ? ` · ${new Date(game.rtime_last_played * 1000).toLocaleDateString('ru-RU')}`
            : '';

          return `
            <div class="game-card" data-appid="${game.appid}" style="animation-delay: ${animDelay}ms">
              <div class="game-card-top">
                <div class="skeleton-cover" style="width: 32px; height: 32px; display: inline-block; border-radius: var(--radius-sm); flex-shrink: 0; overflow: hidden;">
                  <img src="http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg" 
                       alt="${game.name}" class="game-icon" 
                       style="opacity: 0; transition: opacity 250ms ease;"
                       onload="this.style.opacity='1'; this.parentElement.classList.remove('skeleton-cover');"
                       onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\'></svg>'; this.parentElement.classList.remove('skeleton-cover'); this.style.opacity='1';"/>
                </div>
                <div class="game-card-title-group">
                  <h3 title="${game.name}">${game.name}</h3>
                  <p class="playtime-text">${playtimeStr}${lastStr}</p>
                </div>
              </div>
              <div class="game-card-status-row">
                <div class="badges-container"></div>
                <label class="idle-switch">
                  <span class="idle-label" style="font-size: 11px; color: #555; user-select: none;">Idle</span>
                  <div class="switch-control">
                    <input type="checkbox" class="idle-checkbox" data-appid="${game.appid}">
                    <span class="switch-thumb"></span>
                  </div>
                </label>
              </div>
              ${actionBtnHtml}
            </div>`;
        };

        // First chunk — render immediately
        const firstChunk = list.slice(0, CHUNK_SIZE);
        grid.innerHTML = firstChunk.map(buildCardHtml).join('');

        // Remaining chunks — append via rAF to avoid blocking
        let offset = CHUNK_SIZE;
        const appendNextChunk = () => {
          if (offset >= list.length) return;
          const chunk = list.slice(offset, offset + CHUNK_SIZE);
          const fragment = document.createElement('div');
          fragment.innerHTML = chunk.map((game, i) => buildCardHtml(game, offset + i)).join('');
          while (fragment.firstChild) {
            grid.appendChild(fragment.firstChild);
          }
          offset += CHUNK_SIZE;
          if (offset < list.length) {
            requestAnimationFrame(appendNextChunk);
          }
        };
        if (list.length > CHUNK_SIZE) {
          requestAnimationFrame(appendNextChunk);
        }
      }

      const afStatus = store.get('autoFarmStatus');
      const threshold = afStatus?.warmupThreshold || 2.0;

      list.forEach(game => {
        const card = grid.querySelector(`.game-card[data-appid="${game.appid}"]`);
        if (!card) return;

        let isIdling = activeIdles.has(game.appid.toString());
        const remainingDrops = cardDropsData[String(game.appid)] || 0;

        let badgeHtml = '';
        let cardState = '';

        if (afStatus && afStatus.isActive && afStatus.gamesMetadata) {
          const meta = afStatus.gamesMetadata[game.appid.toString()];
          if (meta) {
            switch (meta.state) {
              case 'simultaneous':
                badgeHtml = `<span class="card-badge af-warmup">🔥 Прогрев</span>`;
                cardState = 'state-warmup';
                isIdling = true;
                break;
              case 'sequential-active':
                badgeHtml = `<span class="card-badge af-farming">▶ Фармится</span>`;
                cardState = 'state-farm-active';
                isIdling = true;
                break;
              case 'sequential-queue':
                badgeHtml = `<span class="card-badge af-farm-queue">⌛ В ОЧЕРЕДИ</span>`;
                cardState = 'state-farm-queue';
                break;
              default:
                badgeHtml = remainingDrops > 0 ? `<span class="card-badge">🃏 ${remainingDrops}</span>` : '';
            }
          } else {
            badgeHtml = remainingDrops > 0 ? `<span class="card-badge">🃏 ${remainingDrops}</span>` : '';
          }
        } else {
          badgeHtml = remainingDrops > 0 ? `<span class="card-badge">🃏 ${remainingDrops}</span>` : '';
          if (isIdling) cardState = 'state-idle';
        }

        // Update classes
        card.classList.remove('state-idle', 'state-farm', 'state-queue', 'state-warmup', 'state-warmup-queue', 'state-farm-active', 'state-farm-queue');
        if (cardState) card.classList.add(cardState);

        // Update badge
        const badgeCont = card.querySelector('.badges-container');
        if (badgeCont.innerHTML !== badgeHtml) {
          badgeCont.innerHTML = badgeHtml;
        }

        // Update checkbox
        const cb = card.querySelector('.idle-checkbox');
        cb.checked = isIdling;
        cb.disabled = !!(afStatus?.isActive);
        cb.title = afStatus?.isActive ? "Управляется авто-фармом" : "";
      });

      libraryCountEl.textContent = list.length;
      if (isDropsLoaded && filterCardsOnly) {
        globalDropsEl.style.display = 'flex';
        globalDropsEl.innerHTML = `${totalDrops} карточек &middot; ${gamesWithDropsCount} игр`;
      } else {
        globalDropsEl.style.display = 'none';
      }
    };

    const SORT_OPTIONS = [
      { id: 'recent',        label: 'Недавние',      icon: '🕐' },
      { id: 'name_asc',      label: 'A → Z',         icon: '🔤' },
      { id: 'name_desc',     label: 'Z → A',         icon: '🔤' },
      { id: 'playtime_desc', label: 'Время ↓',       icon: '⏱' },
      { id: 'playtime_asc',  label: 'Время ↑',       icon: '⏱' },
    ];

    const sortGames = (list, sort) => {
      const sorted = [...list];
      switch (sort) {
        case 'recent':
          return sorted.sort((a, b) => (b.rtime_last_played ?? 0) - (a.rtime_last_played ?? 0));
        case 'name_asc':
          return sorted.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
        case 'name_desc':
          return sorted.sort((a, b) => b.name.localeCompare(a.name, 'ru', { sensitivity: 'base' }));
        case 'playtime_desc':
          return sorted.sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0));
        case 'playtime_asc':
          return sorted.sort((a, b) => (a.playtime_forever ?? 0) - (b.playtime_forever ?? 0));
        default:
          return sorted;
      }
    };

    window.toggleShowInstalled = () => {
      showInstalled = !showInstalled;
      localStorage.setItem('library_show_installed', showInstalled.toString());
      renderGames(getFilteredGames());
      renderSortBar();
    };

    const renderSortBar = () => {
      sortBar.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            display: inline-flex; align-items: center;
            background: var(--color-bg-surface); border: 1px solid var(--color-border);
            border-radius: var(--radius-sm); overflow: hidden;
          ">
            <span style="
              padding: 0 12px; font-size: 11px; color: var(--color-text-secondary);
              text-transform: uppercase; letter-spacing: 0.08em;
              font-weight: 600; white-space: nowrap;
              border-right: 1px solid var(--color-border);
              height: 32px; display: flex; align-items: center;
            ">Sort</span>
            ${SORT_OPTIONS.map((opt, i) => `
              <button
                onclick="changeLibrarySort('${opt.id}')"
                class="sort-btn ${currentSort === opt.id ? 'sort-btn-active' : ''}"
                style="border-left: ${i > 0 ? '1px solid var(--color-border)' : 'none'};"
              >${opt.label}</button>
            `).join('')}
          </div>
          <div style="width: 1px; height: 24px; background: var(--color-border); opacity: 0.5;"></div>
          <button
            onclick="toggleShowInstalled()"
            class="filter-toggle-cards ${showInstalled ? 'active' : ''}"
            style="height: 32px; padding: 0 12px; font-size: 12px;"
          >
            💾 Установленные
          </button>
        </div>
      `;
    };

    const getFilteredGames = () => {
      let filtered = games;
      if (currentSearchQuery) {
        filtered = filtered.filter(g => g.name.toLowerCase().includes(currentSearchQuery));
      }
      if (filterCardsOnly && isDropsLoaded) {
        const afStatus = store.get('autoFarmStatus');
        const activeBatchIds = new Set((afStatus && afStatus.isActive && afStatus.currentBatch) ? afStatus.currentBatch : []);
        filtered = filtered.filter(g => ((cardDropsData[String(g.appid)] || 0) > 0) || activeBatchIds.has(String(g.appid)));
      }
      let result = sortGames(filtered, currentSort);
      // Only filter by installation if we are NOT in Cards mode
      if (showInstalled && !filterCardsOnly) {
        result = result.filter(g => g.isInstalled);
      }
      return result;
    };

    window.changeLibrarySort = (sort) => {
      currentSort = sort;
      localStorage.setItem('library_sort', sort);
      renderSortBar();
      renderGames(getFilteredGames());
    };

    renderSortBar();
    renderGames(getFilteredGames());

    // Debounced search — 300ms delay
    let searchDebounceTimer = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        currentSearchQuery = e.target.value.toLowerCase();
        renderGames(getFilteredGames());
      }, 300);
    });

    dropsCheckbox.addEventListener('change', (e) => {
      filterCardsOnly = e.target.checked;
      if (filterCardsOnly) {
        filterCardsLabel.classList.add('active');
        // We do not change sorting logic in filter since it already uses getFilteredGames 
      } else {
        filterCardsLabel.classList.remove('active');
      }
      renderAutoFarmState(); 
      renderGames(getFilteredGames());
      updateInlinePanels();
    });
    
    autoFarmBtn.addEventListener('click', () => {
       const status = store.get('autoFarmStatus');
       
       if (status && status.isActive) {
          autoFarm.pause();
       } else if (status && status.phase) {
          autoFarm.resume();
       } else {
          autoFarm.start(games, cardDropsData);
       }
    });

    grid.addEventListener('click', async (e) => {
      // Ignore clicks on checkbox area
      if (e.target.closest('.switch-control') || e.target.classList.contains('idle-checkbox')) {
        return;
      }
      
      if (e.target.classList.contains('play-btn') || e.target.closest('.play-btn')) {
        const appId = e.target.closest('.play-btn').getAttribute('data-appid');
        if (window.electronAuth && window.electronAuth.setRunningGame) {
          await window.electronAuth.setRunningGame({ appId: appId, pid: null });
        }
        window.location.href = `steam://run/${appId}`;
        store.set('runningAppId', appId);
        return;
      }

      if (e.target.classList.contains('btn-install') || e.target.closest('.btn-install')) {
        const appId = e.target.closest('.btn-install').getAttribute('data-appid');
        window.open(`steam://install/${appId}`, '_self');
        return;
      }
      
      const card = e.target.closest('.game-card');
      if (card && !e.target.closest('.actions-right')) {
        const appId = card.getAttribute('data-appid');
        router.navigate(`/game/${appId}`);
      }
    });

    grid.addEventListener('change', async (e) => {
      if (e.target.classList.contains('idle-checkbox')) {
        const appId = e.target.getAttribute('data-appid');
        const isChecked = e.target.checked;
        const card = e.target.closest('.game-card');

        if (isChecked) {
          const res = await window.electronAuth.idleStart(appId);
          if (res && res.success) {
            activeIdles.add(appId.toString());
            card.classList.add('state-idle');
            store.set('runningAppId', appId);
          } else {
            e.target.checked = false;
            alert('Failed to start idle: ' + (res?.error || 'Unknown error.'));
          }
        } else {
          const res = await window.electronAuth.idleStop(appId);
          if (res && res.success) {
            activeIdles.delete(appId.toString());
            card.classList.remove('state-idle');
            if (String(store.get('runningAppId')) === String(appId)) {
              store.set('runningAppId', null);
            }
          }
        }
        updateStopAllButtonVisibility();
      }
    });

    stopAllBtn.addEventListener('click', async () => {
      const res = await window.electronAuth.idleStopAll();
      if (res && res.success) {
        activeIdles.clear();
        store.set('runningAppId', null);
        const checkboxes = container.querySelectorAll('.idle-checkbox');
        checkboxes.forEach(cb => { cb.checked = false; });
        const cards = container.querySelectorAll('.game-card');
        cards.forEach(card => card.classList.remove('state-idle', 'state-warmup', 'state-warmup-queue', 'state-farm-active', 'state-farm-queue'));
        updateStopAllButtonVisibility();
      }
    });

    setTimeout(() => renderAutoFarmState(), 0);

    // ── Recent Games Shelf ─────────────────────────────────
    const recentShelfEl = container.querySelector('#recent-shelf');

    const formatPlaytime = (g) => {
      if (g.playtime2wks > 0) return `${(g.playtime2wks / 60).toFixed(1)} ч/2нед`;
      if (g.playtime > 0)     return `${(g.playtime / 60).toFixed(1)} ч всего`;
      return '';
    };

    const groupByDate = (games) => {
      const now = Math.floor(Date.now() / 1000);
      const groups = [
        { label: 'Сегодня',        games: games.filter(g => now - g.lastPlayed < 86400) },
        { label: 'Вчера',          games: games.filter(g => now - g.lastPlayed >= 86400  && now - g.lastPlayed < 172800) },
        { label: 'На этой неделе', games: games.filter(g => now - g.lastPlayed >= 172800 && now - g.lastPlayed < 604800) },
        { label: 'Ранее',          games: games.filter(g => now - g.lastPlayed >= 604800) },
      ];
      return groups.filter(gr => gr.games.length > 0);
    };

    const renderRecentShelf = (games) => {
      const isVisible = localStorage.getItem('shelf_recent_visible') !== 'false';
      recentShelfEl.innerHTML = '';

      if (!games || games.length === 0) {
        recentShelfEl.style.display = 'none';
        return;
      }

      recentShelfEl.style.display = 'block';

      // Header row
      const header = document.createElement('div');
      header.className = 'shelf-header';
      header.innerHTML = `
        <button class="shelf-title-btn" id="shelf-title-btn">
          Недавние игры
          <span class="shelf-chevron">${isVisible ? '▾' : '▸'}</span>
        </button>
        <div class="shelf-nav" id="shelf-nav" style="display: ${isVisible ? 'flex' : 'none'}">
          <button class="shelf-arrow" id="shelf-prev">&#8592;</button>
          <button class="shelf-arrow" id="shelf-next">&#8594;</button>
        </div>
      `;
      recentShelfEl.appendChild(header);

      // Body — collapsible
      const body = document.createElement('div');
      body.className = 'shelf-body';
      body.style.display = isVisible ? 'block' : 'none';

      // Single horizontal scrollable container
      const container = document.createElement('div');
      container.className = 'shelf-container';
      container.id = 'shelf-container';

      // Build groups, then lay them out inline inside container
      const groups = groupByDate(games);
      groups.forEach(gr => {
        const groupEl = document.createElement('div');
        groupEl.className = 'date-group';

        const labelEl = document.createElement('span');
        labelEl.className = 'date-label';
        labelEl.textContent = gr.label;
        groupEl.appendChild(labelEl);

        const cardsRow = document.createElement('div');
        cardsRow.className = 'date-group-cards';

        gr.games.forEach(game => {
          const pt   = formatPlaytime(game);
          const card = document.createElement('div');
          card.className = 'shelf-card';
          card.dataset.appid = game.appId;
          card.innerHTML = `
            <div class="skeleton-cover shelf-card-img-wrapper" style="width: 120px; height: 180px; display: block; overflow: hidden; border-radius: 6px;">
              <img src="${game.coverUrl}" alt="" loading="lazy"
                style="opacity: 0; transition: opacity 250ms ease; width: 100%; height: 100%; object-fit: cover; display: block;"
                onload="this.style.opacity='1'; this.parentElement.classList.remove('skeleton-cover');"
                onerror="const self = this; self.onerror = null; window.electronAuth.steamGetCoverUrl('${game.appId}').then(url => { if (url) self.src = url; else self.src = 'https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg'; self.style.opacity='1'; }).catch(() => { self.style.display = 'none'; self.parentElement.classList.remove('skeleton-cover'); });">
            </div>
            <div class="play-overlay">
              <div class="play-btn-circle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            ${game.isNew ? '<div class="new-badge">НОВОЕ У ВАС</div>' : ''}
            ${pt ? `<div class="shelf-card-meta">${pt}</div>` : ''}
          `;
          card.addEventListener('click', () => {
            router.navigate(`/game/${game.appId}`);
          });
          cardsRow.appendChild(card);
        });

        groupEl.appendChild(cardsRow);
        container.appendChild(groupEl);
      });

      body.appendChild(container);
      recentShelfEl.appendChild(body);

      const divider = document.createElement('div');
      divider.className = 'shelf-divider';
      recentShelfEl.appendChild(divider);

      // Toggle visibility
      const titleBtn = recentShelfEl.querySelector('#shelf-title-btn');
      const shelfNav = recentShelfEl.querySelector('#shelf-nav');
      const chevron  = recentShelfEl.querySelector('.shelf-chevron');
      titleBtn.addEventListener('click', () => {
        const nowVisible = body.style.display !== 'none';
        body.style.display     = nowVisible ? 'none' : 'block';
        shelfNav.style.display = nowVisible ? 'none' : 'flex';
        chevron.textContent    = nowVisible ? '▸' : '▾';
        localStorage.setItem('shelf_recent_visible', String(!nowVisible));
      });

      // Scroll arrows — one container to scroll
      const shelfContainer = recentShelfEl.querySelector('#shelf-container');
      const updateArrows = () => {
        const prevBtn = recentShelfEl.querySelector('#shelf-prev');
        const nextBtn = recentShelfEl.querySelector('#shelf-next');
        if (prevBtn) prevBtn.style.opacity = shelfContainer.scrollLeft > 0 ? '1' : '0.25';
        if (nextBtn) nextBtn.style.opacity =
          shelfContainer.scrollLeft < shelfContainer.scrollWidth - shelfContainer.clientWidth - 1
          ? '1' : '0.25';
      };

      recentShelfEl.querySelector('#shelf-next')?.addEventListener('click', () => {
        shelfContainer.scrollBy({ left: 500, behavior: 'smooth' });
        setTimeout(updateArrows, 350);
      });
      recentShelfEl.querySelector('#shelf-prev')?.addEventListener('click', () => {
        shelfContainer.scrollBy({ left: -500, behavior: 'smooth' });
        setTimeout(updateArrows, 350);
      });
      shelfContainer.addEventListener('scroll', updateArrows, { passive: true });
      setTimeout(updateArrows, 50);
    };


    const loadRecentShelf = async () => {
      try {
        if (window.electronAuth && window.electronAuth.getRecentGames) {
          const games = await window.electronAuth.getRecentGames();
          renderRecentShelf(games);
        }
      } catch (e) {
        console.warn('Recent shelf load failed:', e);
        recentShelfEl.style.display = 'none';
      }
    };

    loadRecentShelf();

    // Listen for live updates from main (fs.watch)
    if (window.electronAuth && window.electronAuth.onRecentGamesUpdated) {
      window.electronAuth.onRecentGamesUpdated(loadRecentShelf);
    }
    // ── End Recent Games Shelf ─────────────────────────────

    // Handle scroll-to-status when navigating from navbar indicator
    setTimeout(() => {
      if (store.get('farmScrollToStatus')) {
        store.set('farmScrollToStatus', false);
        const bar = container.querySelector('#auto-farm-status-bar');
        if (bar && bar.style.display !== 'none') {
          bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          bar.classList.add('status-flash');
          setTimeout(() => bar.classList.remove('status-flash'), 1200);
        }
      }
    }, 100);

  } catch (err) {
    container.innerHTML = `<div class="error">Failed to load library: ${err.message}</div>`;
  }

  const style = document.createElement('style');
  style.textContent = `
    .library-page { 
      padding: 0 40px; 
      max-width: 1400px; 
      margin: 0 auto;
      color: var(--color-text-primary);
    }
    
    .inline-action-btn {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      background: var(--color-bg-surface-light);
      color: var(--color-text-secondary);
      cursor: pointer;
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity var(--transition-fast);
      padding: 0;
    }
    .inline-action-btn:hover {
      opacity: 0.8;
    }
    .sort-btn {
      padding: 0 14px;
      height: 32px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      background: transparent;
      color: var(--color-text-secondary);
      white-space: nowrap;
      transition: background var(--transition-fast), color var(--transition-fast);
    }
    .sort-btn:hover {
      color: var(--color-text-primary);
      background: var(--color-bg-hover);
    }
    .sort-btn-active {
      background: rgba(34, 197, 94, 0.15) !important;
      color: var(--color-accent-green) !important;
    }
    .inline-panel-container {
      margin-bottom: 16px;
      padding: 16px;
      background: var(--color-bg-surface-light);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }
    
    .library-header { 
      display: flex; 
      flex-direction: column; 
      margin-bottom: 24px; 
      padding-top: 24px;
    }
    .header-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
    }
    .title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .title-group h2 { 
      margin: 0; 
      font-size: 20px; 
      font-weight: 600; 
      color: var(--color-text-primary); 
    }
    .title-dot {
      color: var(--color-text-secondary);
      font-size: 20px;
    }
    .title-count {
      font-size: 20px;
      font-weight: 400;
      color: var(--color-text-secondary);
    }
    .search-input { 
      padding: 8px 12px; 
      border-radius: var(--radius-sm); 
      border: 1px solid var(--color-border); 
      background: var(--color-bg-surface-light); 
      color: var(--color-text-primary); 
      font-family: inherit; 
      outline: none; 
      width: 240px;
      box-shadow: none;
      transition: border-color var(--transition-fast);
    }
    .search-input:focus { border-color: var(--color-text-secondary); }
    
    .header-divider {
      height: 1px;
      background: var(--color-border);
      opacity: 0.5;
      width: 100%;
    }
    
    .filters-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-top: 16px;
    }
    .filter-toggle-cards {
      display: inline-flex;
      align-items: center;
      background: var(--color-bg-surface-light);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      padding: 6px 14px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      cursor: pointer;
      transition: all var(--transition-fast);
      user-select: none;
    }
    .filter-toggle-cards:hover {
      border-color: var(--color-hover-border);
    }
    .filter-toggle-cards.active {
      background: rgba(34, 197, 94, 0.15);
      border-color: var(--color-accent-green);
      color: #4ade80;
    }
    .filter-toggle-cards.active:hover {
      border-color: #4ade80;
    }
    
    .auto-farm-btn-round {
      display: inline-flex; 
      align-items: center; 
      justify-content: center;
      width: 36px; height: 36px;
      flex-shrink: 0;
      padding: 0;
      border-radius: 50%; 
      background: rgba(34, 197, 94, 0.15); 
      color: var(--color-accent-green); 
      border: none; 
      cursor: pointer; 
      transition: transform var(--transition-fast), background var(--transition-fast); 
    }
    .auto-farm-btn-round:hover { 
      background: #1a6b35; 
      transform: scale(1.05);
    }
    .auto-farm-btn-round svg {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }
    .auto-farm-btn-round.active {
      animation: pulseBtnOpacity 2.5s infinite running;
    }
    @keyframes pulseBtnOpacity {
      0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
      100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }
    
    .global-drops-count {
      font-size: 12px;
      color: var(--color-text-secondary);
      display: flex;
      align-items: center;
    }

    .stop-all-btn { 
      padding: 6px 12px; 
      border-radius: var(--radius-sm); 
      border: 1px solid rgba(239, 68, 68, 0.2); 
      background: transparent; 
      color: var(--color-danger); 
      cursor: pointer; 
      transition: all var(--transition-fast); 
      font-size: 13px; 
      margin-left: auto;
    }
    .stop-all-btn:hover { background: rgba(239, 83, 80, 0.1); border-color: var(--color-danger); }

    .games-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); 
      gap: 8px; 
      padding: 16px 0;
    }

    .game-card { 
      background: var(--color-bg-surface-light); 
      border: 1px solid var(--color-border); 
      border-radius: var(--radius-md); 
      padding: 12px; 
      display: flex; 
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      cursor: pointer;
      transition: transform var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast);
      animation: cardLoad 150ms ease forwards;
      opacity: 0;
    }
    @keyframes cardLoad {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .game-card:hover { 
      background: var(--color-bg-hover); 
      border-color: var(--color-hover-border);
      box-shadow: var(--shadow-card);
    }
    
    .game-card.state-idle {
      border-color: var(--color-text-secondary);
    }
    .game-card.state-farm-active {
      border-color: var(--color-accent-green);
      opacity: 1;
    }
    .game-card.state-farm-queue {
      border-color: var(--color-border);
      opacity: 0.6;
    }
    .game-card.state-warmup {
      border-color: var(--color-warning);
    }
    .card-badge.af-farming {
      background: rgba(34, 197, 94, 0.15); color: var(--color-accent-green);
    }
    .card-badge.af-farm-queue {
      background: var(--color-bg-elevated); color: var(--color-text-secondary);
    }
    .card-badge.af-warmup {
      background: rgba(245, 158, 11, 0.15); color: var(--color-warning);
    }

    
    .game-card-top {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .game-icon { 
      width: 48px; 
      height: 48px; 
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      object-fit: cover; 
    }
    
    .game-card-title-group { 
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    
    .game-card-title-group h3 { 
      margin: 0; 
      font-size: 13px; 
      font-weight: 600; 
      color: var(--color-text-primary);
      white-space: nowrap; 
      overflow: hidden; 
      text-overflow: ellipsis; 
    }
    
    .game-card-title-group p { 
      margin: 0; 
      font-size: 11px; 
      color: var(--color-text-secondary); 
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .game-card-status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .badges-container {
      display: flex;
      gap: 4px;
      min-height: 20px;
      align-items: center;
    }

    .card-badge { 
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--color-bg-surface-light); 
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary); 
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px; 
      border-radius: var(--radius-sm); 
      letter-spacing: 0.5px;
      animation: badgePopup 120ms ease forwards;
    }
    
    @keyframes badgePopup {
      from { opacity: 0; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1); }
    }

    .play-btn, .btn-install { 
      width: 100%;
      padding: 6px 0; 
      font-size: 12px; 
      border-radius: var(--radius-sm);
      background: var(--color-bg-elevated); 
      border: 1px solid var(--color-border); 
      color: var(--color-text-secondary); 
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    .play-btn:hover, .btn-install:hover { 
      background: var(--color-text-primary); 
      color: var(--color-bg-base); 
    }

    /* Idle Switch */
    .idle-switch { 
      display: flex; 
      align-items: center; 
      gap: 6px; 
      cursor: pointer; 
    }
    .switch-control {
      position: relative;
      width: 28px;
      height: 16px;
      background: var(--color-bg-elevated);
      border-radius: 8px;
      transition: background var(--transition-fast);
    }
    .switch-control input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }
    .switch-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
      transition: transform 200ms ease;
    }
    .switch-control:has(input:checked) .switch-thumb {
      transform: translateX(12px);
    }
    .switch-control:has(input:checked) {
      background: var(--color-accent-green);
    }
    .switch-control:has(input:disabled) {
      opacity: 0.3;
      cursor: not-allowed;
    }
    
    /* Auto Farm Bar */
    .auto-farm-status-bar {
      background: rgba(34, 197, 94, 0.05);
      border: 1px solid rgba(34, 197, 94, 0.15);
      border-radius: var(--radius-md);
      font-size: 12px;
      color: var(--color-text-secondary);
      display: flex; 
      flex-direction: column;
      gap: 0;
      padding: 0;
      margin-bottom: 12px;
      animation: slideDown 200ms ease forwards;
      overflow: hidden;
    }
    .auto-farm-status-bar.bar-simultaneous,
    .auto-farm-status-bar.bar-warmup {
      background: rgba(245, 158, 11, 0.05);
      border-color: rgba(245, 158, 11, 0.15);
    }
    .auto-farm-status-bar.bar-sequential,
    .auto-farm-status-bar.bar-farm {
      background: rgba(34, 197, 94, 0.05);
      border-color: rgba(34, 197, 94, 0.15);
    }
    .auto-farm-status-bar.bar-mixed {
      background: rgba(202, 138, 4, 0.05);
      border-color: rgba(202, 138, 4, 0.15);
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .auto-farm-status-bar.status-flash {
      animation: statusFlash 1.2s ease;
    }
    @keyframes statusFlash {
      0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
      30% { box-shadow: 0 0 12px 4px rgba(74, 222, 128, 0.3); }
      100% { box-shadow: none; }
    }
    
    .status-phase-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      font-size: 12px;
    }
    .status-phase-row.warmup-row {
      color: #fbbf24;
    }
    .status-phase-row.farm-row {
      color: #4ade80;
    }
    .status-phase-row + .status-phase-row {
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    
    .phase-pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: var(--radius-sm);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .pill-warmup {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .pill-farm {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .pill-paused {
      background: rgba(255, 255, 255, 0.08);
      color: #888;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .status-sep {
      color: rgba(255,255,255,0.15);
    }
    .status-icon {
      font-size: 14px;
    }
    .farm-game-name {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status-item { display: flex; align-items: center; }
    
    .game-card.state-warmup {
      background: rgba(245, 158, 11, 0.05);
      border-color: var(--color-warning);
    }
    .game-card.state-warmup-queue {
      background: var(--color-bg-surface-light);
      border-color: var(--color-border);
    }
    
    .game-card.state-farm-active {
      background: rgba(34, 197, 94, 0.05);
      border-color: var(--color-accent-green);
      animation: cardPulse 2.5s infinite;
    }
    @keyframes cardPulse {
      0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.3); }
      70% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
      100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }
    .game-card.state-farm-queue {
      background: var(--color-bg-surface-light);
      border-color: var(--color-border);
    }
    
    /* Badge variants */
    .card-badge.af-warmup { 
      background: rgba(245, 158, 11, 0.15);
      border-color: transparent;
      color: var(--color-warning);
    }
    .card-badge.af-warmup-queue { 
      background: var(--color-bg-elevated);
      border-color: transparent;
      color: var(--color-text-secondary);
    }
    .card-badge.af-farming { 
      background: rgba(34, 197, 94, 0.15);
      border-color: transparent;
      color: var(--color-accent-green);
    }
    .card-badge.af-farm-queue { 
      background: var(--color-bg-elevated);
      border-color: transparent;
      color: var(--color-text-secondary);
    }

    /* ── Recent Games Shelf ─────────────────────────── */
    .recent-shelf {
      margin-bottom: 8px;
    }
    .shelf-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .shelf-title-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      color: var(--color-text-secondary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      padding: 4px 0;
      font-family: inherit;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      transition: color var(--transition-fast);
      user-select: none;
    }
    .shelf-title-btn:hover { color: var(--color-text-primary); }
    .shelf-chevron {
      font-size: 11px;
      opacity: 0.6;
    }
    .shelf-nav {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .shelf-arrow {
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
      padding: 0;
    }
    .shelf-arrow:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
    .shelf-divider {
      height: 1px;
      background: var(--color-border);
      opacity: 0.5;
      margin: 12px 0 16px;
    }
    .shelf-container {
      display: flex;
      align-items: flex-end;
      gap: 0;
      overflow-x: auto;
      overflow-y: visible;
      scrollbar-width: none;
      -ms-overflow-style: none;
      scroll-behavior: smooth;
      padding-bottom: 4px;
    }
    .shelf-container::-webkit-scrollbar { display: none; }
    .date-group {
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      margin-right: 24px;
    }
    .date-label {
      font-size: 10px;
      font-weight: 500;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .date-group-cards {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
    }
    .shelf-card {
      width: 120px;
      flex-shrink: 0;
      border-radius: 6px;
      overflow: visible;
      cursor: pointer;
      position: relative;
      transition: transform 150ms ease;
    }
    .shelf-card:hover { transform: scale(1.03); }
    .shelf-card img {
      width: 120px;
      height: 180px;
      object-fit: cover;
      display: block;
      border-radius: 6px;
    }
    .shelf-card-meta {
      margin-top: 5px;
      font-size: 10px;
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .new-badge {
      position: absolute;
      top: 8px;
      right: 0;
      background: #1a44c4;
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      padding: 3px 7px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border-radius: 3px 0 0 3px;
      pointer-events: none;
    }
    .play-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 150ms ease;
      border-radius: 6px;
    }
    .shelf-card:hover .play-overlay { opacity: 1; }
    .play-btn-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-accent-green);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 12px rgba(34,197,94,0.4);
    }
    /* ── End Recent Games Shelf ─────────────────────── */
  `;
  container.appendChild(style);

  return container;
}

// ── Key Activation Modal ──────────────────────────────────────────────────────

function showActivateKeyModal() {
  document.getElementById('activate-key-modal')?.remove()

  const modal = document.createElement('div')
  modal.id = 'activate-key-modal'
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center;
  `

  modal.onclick = (e) => {
    if (e.target === modal) closeActivateModal()
  }

  modal.innerHTML = `
    <div style="
      background: #111; border: 1px solid #1e1e1e;
      border-radius: 14px; padding: 28px; width: 440px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    " onclick="event.stopPropagation()">

      <div style="display:flex;align-items:center;justify-content:space-between;
                  margin-bottom:20px;">
        <div style="font-size:18px;font-weight:700;color:#f5f5f5;">
          🔑 Активация игры
        </div>
        <button onclick="closeActivateModal()" style="
          background:none;border:none;color:#555;
          font-size:20px;cursor:pointer;padding:0 4px;
        ">×</button>
      </div>

      <div style="font-size:13px;color:#555;margin-bottom:16px;">
        Введите ключ активации Steam в формате XXXXX-XXXXX-XXXXX
      </div>

      <input
        id="activation-key-input"
        type="text"
        placeholder="XXXXX-XXXXX-XXXXX"
        maxlength="17"
        autocomplete="off"
        spellcheck="false"
        style="
          width: 100%; padding: 13px 16px; border-radius: 8px;
          border: 1px solid #1e1e1e; background: #0a0a0a;
          color: #f5f5f5; font-size: 16px; letter-spacing: 2px;
          box-sizing: border-box; text-transform: uppercase;
          font-family: monospace; text-align: center;
          outline: none;
        "
        oninput="formatKeyInput(this)"
        onkeydown="if(event.key==='Enter') submitActivateKey()"
        onfocus="this.style.borderColor='#333'"
        onblur="this.style.borderColor='#1e1e1e'"
      >

      <div id="activate-result" style="
        margin-top: 14px; min-height: 22px;
        font-size: 13px; text-align: center;
        transition: opacity 0.3s;
      "></div>

      <div style="display:flex;gap:10px;margin-top:20px;">
        <button onclick="closeActivateModal()" style="
          flex: 1; padding: 11px; border-radius: 8px; cursor: pointer;
          border: 1px solid #1e1e1e; background: #111;
          color: #555; font-size: 13px;
        ">Отмена</button>

        <button onclick="submitActivateKey()" id="activate-btn" style="
          flex: 2; padding: 11px; border-radius: 8px; cursor: pointer;
          border: 1px solid #22c55e; background: #16532b;
          color: #22c55e; font-size: 14px; font-weight: 600;
        ">Активировать</button>
      </div>
    </div>
  `

  document.body.appendChild(modal)
  setTimeout(() => document.getElementById('activation-key-input')?.focus(), 50)
}

function formatKeyInput(input) {
  const raw   = input.value.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  const parts = []
  for (let i = 0; i < raw.length && i < 15; i += 5) {
    parts.push(raw.slice(i, i + 5))
  }
  input.value = parts.join('-')
}

async function submitActivateKey() {
  const keyInput = document.getElementById('activation-key-input')
  const key      = keyInput?.value?.trim()

  if (!key || key.replace(/-/g, '').length < 5) return

  const btn      = document.getElementById('activate-btn')
  const resultEl = document.getElementById('activate-result')

  btn.disabled          = true
  btn.textContent       = 'Активирую...'
  resultEl.style.color  = '#555'
  resultEl.textContent  = 'Отправляю запрос к Steam...'

  const res = await window.electronAuth.steamRedeemKey({ key })

  if (res.error) {
    resultEl.style.color = '#f87171'
    resultEl.textContent = `Ошибка: ${res.error}`
  } else if (res.success) {
    resultEl.style.color = '#22c55e'
    resultEl.textContent = res.gameName
      ? `✓ "${res.gameName}" добавлена в библиотеку!`
      : '✓ Игра успешно активирована!'
    keyInput.value = ''
    setTimeout(closeActivateModal, 2500)
  } else {
    resultEl.style.color = '#f87171'
    resultEl.textContent = res.msg ?? 'Неизвестная ошибка'
  }

  btn.disabled    = false
  btn.textContent = 'Активировать'
}

function closeActivateModal() {
  const modal = document.getElementById('activate-key-modal')
  if (modal) {
    modal.style.opacity    = '0'
    modal.style.transition = 'opacity 0.2s'
    setTimeout(() => modal.remove(), 200)
  }
}

window.showActivateKeyModal = showActivateKeyModal
window.closeActivateModal   = closeActivateModal
window.submitActivateKey    = submitActivateKey
window.formatKeyInput       = formatKeyInput
