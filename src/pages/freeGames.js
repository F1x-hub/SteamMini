/**
 * Free Games page — shows free game giveaways from Epic Games Store and GamerPower
 */
import toast from '../utils/toast.js';

export async function renderFreeGames() {
  const container = document.createElement('div');
  container.className = 'page-container free-games-page';

  const style = document.createElement('style');
  style.textContent = `
    .free-games-page {
      padding: var(--spacing-lg) var(--spacing-xl);
      max-width: 1200px;
      margin: 0 auto;
    }
    .free-games-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .free-games-header h2 {
      color: var(--color-text-primary);
      font-size: 20px;
      font-weight: 600;
      margin: 0;
    }
    .free-games-refresh-btn {
      padding: 7px 14px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--color-border);
      background: var(--color-bg-surface);
      color: var(--color-text-secondary);
      font-size: 12px;
      transition: border-color 0.2s, color 0.2s;
    }
    .free-games-refresh-btn:hover {
      border-color: var(--color-text-secondary);
      color: var(--color-text-primary);
    }
    .free-games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .free-game-card {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: border-color 0.2s, transform 0.15s;
    }
    .free-game-card:hover {
      border-color: var(--color-accent-green);
      transform: translateY(-2px);
      box-shadow: var(--shadow-hover);
    }
    .free-game-card-img {
      width: 100%;
      height: 160px;
      overflow: hidden;
    }
    .free-game-card-img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .free-game-card-placeholder {
      width: 100%;
      height: 160px;
      background: var(--color-bg-base);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
    }
    .free-game-card-body {
      padding: 14px;
    }
    .free-game-card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .free-game-platform {
      font-size: 11px;
      color: var(--color-text-secondary);
      background: var(--color-bg-base);
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--color-border);
    }
    .free-game-badge {
      font-size: 11px;
      color: var(--color-accent-green);
      font-weight: 700;
      background: rgba(34, 197, 94, 0.15);
      padding: 3px 8px;
      border-radius: var(--radius-sm);
    }
    .free-game-title {
      color: var(--color-text-primary);
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .free-game-original-price {
      color: var(--color-text-secondary);
      font-size: 12px;
      text-decoration: line-through;
      margin-bottom: 4px;
    }
    .free-game-end-date {
      color: var(--color-warning);
      font-size: 11px;
    }
    .free-games-loading,
    .free-games-error,
    .free-games-empty {
      grid-column: 1 / -1;
      text-align: center;
      padding: 40px;
      font-size: 14px;
    }
    .free-games-loading { color: var(--color-text-secondary); }
    .free-games-error   { color: var(--color-danger); }
    .free-games-empty   { color: var(--color-text-secondary); }
  `;
  container.appendChild(style);

  container.innerHTML += `
    <div class="free-games-header">
      <h2>🎁 Бесплатные игры</h2>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="free-games-refresh-btn" onclick="renderFreeGamesSettings()">⚙ Настройки</button>
        <button class="free-games-refresh-btn" id="free-games-refresh">Обновить</button>
      </div>
    </div>
    <div class="free-games-grid" id="free-games-grid">
      <div class="free-games-loading">Загружаю...</div>
    </div>
  `;

  async function loadGames() {
    const grid = container.querySelector('#free-games-grid');
    if (!grid) return;

    grid.innerHTML = `<div class="free-games-loading">Загружаю...</div>`;

    const settings = await window.electronAuth.freeGamesGetSettings();
    window._currentSettingsCache = settings; // Store globally for render access

    const result = await window.electronAuth.freeGamesGet();

    if (result.error) {
      grid.innerHTML = `<div class="free-games-error">Ошибка: ${result.error}</div>`;
      return;
    }

    if (!result.games?.length) {
      grid.innerHTML = `<div class="free-games-empty">Бесплатных игр не найдено</div>`;
      return;
    }

    grid.innerHTML = result.games.map(g => `
      <div class="free-game-card" data-url="${g.url}">
        ${g.imageUrl ? `
          <div class="free-game-card-img">
            <img src="${g.imageUrl}" alt="${g.title}"
                 onerror="this.parentElement.outerHTML='<div class=\\'free-game-card-placeholder\\'>🎮</div>'">
          </div>
        ` : `
          <div class="free-game-card-placeholder">🎮</div>
        `}
        <div class="free-game-card-body">
          <div class="free-game-card-meta">
            <span class="free-game-platform">${g.platform}</span>
            <span class="free-game-badge">БЕСПЛАТНО</span>
          </div>
          <div class="free-game-title" title="${g.title}">${g.title}</div>
          ${g.originalPrice && g.originalPrice !== 'Бесплатно' ? `
            <div class="free-game-original-price">${g.originalPrice}</div>
          ` : ''}
          ${g.endDate ? `
            <div class="free-game-end-date">⏱ До ${g.endDate}</div>
          ` : ''}

          <!-- Кнопка забрать / статус авто-клейма -->
          ${g.isClaimed ? `
            <div style="
              width:100%;margin-top:10px;padding:9px;
              border-radius:var(--radius-sm);text-align:center;
              border:1px solid rgba(22, 83, 43, 0.8);background:rgba(34, 197, 94, 0.05);
              color:var(--color-accent-green);font-size:13px;font-weight:600;
            ">
              ✅ В библиотеке
            </div>
          ` : (g.canAutoClaim || g.platform?.toLowerCase().includes('epic')) ? (
            (window._currentSettingsCache?.autoClaim?.enabled && (g.steamAppId || (g.platform?.toLowerCase().includes('epic') && window._currentSettingsCache?.autoClaim?.egsEnabled))) ? `
            <div style="
              width:100%;margin-top:10px;padding:9px;
              border-radius:var(--radius-sm);text-align:center;
              border:1px solid rgba(22, 83, 43, 0.8);background:rgba(34, 197, 94, 0.05);
              color:var(--color-accent-green);font-size:12px;
            ">
              ⚡ Авто-получение включено
            </div>
            ` : `
            <button
              id="claim-btn-${g.id}"
              onclick="claimFreeGame('${g.id}', '${g.steamAppId}', '${g.title.replace(/'/g, "\\'")}', '${g.platform}', '${g.url}')"
              style="
                width:100%;margin-top:10px;padding:9px;
                border-radius:var(--radius-sm);cursor:pointer;
                border:1px solid var(--color-accent-green);background:rgba(22, 83, 43, 0.8);
                color:var(--color-accent-green);font-size:13px;font-weight:600;
                display:flex;align-items:center;justify-content:center;gap:6px;
                transition: all var(--transition-fast);
              "
              onmouseover="this.style.background='var(--color-accent-green)';this.style.color='var(--color-bg-base)';"
              onmouseout="this.style.background='rgba(22, 83, 43, 0.8)';this.style.color='var(--color-accent-green)';"
            >
              ⚡ Забрать бесплатно
            </button>
            `
          ) : `
            <a href="${g.url}" target="_blank" style="
              display:block;width:100%;margin-top:10px;padding:9px;
              border-radius:var(--radius-sm);cursor:pointer;text-decoration:none;
              border:1px solid var(--color-border);background:var(--color-bg-surface);
              color:var(--color-text-secondary);font-size:13px;text-align:center;
              transition: all var(--transition-fast);
            " 
            onmouseover="this.style.background='var(--color-bg-hover)';this.style.color='var(--color-text-primary)';"
            onmouseout="this.style.background='var(--color-bg-surface)';this.style.color='var(--color-text-secondary)';"
            onclick="window.electronAuth.openExternal('${g.url}');return false;">
              🔗 Открыть страницу
            </a>
          `}
        </div>
      </div>
    `).join('');

    // Bind click → open in browser
    grid.addEventListener('click', (e) => {
      // Игнорируем клики по кнопкам забрать/открыть, которые уже имеют свои обработчики
      if (e.target.closest('button') || e.target.closest('a')) return;

      const card = e.target.closest('.free-game-card');
      if (card && card.dataset.url) {
        window.electronAuth.openExternal(card.dataset.url);
      }
    });
  }

  // Initial load
  loadGames();

  // Refresh button
  setTimeout(() => {
    const refreshBtn = container.querySelector('#free-games-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => loadGames());
    }
  }, 0);

  // Expose loadGames to window for programmatic refresh (e.g., from settings modal)
  window.refreshFreeGames = loadGames;

  return container;
}

