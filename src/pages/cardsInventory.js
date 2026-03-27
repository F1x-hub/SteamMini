import store from '../store/index.js';

// ── Module-level state (persists across re-renders) ──────────────────────────
let selectMode        = false;
let selected          = new Set();
let listingSelectMode = false;
let selectedListings  = new Set();

// Event delegation — регистрируется один раз на весь модуль
document.addEventListener('click', (e) => {
  if (e.target.closest('#select-mode-btn') && typeof window.handleSelectModeClick === 'function') {
    window.handleSelectModeClick();
  }
});

export async function renderCardsInventory() {
  const container = document.createElement('div');
  container.className = 'page-container cards-inventory-page';

  container.innerHTML = `
    <div class="cards-header">
      <div class="title-group">
        <h2>Торговые карточки · <span id="cards-count">...</span> шт.</h2>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px;">
        <button id="select-mode-btn" class="btn-outline">☑ Выбрать для продажи</button>
        <button id="refresh-cards-btn" class="refresh-btn">Обновить</button>
      </div>
    </div>
    
    <div id="tabs-container" class="tabs-container">
      <button id="tab-inventory" class="card-tab active">📦 Инвентарь</button>
      <button id="tab-listings" class="card-tab">🏪 Мои лоты</button>
      <button id="tab-history" class="card-tab">📋 История</button>
    </div>

    <div id="main-content-area">
      <div id="selection-panel" style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;"></div>
      <div id="price-summary"></div>
      <div id="sell-config-panel" style="display: none; padding: 16px; background: #111; border: 1px solid #1e1e1e; border-radius: 10px; margin-bottom: 16px; align-items: center; gap: 12px; flex-wrap: wrap;"></div>
      <div id="sell-progress-panel" style="display: none; padding: 12px 16px; background: #111; border: 1px solid #1e1e1e; border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: #555;"></div>
      <div id="sell-results-panel" style="display: none; margin-bottom: 16px; padding: 16px; background: #111; border: 1px solid #1e1e1e; border-radius: 10px;"></div>

      <div id="inventory-view">
        <div id="inventory-controls" style="margin-bottom: 12px;"></div>
        <div class="search-container" style="margin-bottom: 12px;">
          <input type="text" id="cards-search" class="search-input" placeholder="Поиск по названию или игре..." />
        </div>
        <div id="cards-content" class="cards-content">
          <div class="loading-state">Загрузка карточек...</div>
        </div>
      </div>
      
      <div id="listings-view" style="display: none;"></div>
      <div id="history-view" style="display: none;"></div>
    </div>
  `;

  // Scoped styles
  const style = document.createElement('style');
  style.textContent = `
    .cards-inventory-page {
      padding: 24px 40px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .tabs-container {
      display: flex;
      gap: 4px;
      margin-bottom: 20px;
      background: var(--color-bg-base);
      padding: 4px;
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      width: fit-content;
    }

    .card-tab {
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      border: none;
      background: transparent;
      color: var(--color-text-secondary);
      font-weight: 500;
      font-size: 13px;
      cursor: pointer;
      transition: all var(--transition-fast);
      position: relative;
    }
    .card-tab:hover {
      color: var(--color-text-primary);
      background: var(--color-bg-hover);
    }
    .card-tab.active {
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
      font-weight: 600;
    }


    .btn-outline {
      padding: 7px 14px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 1px solid var(--color-border);
      background: var(--color-bg-surface);
      color: var(--color-text-secondary);
      font-size: 12px;
      transition: all var(--transition-fast);
    }
    .btn-outline:hover {
      background: var(--color-bg-hover);
      color: var(--color-text-primary);
    }

    .cards-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .title-group h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .refresh-btn {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      padding: 6px 16px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 13px;
      transition: all var(--transition-fast);
    }
    .refresh-btn:hover {
      background: var(--color-bg-hover);
      border-color: var(--color-border);
    }

    .search-container {
      margin-bottom: 12px;
    }
    .search-input {
      width: 100%;
      max-width: 400px;
      padding: 10px 14px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      color: var(--color-text-primary);
      font-family: inherit;
      outline: none;
      transition: border-color var(--transition-fast);
    }
    .search-input:focus {
      border-color: var(--color-text-secondary);
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: 16px;
    }

    .card-item {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      cursor: pointer;
      transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
    }
    .card-item:hover {
      transform: translateY(-2px);
      border-color: var(--color-text-secondary);
      box-shadow: var(--shadow-card);
    }

    .card-item.selected {
      border-color: var(--color-accent-green);
      background: rgba(34, 197, 94, 0.05); /* very light green tint */
    }

    .card-checkbox {
      position: absolute;
      top: 6px;
      left: 6px;
      width: 16px;
      height: 16px;
      border-radius: 4px;
      border: 2px solid var(--color-text-secondary);
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: var(--color-bg-base);
      font-weight: 700;
      pointer-events: none;
    }
    .card-item.selected .card-checkbox {
      border-color: var(--color-accent-green);
      background: var(--color-accent-green);
    }

    .card-icon {
      width: 80px;
      height: 80px;
      object-fit: contain;
      margin-bottom: 8px;
    }

    .card-info {
      width: 100%;
      text-align: center;
    }

    .card-name {
      font-size: 10px;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }

    .card-game {
      font-size: 9px;
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-badge-amount {
      position: absolute;
      top: -6px;
      right: -6px;
      background: var(--color-accent-green);
      color: #000;
      font-size: 10px;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }

    .card-badge-untradable {
      position: absolute;
      top: -4px;
      left: -4px;
      background: var(--color-danger);
      color: #fff;
      font-size: 10px;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }
    .card-item.selected .card-badge-untradable {
        top: -4px;
        right: auto;
        left: unset;
        right: -4px;
    }

    .empty-state, .loading-state, .error-state {
      text-align: center;
      padding: 40px;
      color: var(--color-text-secondary);
      font-size: 14px;
      background: var(--color-bg-surface);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-sm);
    }
    .error-state {
      color: var(--color-danger);
      border-color: var(--color-danger);
    }
  `;
  container.appendChild(style);

  // Logic bindings
  const contentEl = container.querySelector('#cards-content');
  const countEl = container.querySelector('#cards-count');
  const searchInput = container.querySelector('#cards-search');
  const refreshBtn = container.querySelector('#refresh-cards-btn');
  
  const selectionPanel = container.querySelector('#selection-panel');
  const sellConfigPanel = container.querySelector('#sell-config-panel');
  const sellProgressPanel = container.querySelector('#sell-progress-panel');
  const sellResultsPanel = container.querySelector('#sell-results-panel');
  const inventoryView = container.querySelector('#inventory-view');
  const listingsView = container.querySelector('#listings-view');
  const tabInventory = container.querySelector('#tab-inventory');
  const tabListings = container.querySelector('#tab-listings');
  const tabHistory = container.querySelector('#tab-history');

  const SORT_OPTIONS = [
    { id: 'default',    label: 'По умолчанию' },
    { id: 'price_asc',  label: 'Цена ↑'       },
    { id: 'price_desc', label: 'Цена ↓'       },
    { id: 'game',       label: 'По игре'       },
    { id: 'name',       label: 'По названию'   },
  ];

  let currentSort = 'default';

  function sortCards(cards, sort) {
    const sorted = [...cards];
    switch (sort) {
      case 'price_asc':
        return sorted.sort((a, b) => {
          const pa = priceCache[a.marketHashName]?.lowestPriceCents ?? 0;
          const pb = priceCache[b.marketHashName]?.lowestPriceCents ?? 0;
          return pa - pb;
        });
      case 'price_desc':
        return sorted.sort((a, b) => {
          const pa = priceCache[a.marketHashName]?.lowestPriceCents ?? 0;
          const pb = priceCache[b.marketHashName]?.lowestPriceCents ?? 0;
          return pb - pa;
        });
      case 'game':
        return sorted.sort((a, b) =>
          (a.gameName ?? '').localeCompare(b.gameName ?? ''));
      case 'name':
        return sorted.sort((a, b) =>
          (a.name ?? '').localeCompare(b.name ?? ''));
      default:
        return sorted;
    }
  }

  window.changeSort = (sort) => {
    currentSort = sort;
    updateInventoryControls();
    filterCards();
  };

  const updateInventoryControls = () => {
    const controlsEl = container.querySelector('#inventory-controls');
    if (!controlsEl) return;
    controlsEl.innerHTML = `
      <div style="display:flex; gap:6px; align-items:center; margin-bottom:12px;">
        <span style="color:var(--color-text-secondary); font-size:12px; margin-right:4px;">Сортировка:</span>
        ${SORT_OPTIONS.map(opt => `
          <button onclick="changeSort('${opt.id}')" style="
            padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer; font-size: 11px;
            border:     1px solid ${currentSort === opt.id ? 'var(--color-accent-green)' : 'var(--color-border)'};
            background: ${currentSort === opt.id ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-bg-surface)'};
            color:      ${currentSort === opt.id ? 'var(--color-accent-green)' : 'var(--color-text-secondary)'};
            transition: all var(--transition-fast);
          ">${opt.label}</button>
        `).join('')}
      </div>
    `;
  };

  let activeTab = 'inventory';
  let allCards = [];
  let currentSearchQuery = '';
  
  // selectMode, selected, listingSelectMode, selectedListings — module-level (see top of file)
  let instaSellData = {};
  let offsetCents = -1;
  let selling = false;
  let progress = null;
  let sellResults = null;
  let currentSellResults = null;
  let sellResultStatuses = {}; // { [assetId]: 'pending' | 'confirmed' | 'error' | 'sold' }
  const priceCache = {};
  let currentListingsData = null;

  const updateSelectBtn = () => {
    const btn = container.querySelector('#select-mode-btn');
    if (!btn) return;
    btn.style.display = (activeTab === 'inventory' || activeTab === 'listings') ? 'block' : 'none';
    
    if (activeTab === 'listings') {
      btn.textContent = listingSelectMode ? '✕ Отменить выбор' : '☑ Выбрать для отмены';
      btn.style.borderColor = listingSelectMode ? 'var(--color-warning)' : 'var(--color-border)';
      btn.style.color       = listingSelectMode ? 'var(--color-warning)' : 'var(--color-text-secondary)';
    } else if (activeTab === 'inventory') {
      btn.textContent = selectMode ? '✕ Отменить выбор' : '☑ Выбрать для продажи';
      btn.style.borderColor = selectMode ? 'var(--color-warning)' : 'var(--color-border)';
      btn.style.color       = selectMode ? 'var(--color-warning)' : 'var(--color-text-secondary)';
    }
  };

  const handleSelectModeClick = async () => {
    console.log('[selectMode] BEFORE toggle:', selectMode);

    if (activeTab === 'listings') {
      listingSelectMode = !listingSelectMode;
      selectedListings.clear();
      if (currentListingsData) {
        const tbody = document.getElementById('listings-tbody');
        if (tbody) tbody.innerHTML = renderListingsTable(currentListingsData.listings);
        renderListingsBulkBar();
      }
    } else {
      await toggleSelectMode();
      console.log('[selectMode] AFTER toggle:', selectMode);
    }
    updateSelectBtn();
  };

  window.handleSelectModeClick = handleSelectModeClick;
  console.log('[init] handleSelectModeClick registered:', !!window.handleSelectModeClick);

  async function toggleSelectMode() {
    if (selectMode) {
      selectMode = false;
      selected = new Set();
      const summaryEl = document.getElementById('price-summary');
      if (summaryEl) summaryEl.remove();
      updateUI();
      filterCards();
    } else {
      await activateSelectMode();
    }
  }

  // Обработчик #select-mode-btn регистрируется через document delegation (module level)

  let pendingConfirmation = new Set();
  let confirmationTimer   = null;

  const startConfirmationPolling = (soldAssetIds) => {
    soldAssetIds.forEach(id => pendingConfirmation.add(id));
    if (confirmationTimer) return;

    confirmationTimer = setInterval(async () => {
      if (pendingConfirmation.size === 0) {
        stopConfirmationPolling();
        return;
      }

      console.log('[poll] Checking confirmation for:', [...pendingConfirmation]);

      const auth = store.get('auth');
      if (!auth || !auth.steamId) return;

      const res = await window.electronAuth.inventoryGetCards(auth.steamId, true);
      if (!res || !res.success) return;

      const currentAssetIds = new Set(res.data.map(c => c.assetId));

      for (const assetId of [...pendingConfirmation]) {
        console.log('[poll] Checking assetId:', assetId, '| in inventory:', currentAssetIds.has(assetId));
        
        if (!currentAssetIds.has(assetId)) {
          console.log('[poll] CONFIRMED (item gone from inventory):', assetId);
          pendingConfirmation.delete(assetId);
          updateSellResultStatus(assetId, 'confirmed');
        }
      }

      if (pendingConfirmation.size === 0) {
        stopConfirmationPolling();
        loadCards(); // final reload
      }
    }, 10000);
  };

  const stopConfirmationPolling = () => {
    if (confirmationTimer) {
      clearInterval(confirmationTimer);
      confirmationTimer = null;
    }
  };

  const updateSellResultStatus = (assetId, status) => {
    console.log('[update] Setting status:', assetId, '->', status);
    sellResultStatuses[assetId] = status;
    if (currentSellResults) {
      renderSellResultsTable(currentSellResults);
    }
  };

  const renderSellResultsTable = (results) => {
    currentSellResults = results;
    const tableEl = document.getElementById('sell-results-table');
    if (!tableEl) return;

    tableEl.innerHTML = results.map(r => {
      const status = sellResultStatuses[r.assetId] || r.status;

      const statusHtml = 
        status === 'confirmed'
          ? `<span style="color: var(--color-success); font-weight: 600;">✓ Подтверждено</span>`
        : status === 'pending'
          ? `<span style="color: var(--color-warning);">⏳ Ждёт подтверждения</span>`
        : status === 'sold'
          ? `<span style="color: var(--color-success);">✓ $${(r.soldPriceCents / 100).toFixed(2)}</span>`
          : `<span style="color: var(--color-danger);">✗ ${r.error}</span>`;

      const rowBg = status === 'confirmed' ? 'rgba(34, 197, 94, 0.05)' : 'transparent';

      return `
        <tr data-asset-id="${r.assetId}" style="border-bottom: 1px solid var(--color-border); background: ${rowBg}; transition: background 0.5s ease;">
          <td style="padding: 8px 0; color: var(--color-text-secondary); font-size: 13px;">${r.name}</td>
          <td class="sell-status" style="padding: 8px 0; text-align: right; font-size: 12px;">
            ${statusHtml}
          </td>
        </tr>
      `;
    }).join('');
  };

  let listingsPage      = 0;         // текущая страница (0-based)
  let listingsPerPage   = 10;        // лотов на страницу
  let listingsTotal     = 0;         // всего лотов
  const PER_PAGE_OPTIONS = [10, 25, 50, 100];

  let historyPage = 0;
  let historyPerPage = 25;
  let historyTotal = 0;

  const loadHistory = async (page = 0) => {
    historyPage = page;
    const start = page * historyPerPage;
    const historyView = container.querySelector('#history-view');
    historyView.innerHTML = '<div class="loading-state">Загрузка истории...</div>';

    const res = await window.electronAuth.marketGetHistory({
      start,
      count: historyPerPage
    });

    if (res && res.success) {
      historyTotal = res.total;
      renderHistory(res);
    } else {
      historyView.innerHTML = `<div class="error-state">Ошибка: ${res?.error || 'Неизвестная ошибка'}</div>`;
    }
  };

  const renderHistory = (data) => {
    const historyView = container.querySelector('#history-view');
    historyView.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1 style="color: var(--color-text-primary); font-size: 20px; font-weight: 600; margin: 0;">
          История продаж
          <span style="color: var(--color-text-secondary); font-size: 15px; font-weight: 400;"> · ${data.total} событий</span>
        </h1>
        <button id="refresh-history-btn" class="refresh-btn">Обновить</button>
      </div>
      <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; background: var(--color-bg-base);">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: var(--color-bg-surface); border-bottom: 1px solid var(--color-border);">
              <th style="padding: 12px 16px; text-align: left; color: var(--color-text-secondary); font-weight: 500; width: 40px;"></th>
              <th style="padding: 12px 16px; text-align: left; color: var(--color-text-secondary); font-weight: 500;">Предмет</th>
              <th style="padding: 12px 16px; text-align: left; color: var(--color-text-secondary); font-weight: 500;">Игра</th>
              <th style="padding: 12px 16px; text-align: center; color: var(--color-text-secondary); font-weight: 500;">Дата</th>
              <th style="padding: 12px 16px; text-align: right; color: var(--color-text-secondary); font-weight: 500;">Сумма</th>
            </tr>
          </thead>
          <tbody>
            ${data.events.map((ev, i) => {
              const color = ev.isSale ? 'var(--color-success)' : (ev.isPurchase ? 'var(--color-danger)' : 'var(--color-text-secondary)');
              const iconHtml = ev.iconUrl
                ? `<img src="${ev.iconUrl}" style="width:32px;height:32px;object-fit:contain;border-radius:var(--radius-sm);" onerror="this.style.display='none'">`
                : `<div style="width:32px;height:32px;background:var(--color-bg-surface);border-radius:var(--radius-sm);"></div>`;

              return `
                <tr style="background: ${i % 2 === 0 ? 'var(--color-bg-surface-light)' : 'var(--color-bg-surface)'}; border-bottom: 1px solid var(--color-border); transition: background var(--transition-fast);">
                  <td style="padding: 10px 16px;">
                    ${iconHtml}
                  </td>
                  <td style="padding: 10px 16px;">
                    <div style="color: var(--color-text-primary); font-weight: 500;">${ev.name}</div>
                  </td>
                  <td style="padding: 10px 16px; color: var(--color-text-secondary);">${ev.gameName}</td>
                  <td style="padding: 10px 16px; text-align: center; color: var(--color-text-secondary);">${ev.dateStr}</td>
                  <td style="padding: 10px 16px; text-align: right; color: ${color}; font-weight: 600;">
                    ${ev.amountFmt}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${renderHistoryPagination()}
      </div>
    `;

    historyView.querySelector('#refresh-history-btn').onclick = () => loadHistory(0);
    historyView.querySelectorAll('.page-btn').forEach(btn => {
      btn.onclick = () => {
        const page = parseInt(btn.dataset.page);
        if (!isNaN(page)) loadHistory(page);
      };
    });
  };

  const renderHistoryPagination = () => {
    const totalPages = Math.ceil(historyTotal / historyPerPage);
    if (historyTotal === 0) return '';
    const startNum = historyPage * historyPerPage + 1;
    const endNum = Math.min(startNum + historyPerPage - 1, historyTotal);

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--color-bg-base); border-top: 1px solid var(--color-border);">
        <span style="color: var(--color-text-secondary); font-size: 12px;">
          ${startNum}–${endNum} из ${historyTotal}
        </span>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button class="btn-outline page-btn" data-page="0" ${historyPage === 0 ? 'disabled' : ''}>«</button>
          <button class="btn-outline page-btn" data-page="${historyPage - 1}" ${historyPage === 0 ? 'disabled' : ''}>‹</button>
          ${generatePageButtons(historyPage, totalPages)}
          <button class="btn-outline page-btn" data-page="${historyPage + 1}" ${historyPage >= totalPages - 1 ? 'disabled' : ''}>›</button>
          <button class="btn-outline page-btn" data-page="${totalPages - 1}" ${historyPage >= totalPages - 1 ? 'disabled' : ''}>»</button>
        </div>
      </div>
    `;
  };

  const loadListings = async (page = 0) => {
    listingsPage = page;
    const start = page * listingsPerPage;

    console.log(`[listings] Loading page ${page}, start=${start}, count=${listingsPerPage}`);

    listingsView.innerHTML = '<div class="loading-state">Загрузка лотов...</div>';
    const res = await window.electronAuth.marketGetListings({
      start,
      count: listingsPerPage
    });

    console.log(`[listings] Got ${res.listings?.length ?? 0} listings, total=${res.total ?? 0}`);

    if (res && res.success) {
      listingsTotal = res.total;
      renderListings(res);
    } else {
      listingsView.innerHTML = `<div class="error-state">Ошибка: ${res?.error || 'Неизвестная ошибка'}</div>`;
    }
  };

  const generatePageButtons = (current, total) => {
    const range = 2; // кнопок с каждой стороны от текущей
    const buttons = [];

    for (let i = 0; i < total; i++) {
      const show = i === 0 || i === total - 1 || Math.abs(i - current) <= range;
      if (!show) {
        if (buttons[buttons.length - 1] !== '...') buttons.push('...');
        continue;
      }
      buttons.push(i);
    }

    return buttons.map(b => {
      if (b === '...') return `<span style="padding: 6px 4px; color: var(--color-text-secondary); font-size: 12px;">…</span>`;
      const isActive = b === current;
      return `
        <button
          class="page-btn ${isActive ? 'active' : ''}"
          data-page="${b}"
          style="
            padding: 6px 10px; border-radius: var(--radius-sm); cursor: pointer;
            font-size: 12px; min-width: 32px;
            border:     1px solid ${isActive ? 'var(--color-accent-green)' : 'var(--color-border)'};
            background: ${isActive ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-bg-surface)'};
            color:      ${isActive ? 'var(--color-accent-green)' : 'var(--color-text-secondary)'};
            font-weight: ${isActive ? '600' : '500'};
            transition: all var(--transition-fast);
          "
        >${b + 1}</button>
      `;
    }).join('');
  };

  const renderPaginationControls = () => {
    const totalPages = Math.ceil(listingsTotal / listingsPerPage);
    const currentPage = listingsPage;
    const startNum = currentPage * listingsPerPage + 1;
    const endNum = Math.min(startNum + listingsPerPage - 1, listingsTotal);

    if (listingsTotal === 0) return '';

    return `
      <div style="
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 16px; background: #0a0a0a;
        border-top: 1px solid #1e1e1e;
      ">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="color: #555; font-size: 12px;">Показывать по:</span>
          <div style="display: flex; gap: 4px;">
            ${PER_PAGE_OPTIONS.map(n => `
              <button
                class="per-page-btn ${listingsPerPage === n ? 'active' : ''}"
                data-val="${n}"
                style="
                  padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer;
                  font-size: 12px;
                  border:      1px solid ${listingsPerPage === n ? 'var(--color-accent-green)' : 'var(--color-border)'};
                  background:  ${listingsPerPage === n ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-bg-surface)'};
                  color:       ${listingsPerPage === n ? 'var(--color-accent-green)' : 'var(--color-text-secondary)'};
                  transition: all var(--transition-fast);
                "
              >${n}</button>
            `).join('')}
          </div>
          <span style="color: #555; font-size: 12px;">
            ${startNum}–${endNum} из ${listingsTotal}
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <button class="btn-outline page-btn" data-page="0" ${currentPage === 0 ? 'disabled' : ''}>«</button>
          <button class="btn-outline page-btn" data-page="${currentPage - 1}" ${currentPage === 0 ? 'disabled' : ''}>‹</button>
          ${generatePageButtons(currentPage, totalPages)}
          <button class="btn-outline page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>›</button>
          <button class="btn-outline page-btn" data-page="${totalPages - 1}" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>»</button>
        </div>
      </div>
    `;
  };

  const renderListingsTable = (listings) => {
    return listings.map((l, i) => `
      <tr
        data-listing-id="${l.listingId}"
        onclick="${listingSelectMode ? `window.toggleListingSelect('${l.listingId}')` : ''}"
        style="
          background: ${selectedListings.has(l.listingId) ? 'rgba(34, 197, 94, 0.05)' : (i % 2 === 0 ? 'var(--color-bg-surface-light)' : 'var(--color-bg-surface)')};
          border-bottom: 1px solid var(--color-border);
          cursor: ${listingSelectMode ? 'pointer' : 'default'};
          transition: background var(--transition-fast);
        ">

        <!-- Чекбокс -->
        <td style="padding:10px 12px;width:36px;">
          ${listingSelectMode ? `
            <div style="
              width:18px;height:18px;border-radius:4px;
              border: 2px solid ${selectedListings.has(l.listingId) ? 'var(--color-accent-green)' : 'var(--color-text-secondary)'};
              background: ${selectedListings.has(l.listingId) ? 'var(--color-accent-green)' : 'transparent'};
              display:flex;align-items:center;justify-content:center;
              flex-shrink:0;
            ">
              ${selectedListings.has(l.listingId)
                ? `<span style="color:var(--color-bg-base);font-size:11px;font-weight:800;">✓</span>`
                : ''}
            </div>
          ` : '<div style="width:18px;"></div>'}
        </td>

        <!-- Иконка -->
        <td style="padding:10px 8px;">
          ${l.iconUrl
            ? `<img src="${l.iconUrl}" style="width:40px;height:40px;object-fit:contain;border-radius:4px;" onerror="this.src='https://community.akamai.steamstatic.com/economy/image/96fx96f'">`
            : `<div style="width:40px;height:40px;background:#1e1e1e;border-radius:4px;"></div>`}
        </td>

        <!-- Название -->
        <td style="padding:10px 14px;">
          <div style="color:var(--color-text-primary);font-weight:500;">${l.name}</div>
          <div style="color:var(--color-text-secondary);font-size:11px;">${l.gameName}</div>
        </td>

        <!-- Цены -->
        <td style="padding:10px 14px;text-align:right;color:var(--color-text-primary);font-weight:600;">
          ${l.buyerPrice}
        </td>
        <td style="padding:10px 14px;text-align:right;color:var(--color-success);font-weight:600;">
          ${l.sellerPrice}
        </td>

        <!-- Дата -->
        <td style="padding:10px 14px;text-align:center;color:var(--color-text-secondary);font-size:11px;">
          ${new Date(l.listedOn * 1000).toLocaleDateString('ru-RU')}
        </td>

        <!-- Кнопка одиночной отмены — скрыть в режиме выбора -->
        <td style="padding:10px 14px;text-align:center;">
          ${!listingSelectMode ? `
            <button class="btn-outline" style="color: var(--color-danger); border-color: var(--color-danger);"
              onclick="window.cancelSingleListing('${l.listingId}');event.stopPropagation();">
              Отменить
            </button>
          ` : ''}
        </td>
      </tr>
    `).join('');
  };

  window.toggleListingSelect = (listingId) => {
    if (selectedListings.has(listingId)) {
      selectedListings.delete(listingId);
    } else {
      selectedListings.add(listingId);
    }
    const tbody = document.getElementById('listings-tbody');
    if (tbody) tbody.innerHTML = renderListingsTable(currentListingsData.listings);
    renderListingsBulkBar();
  };

  window.cancelSingleListing = async (id) => {
    const row = document.querySelector(`[data-listing-id="${id}"]`);
    if (row) row.style.opacity = '0.4';
    const res = await window.electronAuth.marketCancelListing({ listingId: id });
    if (res && res.success) {
      if (row) {
        row.style.transition = 'opacity 0.3s';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 300);
      }
    } else {
      if (row) row.style.opacity = '1';
      alert('Ошибка отмены: ' + (res?.error || 'Неизвестная ошибка'));
    }
  };

  const renderListings = (data) => {
    currentListingsData = data;
    listingsView.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1 style="color: var(--color-text-primary); font-size: 20px; font-weight: 600; margin: 0;">
          Активные лоты
          <span style="color: var(--color-text-secondary); font-size: 15px; font-weight: 400;"> · ${data.total} шт.</span>
        </h1>
        <div class="listings-header-actions" style="display: flex; gap: 16px; align-items: center;">
          <span style="font-size: 12px; color: var(--color-text-secondary);">Итого: <span style="color: var(--color-text-primary);">${data.totalBuyer}</span></span>
          <span style="font-size: 12px; color: var(--color-text-secondary);">Вы получите: <span style="color: var(--color-success);">${data.totalSeller}</span></span>
          <button id="refresh-listings-btn" class="refresh-btn">Обновить</button>
        </div>
      </div>
      <div id="listings-table-wrap" style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; background: var(--color-bg-base);">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: var(--color-bg-surface); border-bottom: 1px solid var(--color-border);">
              <th style="padding: 12px 16px; width: 36px;"></th>
              <th style="padding: 12px 16px; text-align: left; color: var(--color-text-secondary); font-weight: 500; width: 40px;"></th>
              <th style="padding: 12px 16px; text-align: left; color: var(--color-text-secondary); font-weight: 500;">Предмет</th>
              <th style="padding: 12px 16px; text-align: right; color: var(--color-text-secondary); font-weight: 500;">Цена покупателя</th>
              <th style="padding: 12px 16px; text-align: right; color: var(--color-text-secondary); font-weight: 500;">Вы получите</th>
              <th style="padding: 12px 16px; text-align: center; color: var(--color-text-secondary); font-weight: 500;">Выставлено</th>
              <th style="padding: 12px 16px; text-align: center; color: var(--color-text-secondary); font-weight: 500;"></th>
            </tr>
          </thead>
          <tbody id="listings-tbody">
            ${renderListingsTable(data.listings)}
          </tbody>
        </table>
        ${renderPaginationControls()}
      </div>
    `;

    renderListingsBulkBar();

    listingsView.querySelector('#refresh-listings-btn').onclick = () => loadListings(0);
    
    listingsView.querySelectorAll('.page-btn').forEach(btn => {
      btn.onclick = () => {
        const page = parseInt(btn.dataset.page);
        if (!isNaN(page)) loadListings(page);
      };
    });

    listingsView.querySelectorAll('.per-page-btn').forEach(btn => {
      btn.onclick = () => {
        const val = parseInt(btn.dataset.val);
        listingsPerPage = val;
        loadListings(0);
      };
    });
  };

  const renderListingsBulkBar = () => {
    let bar = document.getElementById('listings-bulk-bar');

    if (!listingSelectMode) {
      if (bar) bar.remove();
      return;
    }

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'listings-bulk-bar';
      const table = document.getElementById('listings-table-wrap');
      if (table) table.before(bar);
    }

    const total = currentListingsData?.listings?.length ?? 0;
    const count = selectedListings.size;

    bar.innerHTML = `
      <div style="
        display:flex;align-items:center;gap:12px;
        padding:12px 16px;margin-bottom:12px;
        background:var(--color-bg-base);border:1px solid var(--color-border);border-radius:var(--radius-md);
      ">
        <button onclick="window.selectAllListings()" class="btn-outline">
          ${count === total ? 'Снять все' : `Выбрать все (${total})`}
        </button>

        <span style="color:var(--color-text-secondary);font-size:12px;flex:1;">
          ${count > 0
            ? `Выбрано: <span style="color:var(--color-text-primary);font-weight:600;">${count}</span>`
            : 'Нажмите на строку чтобы выбрать'}
        </span>

        ${count > 0 ? `
          <button onclick="window.cancelSelectedListings()" class="btn-outline" style="
            color:var(--color-danger);border-color:var(--color-danger);background:rgba(239, 68, 68, 0.05);
            font-weight:600;
          ">Отменить ${count} лотов</button>
        ` : ''}
      </div>
    `;
  };

  window.selectAllListings = () => {
    const all = currentListingsData?.listings ?? [];
    if (selectedListings.size === all.length) {
      selectedListings.clear();
    } else {
      all.forEach(l => selectedListings.add(l.listingId));
    }
    const tbody = document.getElementById('listings-tbody');
    if (tbody) tbody.innerHTML = renderListingsTable(currentListingsData.listings);
    renderListingsBulkBar();
  };

  window.cancelSelectedListings = async () => {
    const ids = [...selectedListings];
    if (!ids.length) return;

    let done = 0;

    for (const id of ids) {
      const bar = document.getElementById('listings-bulk-bar');
      const btn = bar?.querySelector('button:last-child');
      if (btn) btn.textContent = `Отменяю ${done + 1}/${ids.length}...`;

      const result = await window.electronAuth.marketCancelListing({ listingId: id });

      if (result && result.success) {
        done++;
        selectedListings.delete(id);
        const row = document.querySelector(`[data-listing-id="${id}"]`);
        if (row) {
          row.style.transition = 'opacity 0.2s';
          row.style.opacity    = '0';
          setTimeout(() => row.remove(), 200);
        }
      }

      await new Promise(r => setTimeout(r, 300));
    }

    listingSelectMode = false;
    selectedListings.clear();
    updateSelectBtn();
    await loadListings(listingsPage);
  };

  tabInventory.onclick = () => switchTab('inventory');
  tabListings.onclick = () => switchTab('listings');
  tabHistory.onclick = () => switchTab('history');

  const switchTab = (tabId) => {
    activeTab = tabId;
    
    // Update tab styles
    [tabInventory, tabListings, tabHistory].forEach(tab => {
        tab.style.background = 'transparent';
        tab.style.color = '#555';
        tab.style.fontWeight = '500';
    });

    const activeTabEl = container.querySelector(`#tab-${tabId}`);
    if (activeTabEl) {
        activeTabEl.style.background = '#22c55e';
        activeTabEl.style.color = '#0a0a0a';
        activeTabEl.style.fontWeight = '600';
    }

    inventoryView.style.display = activeTab === 'inventory' ? 'block' : 'none';
    listingsView.style.display = activeTab === 'listings' ? 'block' : 'none';
    const historyView = container.querySelector('#history-view');
    if (historyView) historyView.style.display = activeTab === 'history' ? 'block' : 'none';

    if (activeTab === 'inventory') {
      if (allCards.length === 0) loadCards();
      updateInventoryControls();
    } else if (activeTab === 'listings') {
      loadListings();
    } else if (activeTab === 'history') {
      loadHistory();
    }

    stopConfirmationPolling();
    updateUI();
    updateSelectBtn();
  };

  const loadInstaSellPrices = async (selectedCards) => {
    instaSellData = {};

    for (const card of selectedCards) {
      if (!selectMode) break;
      console.log(`[instaSell] Loading for: ${card.name} (${card.marketHashName})`);
      try {
        // Шаг 1 — получить nameId
        const nameIdResult = await window.electronAuth.marketGetItemNameId({ marketHashName: card.marketHashName });
        console.log(`[instaSell] ${card.name}: nameIdResult=`, nameIdResult);
        if (nameIdResult.error) throw new Error(nameIdResult.error);

        const nameId = nameIdResult.itemNameId;
        console.log(`[instaSell] ${card.name}: nameId=${nameId}`);

        if (!nameId) {
          console.warn(`[instaSell] ${card.name}: nameId is null/undefined`);
          instaSellData[card.marketHashName] = { highestBuyCents: 0, sellerCents: 0, hasBuyers: false };
          if (selectMode) { renderPriceSummary(); renderInstaSellButton(); }
          continue;
        }

        // Шаг 2 — получить histogram
        const histo = await window.electronAuth.marketGetHistogram({ itemNameId: nameId });
        console.log(`[instaSell] ${card.name}: histogram=`, histo);
        if (histo.error) throw new Error(histo.error);

        const highestBuyStr = histo?.highestBuyOrder ?? '';
        console.log(`[instaSell] ${card.name}: highestBuyStr="${highestBuyStr}"`);

        // Парсим строку вида "$0.09" → 9 центов
        const highest = highestBuyStr && highestBuyStr !== '—'
          ? Math.round(parseFloat(highestBuyStr.replace(/[^0-9.]/g, '')) * 100)
          : 0;
        console.log(`[instaSell] ${card.name}: parsed highest=${highest}¢`);

        instaSellData[card.marketHashName] = {
          highestBuyCents: highest,
          sellerCents:     highest > 0 ? sellerPriceFromBuyerPrice(highest) : 0,
          hasBuyers:       highest > 0,
        };

        console.log(`[instaSell] ${card.name}: highestBuy=${highest}¢ seller=${instaSellData[card.marketHashName].sellerCents}¢ hasBuyers=${highest > 0}`);
      } catch (err) {
        console.error(`[instaSell] Error for ${card.name}:`, err.message, err.stack);
        instaSellData[card.marketHashName] = { highestBuyCents: 0, sellerCents: 0, hasBuyers: false };
      }

      if (selectMode) {
        renderPriceSummary();
        renderInstaSellButton();
      }
    }

    console.log('[instaSell] Final instaSellData:', instaSellData);
  };

  const renderInstaSellButton = () => {
    const btnContainer = document.getElementById('insta-sell-btn-container');
    if (!btnContainer) return;

    const selectedCards = getFilteredCards().filter(c => c.assetIds ? c.assetIds.some(id => selected.has(id)) : selected.has(c.assetId));
    
    // Only keys that correspond to selected cards
    const actuallySelectedHashes = [...new Set(selectedCards.map(c => c.marketHashName))];
    
    let loadedCount = 0;
    actuallySelectedHashes.forEach(h => {
      if (instaSellData[h]) loadedCount++;
    });

    const allLoaded = loadedCount === actuallySelectedHashes.length;

    let totalCents = 0;
    let eligibleCount = 0;
    selectedCards.forEach(c => {
      const d = instaSellData[c.marketHashName];
      if (d && d.hasBuyers) {
        let count = c.assetIds ? c.assetIds.filter(id => selected.has(id)).length : 1;
        totalCents += d.sellerCents * count;
        eligibleCount += count;
      }
    });

    if (!allLoaded) {
      btnContainer.innerHTML = `
        <button id="start-insta-sell-btn" disabled style="
          padding:10px 20px;border-radius:var(--radius-md);cursor:default;
          border:1px solid rgba(22, 83, 43, 0.5);background:var(--color-bg-surface);
          color:var(--color-text-secondary);font-size:14px;font-weight:600;
        ">
          ⚡ Загружаю цены...
        </button>
      `;
      return;
    }

    if (eligibleCount === 0) {
      btnContainer.innerHTML = `
        <button id="start-insta-sell-btn" disabled style="
          padding:10px 20px;border-radius:var(--radius-md);cursor:default;
          border:1px solid rgba(22, 83, 43, 0.5);background:var(--color-bg-surface);
          color:var(--color-text-secondary);font-size:14px;font-weight:600;opacity:0.5;
        ">
          ⚡ Нет покупателей
        </button>
      `;
      return;
    }

    btnContainer.innerHTML = `
      <button id="start-insta-sell-btn" ${selling ? 'disabled' : ''} style="
        padding:10px 20px;border-radius:var(--radius-md);cursor:${selling ? 'default' : 'pointer'};
        border:1px solid var(--color-accent-green);background:${selling ? 'var(--color-bg-hover)' : 'rgba(22, 83, 43, 0.8)'};
        color:${selling ? 'var(--color-text-secondary)' : 'var(--color-accent-green)'};font-size:14px;font-weight:600;opacity:1;
        transition: all var(--transition-fast);
      ">
        ⚡ Продать мгновенно · ${eligibleCount} карт · ~$${(totalCents/100).toFixed(2)}
      </button>
    `;

    const btn = document.getElementById('start-insta-sell-btn');
    if (btn) btn.onclick = () => doInstaSell();
  };

  const doInstaSell = async () => {
    const selectedCards = getFilteredCards().filter(c => c.assetIds ? c.assetIds.some(id => selected.has(id)) : selected.has(c.assetId));
    
    // Unroll into individual assets for selling
    const cardsToSell = [];
    selectedCards.forEach(c => {
      if (instaSellData[c.marketHashName]?.hasBuyers) {
        const selectedIds = c.assetIds ? c.assetIds.filter(id => selected.has(id)) : (selected.has(c.assetId) ? [c.assetId] : []);
        selectedIds.forEach(id => {
          cardsToSell.push({
            assetId: id,
            name: c.name,
            marketHashName: c.marketHashName,
            sellPrice: instaSellData[c.marketHashName].sellerCents
          });
        });
      }
    });

    if (cardsToSell.length === 0) {
      alert('Нет карточек с активными покупателями');
      return;
    }

    const totalSelectedIds = selectedCards.reduce((sum, c) => sum + (c.assetIds ? c.assetIds.filter(id => selected.has(id)).length : 1), 0);
    const skipped = totalSelectedIds - cardsToSell.length;
    if (skipped > 0) {
      console.log(`[instaSell] Skipping ${skipped} cards without buyers`);
    }

    selling = true;
    updateUI();

    const btn = document.getElementById('start-insta-sell-btn');
    if (btn) {
      btn.disabled = true;
    }

    sellResults = [];
    const results = [];
    for (let i = 0; i < cardsToSell.length; i++) {
        if (!selling) break;
        const card = cardsToSell[i];

        if (btn) btn.textContent = `⚡ Продаю ${i+1}/${cardsToSell.length}...`;

        const result = await window.electronAuth.marketSellItem({
            assetId:   card.assetId,
            price:     card.sellPrice,
            appId:     753,
            contextId: 6,
        });

        results.push({
            assetId: card.assetId,
            name: card.name,
            status: result.success ? 'success' : 'error',
            error: result.error,
            requiresConfirmation: result.requiresConfirmation,
            soldPriceCents: card.sellPrice
        });

        if (i < cardsToSell.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    if (btn) btn.textContent = `✓ Продано ${cardsToSell.length} карт`;
    
    selling = false;
    sellResults = results;
    selected = new Set();
    
    sellResultStatuses = {};
    results.forEach(r => {
      if (r.status === 'success') {
        sellResultStatuses[r.assetId] = r.requiresConfirmation ? 'pending' : 'sold';
      } else {
        sellResultStatuses[r.assetId] = 'error';
      }
    });

    updateUI();
    loadCards(true);

    const pendingIds = results
      .filter(r => r.status === 'success' && r.requiresConfirmation)
      .map(r => r.assetId);

    if (pendingIds.length > 0) {
      startConfirmationPolling(pendingIds);
    }
  };

  const sellerPriceFromBuyerPrice = (desiredBuyerCents) => {
    for (let seller = desiredBuyerCents; seller >= 1; seller--) {
      const steamFee     = Math.max(Math.floor(seller * 0.05), 1);
      const publisherFee = Math.max(Math.floor(seller * 0.10), 1);
      if (seller + steamFee + publisherFee <= desiredBuyerCents) return seller;
    }
    return 1;
  };

  const renderPriceSummary = () => {
    let summaryEl = document.getElementById('price-summary');
    if (!summaryEl) {
      summaryEl = document.createElement('div');
      summaryEl.id = 'price-summary';
      sellConfigPanel.after(summaryEl);
    }

    const selectedCards = allCards.filter(c => c.assetIds ? c.assetIds.some(id => selected.has(id)) : selected.has(c.assetId));

    if (activeTab !== 'inventory' || !selectMode || selectedCards.length === 0 || sellResults) {
      summaryEl.innerHTML = '';
      return;
    }

    const rows = selectedCards.map(card => {
      const cached = priceCache[card.marketHashName];
      const lowestCents = cached?.lowestPriceCents ?? null;
      const count = card.assetIds ? card.assetIds.filter(id => selected.has(id)).length : 1;

      let targetHtml = '...';
      let sellerHtml = '...';
      let sellerCentsTotal = 0;

      if (lowestCents) {
        const targetCents = Math.max(1, lowestCents + offsetCents);
        const sellerCents = sellerPriceFromBuyerPrice(targetCents);
        sellerCentsTotal = sellerCents * count;
        targetHtml = `$${(targetCents / 100).toFixed(2)}`;
        sellerHtml = `$${(sellerCents / 100).toFixed(2)} ${count > 1 ? `(×${count})` : ''}`;
      }

      const insta = instaSellData[card.marketHashName];
      const instaHtml = insta == null
        ? `<span style="color:var(--color-text-secondary);">...</span>`
        : insta.hasBuyers
          ? `<span style="color:var(--color-warning);font-weight:600;">$${(insta.sellerCents/100).toFixed(2)}</span>`
          : `<span style="color:var(--color-text-secondary);font-size:11px;">нет</span>`;

      return {
        name: card.name,
        count,
        lowest: lowestCents ? `$${(lowestCents / 100).toFixed(2)}` : '...',
        target: targetHtml,
        seller: sellerHtml,
        sellerCents: sellerCentsTotal,
        instaHtml,
        hasBuyers: insta?.hasBuyers,
        instaSellerCents: insta?.hasBuyers ? insta.sellerCents * count : 0
      };
    });

    const totalRegularCents = rows.reduce((sum, r) => sum + r.sellerCents, 0);
    const totalInstaCents = rows.reduce((sum, r) => sum + r.instaSellerCents, 0);

    const totalSelectedIds = rows.reduce((sum, r) => sum + r.count, 0);
    const instaBuyersCount = rows.reduce((sum, r) => sum + (r.hasBuyers ? r.count : 0), 0);

    summaryEl.innerHTML = `
      <div style="margin-bottom: 16px; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; background: var(--color-bg-base);">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: var(--color-bg-surface); border-bottom: 1px solid var(--color-border);">
              <th style="padding: 10px 14px; text-align: left; color: var(--color-text-secondary); font-weight: 500;">Карточка</th>
              <th style="padding: 10px 14px; text-align: right; color: var(--color-text-secondary); font-weight: 500;">Мин. цена</th>
              <th style="padding: 10px 14px; text-align: right; color: var(--color-text-secondary); font-weight: 500;">Ваша цена</th>
              <th style="padding: 10px 14px; text-align: right; color: var(--color-text-secondary); font-weight: 500;">Вы получите</th>
              <th style="padding: 10px 14px; text-align: right; color: var(--color-warning); font-weight: 500;">⚡ Инста</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, i) => `
              <tr style="background: ${i % 2 === 0 ? 'var(--color-bg-surface-light)' : 'var(--color-bg-surface)'}; border-bottom: 1px solid var(--color-border);">
                <td style="padding: 8px 14px; color: var(--color-text-primary);">${row.name} ${row.count > 1 ? `<span style="color:var(--color-text-secondary);">×${row.count}</span>` : ''}</td>
                <td style="padding: 8px 14px; text-align: right; color: var(--color-text-secondary);">${row.lowest}</td>
                <td style="padding: 8px 14px; text-align: right; color: var(--color-text-primary);">${row.target}</td>
                <td style="padding: 8px 14px; text-align: right; color: var(--color-success); font-weight: 600;">${row.seller}</td>
                <td style="padding: 8px 14px; text-align: right;">${row.instaHtml}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background: var(--color-bg-surface); border-top: 1px solid var(--color-border);">
              <td colspan="3" style="padding: 10px 14px; color: var(--color-text-secondary); font-size: 11px;">
                Итого: ${totalSelectedIds} карточек
                ${instaBuyersCount < totalSelectedIds
                  ? `· <span style="color:var(--color-danger)">${totalSelectedIds - instaBuyersCount} без покупателей</span>`
                  : ''}
              </td>
              <td style="padding: 10px 14px; text-align: right; color: var(--color-success); font-weight: 700; font-size: 13px;">
                ~$${(totalRegularCents / 100).toFixed(2)}
              </td>
              <td style="padding: 10px 14px; text-align: right; color: var(--color-warning); font-weight: 700; font-size: 13px;">
                ${totalInstaCents > 0 ? `~$${(totalInstaCents / 100).toFixed(2)}` : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  };

  const updateUI = () => {
    // Selection Panel
    selectionPanel.innerHTML = '';

    if (activeTab === 'inventory' && selectMode) {
      const filtered = getFilteredCards();
      const totalAmount = filtered.reduce((acc, c) => acc + c.amount, 0);
      const selectAllBtn = document.createElement('button');
      selectAllBtn.textContent = `Выбрать все (${totalAmount})`;
      selectAllBtn.className = 'btn-outline';
      selectAllBtn.style.padding = '6px 12px';
      selectAllBtn.onclick = () => {
        const newSelected = new Set();
        filtered.forEach(c => c.assetIds?.forEach(id => newSelected.add(id)));
        selected = newSelected;
        updateUI();
        filterCards(); 
        
        const selectedCards = filtered.filter(c => c.assetIds ? c.assetIds.some(id => selected.has(id)) : selected.has(c.assetId));
        if (selectedCards.length > 0) {
          instaSellData = {};
          loadInstaSellPrices(selectedCards);
        } else {
          instaSellData = {};
          renderPriceSummary();
          renderInstaSellButton();
        }
      };
      selectionPanel.appendChild(selectAllBtn);

      if (selected.size > 0) {
        const selCountSpan = document.createElement('span');
        selCountSpan.style.cssText = 'color: var(--color-text-primary); font-size: 12px;';
        selCountSpan.textContent = `Выбрано: ${selected.size}`;
        selectionPanel.appendChild(selCountSpan);
      }
    }

    function updateCardPrice(assetId, price) {
      const el = document.getElementById(`price-${assetId}`);
      if (el) el.textContent = price ?? 'нет цены';
    }

    // Sell Config Panel
    if (activeTab === 'inventory' && selectMode && selected.size > 0 && !sellResults) {
      sellConfigPanel.style.display = 'flex';
      
      const isMinus = offsetCents < 0;
      const absValue = (Math.abs(offsetCents) / 100).toFixed(2);
      
      sellConfigPanel.innerHTML = `
        <span style="color: var(--color-text-secondary); font-size: 13px;">Продать по:</span>
        <span style="color: var(--color-text-primary); font-size: 13px;">мин. цена</span>
        
        <div style="display: flex; align-items: center; gap: 6px;">
          <select id="offset-sign-select" style="
            padding: 6px 8px; border-radius: var(--radius-sm); border: 1px solid var(--color-border);
            background: var(--color-bg-base); color: var(--color-text-primary); font-size: 12px; cursor: pointer;
            outline: none;
          ">
            <option value="minus" ${isMinus ? 'selected' : ''}>−</option>
            <option value="plus" ${!isMinus ? 'selected' : ''}>+</option>
          </select>
          
          <span style="color: var(--color-text-secondary); font-size: 13px;">$</span>
          
          <input type="number" id="offset-val-input" min="0.00" step="0.01" value="${absValue}" style="
            width: 60px; padding: 6px 8px; border-radius: var(--radius-sm); border: 1px solid var(--color-border);
            background: var(--color-bg-base); color: var(--color-text-primary); font-size: 13px; outline: none;
            transition: border-color var(--transition-fast);
          " />
        </div>
        
        <div style="margin-left: auto; display: flex; gap: 8px;">
          ${selectMode ? `<div id="insta-sell-btn-container"></div>` : ''}

          <button id="start-sell-btn" ${selling ? 'disabled' : ''} style="
            padding: 10px 20px; border-radius: var(--radius-md); border: none;
            background: ${selling ? 'var(--color-bg-surface)' : 'var(--color-accent-green)'};
            color: ${selling ? 'var(--color-text-secondary)' : 'var(--color-bg-base)'};
            font-weight: 600; font-size: 14px;
            cursor: ${selling ? 'default' : 'pointer'};
            transition: all var(--transition-fast);
          ">
            ${selling 
              ? `Продаём ${progress?.index + 1 ?? 0} / ${progress?.total ?? selected.size}...`
              : `Выставить ${selected.size} карточек`}
          </button>
        </div>
      `;

      sellConfigPanel.querySelector('#offset-sign-select').onchange = (e) => {
        offsetCents = e.target.value === 'minus' ? -Math.abs(offsetCents) : Math.abs(offsetCents);
        updateUI();
      };
      
      sellConfigPanel.querySelector('#offset-val-input').oninput = (e) => {
        const parsed = parseFloat(e.target.value);
        if(!isNaN(parsed)) {
            const cents = Math.round(parsed * 100);
            offsetCents = offsetCents < 0 ? -cents : cents;
            updateUI();
        }
      };

      sellConfigPanel.querySelector('#start-sell-btn').onclick = () => handleAutoSell(false);
    } else {
      sellConfigPanel.style.display = 'none';
      sellConfigPanel.innerHTML = '';
    }

    // Sell Progress Panel
    if (activeTab === 'inventory' && progress && selling) {
      sellProgressPanel.style.display = 'block';
      const pct = ((progress.index + 1) / progress.total) * 100;
      
      let statusText = progress.status;
      if (progress.status === 'fetching_price') statusText = 'получаем цену...';
      else if (progress.status === 'selling') statusText = `выставляем за $${(progress.price / 100).toFixed(2)}...`;

      sellProgressPanel.innerHTML = `
        <div style="height: 4px; background: var(--color-border); border-radius: 2px; margin-bottom: 8px;">
          <div style="height: 100%; width: ${pct}%; background: var(--color-accent-green); border-radius: 2px; transition: width var(--transition-fast);"></div>
        </div>
        <span style="color: var(--color-text-primary);">${progress.card}</span>
        — ${statusText}
      `;
    } else {
      sellProgressPanel.style.display = 'none';
      sellProgressPanel.innerHTML = '';
    }

    // Sell Results Panel
    if (activeTab === 'inventory' && sellResults) {
      sellResultsPanel.style.display = 'block';
      
      const successCount = sellResults.filter(r => r.status === 'success').length;
      
      sellResultsPanel.innerHTML = `
        <div style="color: var(--color-text-primary); font-weight: 600; margin-bottom: 12px; font-size: 14px;">
          Результаты продажи
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
          <tbody id="sell-results-table">
            <!-- Rendered by renderSellResultsTable -->
          </tbody>
        </table>
        <div style="margin-top: 10px; font-size: 12px; color: var(--color-text-secondary);">
          Успешно: ${successCount} / ${sellResults.length}
        </div>
      `;
      renderSellResultsTable(sellResults);
    } else {
      sellResultsPanel.style.display = 'none';
      sellResultsPanel.innerHTML = '';
    }

    renderPriceSummary();
    if (activeTab === 'inventory' && selectMode) {
      renderInstaSellButton();
    }
  };
  const filterCards = () => {
    const filtered = getFilteredCards();
    const sorted = sortCards(filtered, currentSort);
    if (countEl && activeTab === 'inventory') {
      const totalAmount = sorted.reduce((acc, card) => acc + card.amount, 0);
      countEl.textContent = totalAmount;
    }
    renderCardsList(sorted);
    if (window.initTooltips) window.initTooltips();
  };

  const getFilteredCards = () => {
    const q = currentSearchQuery.toLowerCase();
    return allCards.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.gameName.toLowerCase().includes(q)
    );
  };

  const renderCardsList = (cards) => {
    if (cards.length === 0) {
      if (currentSearchQuery) {
        contentEl.innerHTML = `<div class="empty-state">Карточки не найдены по запросу "${currentSearchQuery}"</div>`;
      } else {
        contentEl.innerHTML = `<div class="empty-state">Инвентарь закрыт или карточек нет</div>`;
      }
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'cards-grid';

    cards.forEach(card => {
      const el = document.createElement('div');
      
      const isSelected = card.assetIds?.every(id => selected.has(id)) || selected.has(card.assetId);
      el.className = 'card-item' + (isSelected ? ' selected' : '');
      
      let tooltipContent = `
        <div style="font-weight: 600; margin-bottom: 4px;">${card.name}</div>
        <div style="color: var(--color-text-secondary); font-size: 11px; margin-bottom: 6px;">${card.gameName}</div>
        ${card.tradable ? '<div style="color: var(--color-success); font-size: 11px;">✓ Можно обменять</div>' : ''}
        ${card.marketable ? '<div style="color: var(--color-success); font-size: 11px;">✓ Можно продать</div>' : ''}
      `;

      el.setAttribute('data-tooltip-html', tooltipContent);

      el.innerHTML = `
        ${selectMode ? `<div class="card-checkbox">${isSelected ? '✓' : ''}</div>` : ''}
        <img src="${card.iconUrl}" alt="${card.name}" class="card-icon" loading="lazy" />
        <div class="card-info">
          <div class="card-name" title="${card.name}">${card.name}</div>
          <div class="card-game" title="${card.gameName}">${card.gameName}</div>
          ${selectMode ? `
            <div id="price-${card.assetId}" style="font-size: 11px; color: var(--color-accent-green); margin-top: 4px; font-weight: 600; min-height: 14px;">
              ${priceCache[card.marketHashName]?.lowestPrice ?? '...'}
            </div>
          ` : ''}
        </div>
        ${card.amount > 1 ? `
          <div style="
            position:absolute;top:6px;right:6px;
            background:var(--color-accent-green);color:var(--color-bg-base);
            border-radius:10px;padding:2px 7px;
            font-size:11px;font-weight:700;
          ">×${card.amount}</div>
        ` : ''}
        ${!card.tradable ? `<div class="card-badge-untradable">🔒</div>` : ''}
      `;

      el.addEventListener('click', () => {
        if (selectMode) {
          if (isSelected) {
            if (card.assetIds) {
              card.assetIds.forEach(id => selected.delete(id));
            } else {
              selected.delete(card.assetId);
            }
          } else {
            if (card.assetIds) {
              card.assetIds.forEach(id => selected.add(id));
            } else {
              selected.add(card.assetId);
            }
          }
          filterCards(); 
          updateUI();
          
          const selectedCards = getFilteredCards().filter(c => c.assetIds ? c.assetIds.some(id => selected.has(id)) : selected.has(c.assetId));
          if (selectedCards.length > 0) {
            instaSellData = {};
            loadInstaSellPrices(selectedCards);
          } else {
            instaSellData = {};
            renderPriceSummary();
            renderInstaSellButton();
          }
        } else {
          openCardModal(card);
          // hide tooltip on click
          const tooltip = document.getElementById('tooltip');
          if (tooltip) tooltip.classList.remove('tooltip-visible');
        }
      });

      grid.appendChild(el);
    });

    contentEl.innerHTML = '';
    contentEl.appendChild(grid);
  };

  async function activateSelectMode() {
    selectMode = true;
    selected.clear();
    instaSellData = {};
    updateUI();
    filterCards();

    const filtered = getFilteredCards();
    const batchSize = 5;
    for (let i = 0; i < filtered.length; i += batchSize) {
      if (!selectMode) break; // User cancelled
      const batch = filtered.slice(i, i + batchSize);
      await Promise.all(batch.map(async (card) => {
        if (priceCache[card.marketHashName]) return;

        const result = await window.electronAuth.marketGetPrice({
          marketHashName: card.marketHashName
        });

        if (result && !result.error) {
          priceCache[card.marketHashName] = result;
          // updateCardPrice function inside updateUI isn't accessible here, inline logic instead
          const el = document.getElementById(`price-${card.assetId}`);
          if (el) el.textContent = result.lowestPrice ?? 'нет цены';
          renderPriceSummary();
        }
      }));
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const loadCards = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        contentEl.innerHTML = '<div class="loading-state">Обновление карточек...</div>';
      } else {
        contentEl.innerHTML = '<div class="loading-state">Загрузка карточек...</div>';
      }
      if (countEl) countEl.textContent = '...';
      
      const auth = store.get('auth');
      if (!auth || !auth.steamId) {
        contentEl.innerHTML = '<div class="error-state">Необходима авторизация Steam</div>';
        return;
      }

      const res = await window.electronAuth.inventoryGetCards(auth.steamId, forceRefresh);
      
      if (res && res.success) {
        allCards = res.data || [];
        filterCards();
        updateUI();
        updateSelectBtn();
      } else {
        contentEl.innerHTML = `<div class="error-state">Ошибка: ${res?.error || 'Неизвестная ошибка'}</div>`;
      }
    } catch (e) {
      console.error('Failed to load cards:', e);
      contentEl.innerHTML = `<div class="error-state">Ошибка загрузки: ${e.message}</div>`;
    }
  };

  async function handleAutoSell(instaSell = false) {
    const filtered = getFilteredCards();
    
    // Flatten selected assetIds from selected groups
    const cardsToSell = [];
    filtered.forEach(c => {
      const selectedIds = c.assetIds ? c.assetIds.filter(id => selected.has(id)) : (selected.has(c.assetId) ? [c.assetId] : []);
      selectedIds.forEach(id => {
        cardsToSell.push({
          assetId: id,
          name: c.name,
          marketHashName: c.marketHashName,
          knownPriceCents: priceCache[c.marketHashName]?.lowestPriceCents ?? null
        });
      });
    });

    if (!cardsToSell.length) return;

    selling = true;
    sellResults = null;
    updateUI();

    window.electronAuth.onAutoSellProgress((p) => {
      progress = p;
      updateUI();
    });

    const result = await window.electronAuth.marketAutoSellBatch({
      cards: cardsToSell,
      offsetCents: offsetCents,
      delayMs: 1000,
      instaSell: instaSell
    });

    window.electronAuth.removeAutoSellProgress();
    selling = false;
    progress = null;
    sellResults = result.results;
    selected = new Set();
    
    // Инициализировать статусы
    sellResultStatuses = {};
    result.results.forEach(r => {
      if (r.status === 'success') {
        sellResultStatuses[r.assetId] = r.requiresConfirmation ? 'pending' : 'sold';
      } else {
        sellResultStatuses[r.assetId] = 'error';
      }
    });

    updateUI();
    loadCards(true);

    // Собрать assetId которые требуют подтверждения
    const pendingIds = result.results
      .filter(r => r.status === 'success' && r.requiresConfirmation)
      .map(r => r.assetId);

    if (pendingIds.length > 0) {
      console.log('[poll] Starting confirmation polling for:', pendingIds);
      startConfirmationPolling(pendingIds);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopConfirmationPolling();
  });

  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim();
    filterCards();
    updateUI();
  });

  refreshBtn.addEventListener('click', () => {
    loadCards(true);
  });

  const openCardModal = (card) => {
    let instaSellCount = 1;
    let currentHighestBuy = 0;

    const existingModal = document.getElementById('card-modal-overlay');
    if (existingModal) existingModal.remove();

    const bigIconUrl = card.iconUrl ? card.iconUrl.replace('96fx96f', '256fx256f') : '';
    const marketUrl = `https://steamcommunity.com/market/listings/753/${encodeURIComponent(card.name)}`;

    const overlay = document.createElement('div');
    overlay.id = 'card-modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0, 0, 0, 0.75)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '1000';

    const renderProperty = (icon, text, active) => `
      <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: ${active ? 'var(--color-success)' : 'var(--color-danger)'};">
        <span>${icon}</span>
        <span>${text}</span>
      </div>
    `;

    overlay.innerHTML = `
      <div id="card-modal-content" style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 16px; padding: 24px; width: 320px; display: flex; flex-direction: column; align-items: center; gap: 16px; position: relative;">
        <button id="card-modal-close" style="position: absolute; top: 12px; right: 12px; background: transparent; border: none; color: var(--color-text-secondary); font-size: 18px; cursor: pointer; line-height: 1; padding: 4px;">✕</button>
        
        ${bigIconUrl ? 
          `<img src="${bigIconUrl}" alt="${card.name}" style="width: 200px; height: 200px; object-fit: contain; border-radius: var(--radius-sm);" />` : 
          `<div style="width: 200px; height: 200px; background: var(--color-border); border-radius: var(--radius-sm);"></div>`
        }

        <div style="font-size: 16px; font-weight: 600; color: var(--color-text-primary); text-align: center;">${card.name}</div>
        <div style="font-size: 13px; color: var(--color-text-secondary);">${card.gameName}</div>

        <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
          ${renderProperty(card.tradable ? '✓' : '✗', 'Можно обменять', card.tradable)}
          ${renderProperty(card.marketable ? '✓' : '✗', 'Можно продать на торговой площадке', card.marketable)}
        </div>

        ${card.marketable ? `
          <div style="width: 100%; height: 1px; background: var(--color-border); margin: 4px 0;"></div>
          
          <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 12px;">
            <div style="font-size: 11px; color: var(--color-text-primary); font-weight: 600;">Выставить на продажу</div>
            
            <div style="display: flex; align-items: center; gap: 8px;">
               <span style="color: var(--color-text-secondary); font-size: 12px;">$</span>
               <input type="number" id="manual-price-input" step="0.01" min="0.01" placeholder="Цена" style="
                 flex: 1; padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--color-border);
                 background: var(--color-bg-surface); color: var(--color-text-primary); font-size: 13px; outline: none;
                 transition: border-color var(--transition-fast);
               " />
               <button id="manual-sell-btn" style="
                 padding: 6px 16px; border-radius: var(--radius-sm); border: none;
                 background: var(--color-accent-green); color: var(--color-bg-base); font-weight: 600; font-size: 12px; cursor: pointer;
                 transition: all var(--transition-fast);
               ">Продать</button>
            </div>
            
            <div id="manual-price-info" style="font-size: 11px; color: var(--color-text-secondary); min-height: 14px;">
              Введите цену покупателя
            </div>
          </div>
        ` : ''}

        <div id="modal-market-section" style="width: 100%;">
          <div class="loading-state" style="padding: 10px; font-size: 12px;">Загрузка данных рынка...</div>
        </div>

        ${card.marketable ? `
          <button id="card-modal-market-btn" style="width: 100%; padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--color-accent-green); background: transparent; color: var(--color-accent-green); font-size: 13px; font-weight: 600; cursor: pointer; transition: all var(--transition-fast);">
            Открыть на торговой площадке
          </button>
        ` : ''}
      </div>
    `;

    document.body.appendChild(overlay);

    // Fetch market depth
    if (card.marketable) {
      (async () => {
        const nameIdResult = await window.electronAuth.marketGetItemNameId({
          marketHashName: card.marketHashName
        });

        if (nameIdResult.error) {
          const section = overlay.querySelector('#modal-market-section');
          if (section) section.innerHTML = `<div style="color: var(--color-danger); font-size: 11px;">Ошибка: ${nameIdResult.error}</div>`;
          return;
        }

        const histogram = await window.electronAuth.marketGetHistogram({
          itemNameId: nameIdResult.itemNameId
        });

        if (histogram.error) {
          const section = overlay.querySelector('#modal-market-section');
          if (section) section.innerHTML = `<div style="color: var(--color-danger); font-size: 11px;">Ошибка: ${histogram.error}</div>`;
          return;
        }

        updateModalWithMarketData(overlay, histogram);
      })();
    } else {
      const section = overlay.querySelector('#modal-market-section');
      if (section) section.innerHTML = '';
    }

    function updateModalWithMarketData(overlay, histogram) {
      const marketSection = overlay.querySelector('#modal-market-section');
      if (!marketSection) return;

      const highestBuy   = histogram?.highestBuyOrder  ?? 0;
      const buyCount     = histogram?.buyOrderCount     ?? 0;
      const canInstaSell = highestBuy > 0 && buyCount > 0;
      currentHighestBuy = highestBuy;

      let instaSellHtml = '';
      if (canInstaSell) {
        instaSellHtml = `
          <div style="
            margin-top:16px;padding:14px;
            background:rgba(34, 197, 94, 0.05);border:1px solid rgba(22, 83, 43, 0.8);
            border-radius:var(--radius-md);
          ">
            <div style="font-size:12px;color:var(--color-accent-green);font-weight:600;margin-bottom:8px;">
              ⚡ Инста-продажа доступна
            </div>
            <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:12px;">
              ${buyCount} покупателей готовы купить по
              <span style="color:var(--color-text-primary);font-weight:600;">
                $${(highestBuy/100).toFixed(2)}
              </span>
              — вы получите
              <span style="color:var(--color-accent-green);font-weight:600;">
                $${(sellerPriceFromBuyerPrice(highestBuy)/100).toFixed(2)}
              </span>
            </div>

            <!-- Если несколько одинаковых карточек -->
            ${card.amount > 1 ? `
              <div style="
                display:flex;align-items:center;gap:8px;margin-bottom:12px;
              ">
                <span style="color:#555;font-size:12px;">Количество:</span>
                <div style="display:flex;gap:4px;">
                  ${[1, ...Array.from({length:Math.min(card.amount-1, 4)},(_,i)=>i+2)].map(n => `
                    <button
                      onclick="window.setInstaSellCount(${n})"
                      id="insta-count-${n}"
                      style="
                        padding:4px 10px;border-radius:var(--radius-sm);cursor:pointer;
                        font-size:12px;
                        border:      1px solid ${n===1?'var(--color-accent-green)':'var(--color-border)'};
                        background:  ${n===1?'rgba(34, 197, 94, 0.15)':'var(--color-bg-surface)'};
                        color:       ${n===1?'var(--color-accent-green)':'var(--color-text-secondary)'};
                        transition: all var(--transition-fast);
                      "
                    >${n}</button>
                  `).join('')}
                  ${card.amount > 5 ? `
                    <button
                      onclick="window.setInstaSellCount(${card.amount})"
                      id="insta-count-${card.amount}"
                      style="
                        padding:4px 10px;border-radius:var(--radius-sm);cursor:pointer;
                        font-size:12px;border:1px solid var(--color-border);
                        background:var(--color-bg-surface);color:var(--color-text-secondary);
                        transition: all var(--transition-fast);
                      "
                    >Все (${card.amount})</button>
                  ` : `
                    <button
                      onclick="window.setInstaSellCount(${card.amount})"
                      id="insta-count-${card.amount}"
                      style="display:none;"
                    >Все (${card.amount})</button>
                  `}
                </div>
              </div>
              <div style="color:var(--color-text-secondary);font-size:11px;margin-bottom:12px;">
                Итого: <span id="insta-total" style="color:var(--color-accent-green);font-weight:600;">
                  $${(sellerPriceFromBuyerPrice(highestBuy)/100).toFixed(2)}
                </span>
              </div>
            ` : ''}

            <button
              onclick="window.doInstaSell('${card.marketHashName}', ${highestBuy})"
              id="insta-sell-btn"
              style="
                width:100%;padding:10px;border-radius:var(--radius-sm);cursor:pointer;
                border:1px solid var(--color-accent-green);background:rgba(22, 83, 43, 0.8);
                color:var(--color-accent-green);font-size:13px;font-weight:600;
                transition: all var(--transition-fast);
              ">
              ⚡ Продать мгновенно · $${(highestBuy/100).toFixed(2)}
            </button>
          </div>
        `;
      }

      marketSection.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
          <!-- Продавцы -->
          <div style="background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 10px;">
            <div style="font-size: 9px; color: var(--color-text-secondary); margin-bottom: 4px; letter-spacing: 1px;">ПРОДАВЦЫ</div>
            <div style="font-size: 11px; color: var(--color-text-primary); font-weight: 600; margin-bottom: 6px;">
              ${histogram.sellOrderCount} лотов · от ${histogram.lowestSellOrder}
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
              ${(histogram.sellOrders ?? []).map(o => `
                <tr style="color: var(--color-text-primary);">
                  <td style="padding: 2px 0; color: var(--color-danger);">${o.price}</td>
                  <td style="padding: 2px 0; text-align: right;">${o.quantity}</td>
                </tr>
              `).join('')}
            </table>
          </div>

          <!-- Покупатели -->
          <div style="background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 10px;">
            <div style="font-size: 9px; color: var(--color-text-secondary); margin-bottom: 4px; letter-spacing: 1px;">ПОКУПАТЕЛИ</div>
            <div style="font-size: 11px; color: var(--color-text-primary); font-weight: 600; margin-bottom: 6px;">
              ${histogram.buyOrderCount} заявок · до ${histogram.highestBuyOrder}
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
              ${(histogram.buyOrders ?? []).map(o => `
                <tr style="color: var(--color-text-primary);">
                  <td style="padding: 2px 0; color: var(--color-success);">${o.price}</td>
                  <td style="padding: 2px 0; text-align: right;">${o.quantity}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        </div>
        ${instaSellHtml}
      `;
    }

    const sellerPriceFromBuyerPrice = (desiredBuyerCents) => {
      for (let seller = desiredBuyerCents; seller >= 1; seller--) {
        const steamFee     = Math.max(Math.floor(seller * 0.05), 1);
        const publisherFee = Math.max(Math.floor(seller * 0.10), 1);
        const buyerPays    = seller + steamFee + publisherFee;
        if (buyerPays <= desiredBuyerCents) return seller;
      }
      return 1;
    };

    window.setInstaSellCount = (n) => {
      instaSellCount = n;
      document.querySelectorAll('[id^="insta-count-"]').forEach(btn => {
        const isActive = btn.id === `insta-count-${n}`;
        btn.style.borderColor = isActive ? 'var(--color-accent-green)' : 'var(--color-border)';
        btn.style.background  = isActive ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-bg-surface)';
        btn.style.color       = isActive ? 'var(--color-accent-green)' : 'var(--color-text-secondary)';
      });
      const totalEl = document.getElementById('insta-total');
      if (totalEl) {
        const perItem = sellerPriceFromBuyerPrice(currentHighestBuy);
        totalEl.textContent = `$${(perItem * n / 100).toFixed(2)}`;
      }
    };

    window.doInstaSell = async (marketHashName, highestBuyerCents) => {
      const btn = document.getElementById('insta-sell-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Продаю...'; }
      
      const matchCard = allCards.find(c => c.marketHashName === marketHashName);
      if (!matchCard) return;

      const idsToSell = matchCard.assetIds ? matchCard.assetIds.slice(0, instaSellCount) : [matchCard.assetId].slice(0, instaSellCount);

      const results = [];

      for (let i = 0; i < idsToSell.length; i++) {
        const idToSell = idsToSell[i];

        if (btn) btn.textContent = `Продаю ${i+1}/${idsToSell.length}...`;

        const result = await window.electronAuth.marketSellItem({
          assetId:    idToSell,
          priceCents: highestBuyerCents
        });

        results.push({ name: matchCard.name, success: result.success, error: result.error });

        if (i < idsToSell.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      const success = results.filter(r => r.success).length;
      if (btn) {
        btn.textContent = `✓ Продано ${success}/${results.length}`;
        btn.style.background   = '#0d2b1a';
        btn.style.borderColor  = '#22c55e';
      }

      setTimeout(() => {
        closeModal();
        loadCards(true);
      }, 2000);
    };

    const closeModal = () => {
      overlay.remove();
      window.removeEventListener('keydown', handleEscape);
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') closeModal();
    };

    overlay.addEventListener('click', closeModal);
    overlay.querySelector('#card-modal-content').addEventListener('click', (e) => e.stopPropagation());
    overlay.querySelector('#card-modal-close').addEventListener('click', closeModal);

    const marketBtn = overlay.querySelector('#card-modal-market-btn');
    if (marketBtn) {
      marketBtn.addEventListener('click', () => {
        if (window.electronAuth && window.electronAuth.openExternal) {
          window.electronAuth.openExternal(marketUrl);
        }
      });
    }

    const priceInput = overlay.querySelector('#manual-price-input');
    const priceInfo  = overlay.querySelector('#manual-price-info');
    const sellBtn   = overlay.querySelector('#manual-sell-btn');

    if (priceInput && priceInfo && sellBtn) {
      const sellerPriceFromBuyerPrice = (desiredBuyerCents) => {
        for (let seller = desiredBuyerCents; seller >= 1; seller--) {
          const steamFee     = Math.max(Math.floor(seller * 0.05), 1);
          const publisherFee = Math.max(Math.floor(seller * 0.10), 1);
          const buyerPays    = seller + steamFee + publisherFee;
          if (buyerPays <= desiredBuyerCents) return seller;
        }
        return 1;
      };

      const updatePriceInfo = () => {
        const val = parseFloat(priceInput.value);
        if (isNaN(val) || val <= 0) {
          priceInfo.textContent = 'Введите цену покупателя';
          return;
        }
        const buyerCents  = Math.round(val * 100);
        const sellerCents = sellerPriceFromBuyerPrice(buyerCents);

        priceInfo.textContent =
          `Покупатель платит: $${(buyerCents/100).toFixed(2)} · ` +
          `Вы получите: $${(sellerCents/100).toFixed(2)}`;
      };

      priceInput.addEventListener('input', updatePriceInfo);

      sellBtn.addEventListener('click', async () => {
        const val = parseFloat(priceInput.value);
        if (isNaN(val) || val <= 0) return;

        sellBtn.disabled = true;
        sellBtn.textContent = '...';

        const buyerCents = Math.round(val * 100);
        const result = await window.electronAuth.marketSellItem({
          assetId: card.assetId,
          priceCents: buyerCents
        });

        if (result && result.success) {
          sellBtn.style.background = '#111';
          sellBtn.style.color = '#22c55e';
          sellBtn.textContent = '✓';
          setTimeout(() => closeModal(), 1000);
          loadCards(true);
        } else {
          sellBtn.disabled = false;
          sellBtn.textContent = 'Ошибка';
          priceInfo.style.color = '#f87171';
          priceInfo.textContent = result?.error || 'Ошибка при продаже';
        }
      });
    }

    window.addEventListener('keydown', handleEscape);
  };

  // Initial load
  loadCards();
  updateUI();
  updateSelectBtn();

  return container;
}