// ──────────────── Settings UI ────────────────

async function renderFreeGamesSettings() {
  const settings = await window.electronAuth.freeGamesGetSettings()

  const modal = document.createElement('div')
  modal.id = 'free-games-settings-modal'
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.75);
    display:flex;align-items:center;justify-content:center;
  `
  modal.onclick = e => { if (e.target === modal) closeFreeGamesSettings() }

  modal.innerHTML = `
    <div style="
      background:#111;border:1px solid var(--color-border);
      border-radius:14px;padding:28px;width:460px;
      max-height:80vh;overflow-y:auto;
    " onclick="event.stopPropagation()">

      <!-- Заголовок -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  margin-bottom:24px;">
        <div style="font-size:17px;font-weight:700;color:var(--color-text-primary);">
          ⚙ Настройки раздач
        </div>
        <button onclick="closeFreeGamesSettings()" style="
          background:none;border:none;color:var(--color-text-secondary);
          font-size:20px;cursor:pointer;
        ">×</button>
      </div>

      <!-- Секция: Платформы -->
      <div style="margin-bottom:24px;">
        <div style="font-size:12px;color:var(--color-text-secondary);font-weight:600;
                    text-transform:uppercase;letter-spacing:1px;
                    margin-bottom:12px;">
          Платформы
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${[
            { key: 'epic',   label: 'Epic Games Store', icon: '🟣' },
            { key: 'steam',  label: 'Steam',            icon: '🔵' },
            { key: 'gog',    label: 'GOG',              icon: '🟤' },
            { key: 'itchio', label: 'itch.io',          icon: '🔴' },
            { key: 'other',  label: 'Другие платформы', icon: '⚪' },
          ].map(p => `
            <label style="
              display:flex;align-items:center;justify-content:space-between;
              padding:10px 14px;border-radius:8px;cursor:pointer;
              border:1px solid ${settings.platforms[p.key] ? '#22c55e33' : '#1e1e1e'};
              background:${settings.platforms[p.key] ? '#0d2b1a' : '#0a0a0a'};
            ">
              <span style="color:var(--color-text-primary);font-size:13px;">
                ${p.icon} ${p.label}
              </span>
              <div
                onclick="togglePlatform('${p.key}', this)"
                style="
                  width:40px;height:22px;border-radius:11px;cursor:pointer;
                  background:${settings.platforms[p.key] ? '#22c55e' : '#333'};
                  position:relative;transition:background 0.2s;
                "
                data-state="${settings.platforms[p.key] ? 'on' : 'off'}"
              >
                <div style="
                  width:18px;height:18px;border-radius:9px;background:#fff;
                  position:absolute;top:2px;
                  left:${settings.platforms[p.key] ? '20px' : '2px'};
                  transition:left 0.2s;
                "></div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Секция: Фильтры -->
      <div style="margin-bottom:24px;">
        <div style="font-size:12px;color:var(--color-text-secondary);font-weight:600;
                    text-transform:uppercase;letter-spacing:1px;
                    margin-bottom:12px;">
          Фильтры
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">

          <!-- Только мгновенные -->
          <label style="
            display:flex;align-items:center;justify-content:space-between;
            padding:12px 14px;border-radius:8px;cursor:pointer;
            border:1px solid #1e1e1e;background:#0a0a0a;
          ">
            <div>
              <div style="color:var(--color-text-primary);font-size:13px;font-weight:500;">
                ⚡ Только мгновенные раздачи
              </div>
              <div style="color:var(--color-text-secondary);font-size:11px;margin-top:3px;">
                Только игры напрямую от Steam/Epic/GOG<br>
                (без ключей со сторонних сайтов)
              </div>
            </div>
            <div
              id="toggle-instant"
              onclick="toggleFilter('onlyInstant', this)"
              style="
                width:40px;height:22px;border-radius:11px;cursor:pointer;
                background:${settings.onlyInstant ? '#22c55e' : '#333'};
                position:relative;transition:background 0.2s;flex-shrink:0;
                margin-left:12px;
              "
              data-state="${settings.onlyInstant ? 'on' : 'off'}"
            >
              <div style="
                width:18px;height:18px;border-radius:9px;background:#fff;
                position:absolute;top:2px;
                left:${settings.onlyInstant ? '20px' : '2px'};
                transition:left 0.2s;
              "></div>
            </div>
          </label>

          <!-- Только игры -->
          <label style="
            display:flex;align-items:center;justify-content:space-between;
            padding:12px 14px;border-radius:8px;cursor:pointer;
            border:1px solid #1e1e1e;background:#0a0a0a;
          ">
            <div>
              <div style="color:var(--color-text-primary);font-size:13px;font-weight:500;">
                🎮 Только игры
              </div>
              <div style="color:var(--color-text-secondary);font-size:11px;margin-top:3px;">
                Исключить DLC, лут и внутриигровые предметы
              </div>
            </div>
            <div
              id="toggle-games"
              onclick="toggleFilter('onlyGames', this)"
              style="
                width:40px;height:22px;border-radius:11px;cursor:pointer;
                background:${settings.onlyGames ? '#22c55e' : '#333'};
                position:relative;transition:background 0.2s;flex-shrink:0;
                margin-left:12px;
              "
              data-state="${settings.onlyGames ? 'on' : 'off'}"
            >
              <div style="
                width:18px;height:18px;border-radius:9px;background:#fff;
                position:absolute;top:2px;
                left:${settings.onlyGames ? '20px' : '2px'};
                transition:left 0.2s;
              "></div>
            </div>
          </label>

        </div>
      </div>

      <!-- Секция: Уведомления -->
      <div style="margin-bottom:24px;">
        <div style="font-size:12px;color:var(--color-text-secondary);font-weight:600;
                    text-transform:uppercase;letter-spacing:1px;
                    margin-bottom:12px;">
          Уведомления
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">

          <label style="
            display:flex;align-items:center;justify-content:space-between;
            padding:12px 14px;border-radius:8px;
            border:1px solid #1e1e1e;background:#0a0a0a;
          ">
            <div>
              <div style="color:var(--color-text-primary);font-size:13px;font-weight:500;">
                🔔 Системные уведомления
              </div>
              <div style="color:var(--color-text-secondary);font-size:11px;margin-top:3px;">
                Получать уведомления о новых бесплатных играх
              </div>
            </div>
            <div
              id="toggle-notifications"
              onclick="toggleFilter('notifications', this)"
              style="
                width:40px;height:22px;border-radius:11px;cursor:pointer;
                background:${settings.notifications ? '#22c55e' : '#333'};
                position:relative;transition:background 0.2s;flex-shrink:0;
                margin-left:12px;
              "
              data-state="${settings.notifications ? 'on' : 'off'}"
            >
              <div style="
                width:18px;height:18px;border-radius:9px;background:#fff;
                position:absolute;top:2px;
                left:${settings.notifications ? '20px' : '2px'};
                transition:left 0.2s;
              "></div>
            </div>
          </label>
        </div>
      </div>

      <!-- Секция: Авто-получение -->
      <div style="margin-bottom:24px;">
        <div style="font-size:12px;color:var(--color-text-secondary);font-weight:600;
                    text-transform:uppercase;letter-spacing:1px;
                    margin-bottom:12px;">
          ⚡ Авто-получение
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">

          <!-- Главный переключатель -->
          <label style="
            display:flex;align-items:center;justify-content:space-between;
            padding:12px 14px;border-radius:8px;
            border:1px solid ${settings.autoClaim?.enabled ? '#22c55e33' : '#1e1e1e'};
            background:${settings.autoClaim?.enabled ? '#0d2b1a' : '#0a0a0a'};
          ">
            <div>
              <div style="color:var(--color-text-primary);font-size:13px;font-weight:600;">
                ⚡ Автоматически забирать игры
              </div>
              <div style="color:var(--color-text-secondary);font-size:11px;margin-top:3px;">
                Бесплатные игры добавляются в библиотеку автоматически
              </div>
            </div>
            <div
              onclick="toggleNestedFilter('autoClaim', 'enabled', this)"
              style="
                width:40px;height:22px;border-radius:11px;cursor:pointer;
                background:${settings.autoClaim?.enabled ? '#22c55e' : '#333'};
                position:relative;transition:background 0.2s;flex-shrink:0;
                margin-left:12px;
              "
              data-state="${settings.autoClaim?.enabled ? 'on' : 'off'}"
            >
              <div style="
                width:18px;height:18px;border-radius:9px;background:#fff;
                position:absolute;top:2px;
                left:${settings.autoClaim?.enabled ? '20px' : '2px'};
                transition:left 0.2s;
              "></div>
            </div>
          </label>

          <!-- Steam Only -->
          <label style="
            display:flex;align-items:center;justify-content:space-between;
            padding:12px 14px;border-radius:8px;cursor:pointer;
            border:1px solid #1e1e1e;background:#0a0a0a;
          ">
            <div style="color:var(--color-text-primary);font-size:13px;">
              🔹 Только Steam (прямые)
            </div>
            <div
              onclick="toggleNestedFilter('autoClaim', 'steamOnly', this)"
              style="
                width:40px;height:22px;border-radius:11px;cursor:pointer;
                background:${settings.autoClaim?.steamOnly ? '#22c55e' : '#333'};
                position:relative;transition:background 0.2s;
              "
              data-state="${settings.autoClaim?.steamOnly ? 'on' : 'off'}"
            >
              <div style="
                width:18px;height:18px;border-radius:9px;background:#fff;
                position:absolute;top:2px;
                left:${settings.autoClaim?.steamOnly ? '20px' : '2px'};
                transition:left 0.2s;
              "></div>
            </div>
          </label>

          <!-- Epic Games (EGS) -->
          <label style="
            display:flex;align-items:center;justify-content:space-between;
            padding:12px 14px;border-radius:8px;cursor:pointer;
            border:1px solid #1e1e1e;background:#0a0a0a;
          ">
            <div>
              <div style="color:var(--color-text-primary);font-size:13px;">
                🔸 Epic Games Store (EGS)
              </div>
              <div style="color:var(--color-text-secondary);font-size:11px;margin-top:3px;">
                Требуется единоразовая авторизация
              </div>
            </div>
            <div
              onclick="toggleEgsAutoClaim(this)"
              style="
                width:40px;height:22px;border-radius:11px;cursor:pointer;
                background:${settings.autoClaim?.egsEnabled ? '#22c55e' : '#333'};
                position:relative;transition:background 0.2s;
              "
              data-state="${settings.autoClaim?.egsEnabled ? 'on' : 'off'}"
            >
              <div style="
                width:18px;height:18px;border-radius:9px;background:#fff;
                position:absolute;top:2px;
                left:${settings.autoClaim?.egsEnabled ? '20px' : '2px'};
                transition:left 0.2s;
              "></div>
            </div>
          </label>

          <!-- Уведомить до получения -->
          <label style="
            display:flex;align-items:center;justify-content:space-between;
            padding:10px 14px;border-radius:8px;
            border:1px solid #1e1e1e;background:#0a0a0a;
            opacity:${settings.autoClaim?.enabled ? '1' : '0.4'};
          " data-autoclaim-child>
            <div style="color:var(--color-text-primary);font-size:13px;">
              🔔 Уведомить перед получением
            </div>
            <div
              onclick="if(_pendingSettings.autoClaim?.enabled ?? ${settings.autoClaim?.enabled}) toggleNestedFilter('autoClaim','notifyBefore',this)"
              style="
                width:40px;height:22px;border-radius:11px;
                cursor:${settings.autoClaim?.enabled ? 'pointer' : 'not-allowed'};
                background:${settings.autoClaim?.notifyBefore ? '#22c55e' : '#333'};
                position:relative;transition:background 0.2s;
                flex-shrink:0;margin-left:12px;
              "
              data-state="${settings.autoClaim?.notifyBefore ? 'on' : 'off'}"
              data-autoclaim-toggle="notifyBefore"
            >
              <div style="
                width:18px;height:18px;border-radius:9px;background:#fff;
                position:absolute;top:2px;
                left:${settings.autoClaim?.notifyBefore ? '20px' : '2px'};
                transition:left 0.2s;
              "></div>
            </div>
          </label>

          <!-- Уведомить после получения -->
          <label style="
            display:flex;align-items:center;justify-content:space-between;
            padding:10px 14px;border-radius:8px;
            border:1px solid #1e1e1e;background:#0a0a0a;
            opacity:${settings.autoClaim?.enabled ? '1' : '0.4'};
          " data-autoclaim-child>
            <div style="color:var(--color-text-primary);font-size:13px;">
              ✅ Уведомить после получения
            </div>
            <div
              onclick="if(_pendingSettings.autoClaim?.enabled ?? ${settings.autoClaim?.enabled}) toggleNestedFilter('autoClaim','notifyAfter',this)"
              style="
                width:40px;height:22px;border-radius:11px;
                cursor:${settings.autoClaim?.enabled ? 'pointer' : 'not-allowed'};
                background:${settings.autoClaim?.notifyAfter ? '#22c55e' : '#333'};
                position:relative;transition:background 0.2s;
                flex-shrink:0;margin-left:12px;
              "
              data-state="${settings.autoClaim?.notifyAfter ? 'on' : 'off'}"
              data-autoclaim-toggle="notifyAfter"
            >
              <div style="
                width:18px;height:18px;border-radius:9px;background:#fff;
                position:absolute;top:2px;
                left:${settings.autoClaim?.notifyAfter ? '20px' : '2px'};
                transition:left 0.2s;
              "></div>
            </div>
          </label>

        </div>
      </div>

      <!-- Интервал проверки -->
      <div style="
        padding:12px 14px;border-radius:8px;
        border:1px solid #1e1e1e;background:#0a0a0a;
        margin-bottom:24px;
      ">
        <div style="color:var(--color-text-primary);font-size:13px;font-weight:500;
                    margin-bottom:10px;">
          ⏱ Проверять каждые
        </div>
        <div style="display:flex;gap:6px;">
          ${[1, 3, 6, 12, 24].map(h => `
            <button
              id="interval-${h}"
              onclick="setCheckInterval(${h})"
              style="
                padding:6px 12px;border-radius:6px;cursor:pointer;
                font-size:12px;
                border:     1px solid ${settings.checkInterval === h ? '#22c55e' : '#1e1e1e'};
                background: ${settings.checkInterval === h ? '#16532b' : '#111'};
                color:      ${settings.checkInterval === h ? '#22c55e' : '#555'};
              "
            >${h}ч</button>
          `).join('')}
        </div>
      </div>

      <!-- Кнопки -->
      <div style="display:flex;gap:10px;">
        <button onclick="closeFreeGamesSettings()" style="
          flex:1;padding:11px;border-radius:8px;cursor:pointer;
          border:1px solid #1e1e1e;background:#111;color:var(--color-text-secondary);
        ">Отмена</button>
        <button onclick="saveFreeGamesSettings()" style="
          flex:2;padding:11px;border-radius:8px;cursor:pointer;
          border:1px solid #22c55e;background:#16532b;
          color:#22c55e;font-size:14px;font-weight:600;
        ">Сохранить</button>
      </div>
    </div>
  `

  document.body.appendChild(modal)
}

// Хранить изменения локально до сохранения
let _pendingSettings = null

async function initPendingSettings() {
  if (!_pendingSettings) {
    _pendingSettings = await window.electronAuth.freeGamesGetSettings()
  }
}

async function togglePlatform(key, el) {
  await initPendingSettings()
  const isOn = el.dataset.state === 'on'
  _pendingSettings.platforms[key] = !isOn
  el.dataset.state   = isOn ? 'off' : 'on'
  el.style.background = isOn ? '#333' : '#22c55e'
  el.querySelector('div').style.left = isOn ? '2px' : '20px'

  // Обновить стиль строки
  const row = el.closest('label')
  if (row) {
    row.style.borderColor = isOn ? '#1e1e1e' : '#22c55e33'
    row.style.background  = isOn ? '#0a0a0a'  : '#0d2b1a'
  }
}

async function toggleFilter(key, el) {
  await initPendingSettings()
  const isOn = el.dataset.state === 'on'
  _pendingSettings[key] = !isOn
  el.dataset.state    = isOn ? 'off' : 'on'
  el.style.background  = isOn ? '#333' : '#22c55e'
  el.querySelector('div').style.left = isOn ? '2px' : '20px'
}

async function setCheckInterval(hours) {
  await initPendingSettings()
  _pendingSettings.checkInterval = hours

  // Обновить стили кнопок
  ;[1, 3, 6, 12, 24].forEach(h => {
    const btn = document.getElementById(`interval-${h}`)
    if (!btn) return
    const active = h === hours
    btn.style.borderColor = active ? '#22c55e' : '#1e1e1e'
    btn.style.background  = active ? '#16532b' : '#111'
    btn.style.color       = active ? '#22c55e' : '#555'
  })
}

async function saveFreeGamesSettings() {
  if (!_pendingSettings) return

  await window.electronAuth.freeGamesSaveSettings(_pendingSettings)
  _pendingSettings = null
  closeFreeGamesSettings()

  // Обновить список с новыми настройками
  if (window.refreshFreeGames) {
    await window.refreshFreeGames()
  }
}

function closeFreeGamesSettings() {
  document.getElementById('free-games-settings-modal')?.remove()
  _pendingSettings = null
}

// ──────────────── Storage & Toggles ────────────────

async function toggleEgsAutoClaim(el) {
  await initPendingSettings()
  const isOn = el.dataset.state === 'on'

  if (!isOn) {
    // Turning ON → check session
    const hasSession = await window.electronAuth.egsCheckSession()
    if (!hasSession) {
      toast.show('Для авто-получения EGS нужна авторизация. Открываю окно входа...', 'info')
      const result = await window.electronAuth.egsLogin()
      if (result.error || !result.success) {
        toast.show('Вход не выполнен: ' + (result.error || 'Отменено'), 'error')
        return
      }
      toast.show('Авторизация в Epic Games Store прошла успешно!', 'success')
    }
  }

  if (!_pendingSettings.autoClaim) _pendingSettings.autoClaim = {}
  _pendingSettings.autoClaim.egsEnabled = !isOn

  el.dataset.state    = isOn ? 'off' : 'on'
  el.style.background = isOn ? '#333' : '#22c55e'
  el.querySelector('div').style.left = isOn ? '2px' : '20px'
}

async function toggleNestedFilter(group, key, el) {
  await initPendingSettings()
  const isOn = el.dataset.state === 'on'

  // Убедиться что вложенная группа существует
  if (!_pendingSettings[group]) _pendingSettings[group] = {}
  _pendingSettings[group][key] = !isOn

  el.dataset.state    = isOn ? 'off' : 'on'
  el.style.background = isOn ? '#333' : '#22c55e'
  el.querySelector('div').style.left = isOn ? '2px' : '20px'

  // Если выключили autoClaim.enabled — затемнить дочерние
  if (group === 'autoClaim' && key === 'enabled') {
    const isNowOn = !isOn;
    
    // Update label visual highlighting
    const parentLabel = el.closest('label');
    if (parentLabel) {
      parentLabel.style.border     = `1px solid ${isNowOn ? '#22c55e33' : '#1e1e1e'}`;
      parentLabel.style.background = isNowOn ? '#0d2b1a' : '#0a0a0a';
    }

    // Toggle opacity & cursors of child settings
    document.querySelectorAll('[data-autoclaim-child]').forEach(child => {
      child.style.opacity = isNowOn ? '1' : '0.4';
      const toggler = child.querySelector('[data-autoclaim-toggle]');
      if (toggler) toggler.style.cursor = isNowOn ? 'pointer' : 'not-allowed';
    })
  }
}

window.renderFreeGamesSettings = renderFreeGamesSettings
window.closeFreeGamesSettings  = closeFreeGamesSettings
window.saveFreeGamesSettings   = saveFreeGamesSettings
window.togglePlatform          = togglePlatform
window.toggleFilter            = toggleFilter
window.setCheckInterval        = setCheckInterval
window.toggleNestedFilter      = toggleNestedFilter
window.toggleEgsAutoClaim       = toggleEgsAutoClaim


// ──────────────── Auto Claim ────────────────

async function claimFreeGame(gameId, steamAppId, title, platform, url) {
  const btn = document.getElementById(`claim-btn-${gameId}`)
  if (!btn) return

  // Заблокировать кнопку
  btn.disabled    = true
  btn.textContent = '⏳ Добавляю...'
  btn.style.borderColor = '#f59e0b'
  btn.style.background  = '#1a1200'
  btn.style.color       = '#f59e0b'

  let result;
  if (platform?.toLowerCase().includes('epic')) {
    result = await window.electronAuth.egsClaim({ url });
  } else {
    result = await window.electronAuth.steamClaimFreeGame({
      appId: steamAppId
    })
  }

  // Handle errors / API failures
  if (result.error) {
    btn.textContent       = `✗ ${result.error}`
    btn.style.borderColor = '#f87171'
    btn.style.background  = '#1a0a0a'
    btn.style.color       = '#f87171'
    btn.disabled          = false
    toast.show(`Ошибка: ${result.error}`, 'error')
    return
  }

  // Already owned response detail=9 
  if (result.alreadyOwned) {
    btn.textContent       = '✓ Уже в библиотеке'
    btn.style.borderColor = '#555'
    btn.style.background  = '#111'
    btn.style.color       = '#555'
    toast.show(`"${title}" уже есть в библиотеке`, 'info')
    return
  }

  // Success 200
  if (result.success) {
    btn.textContent       = '✓ Добавлено в библиотеку!'
    btn.style.borderColor = '#22c55e'
    btn.style.background  = '#0d2b1a'
    btn.style.color       = '#22c55e'

    toast.show(`"${title}" успешно добавлена!`, 'success')
    console.log(`[claim] Successfully claimed: ${title}`)
  } else {
    btn.textContent       = `✗ ${result.msg || 'Ошибка'}`
    btn.style.borderColor = '#f87171'
    btn.style.background  = '#1a0a0a'
    btn.style.color       = '#f87171'
    btn.disabled          = false
    toast.show(`Ошибка: ${result.msg || 'Не удалось забрать'}`, 'error')
  }
}

window.claimFreeGame = claimFreeGame

