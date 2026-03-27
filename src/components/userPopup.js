import storage from '../utils/storage.js';
import store from '../store/index.js';
import router from '../router/index.js';
import { createDropdown } from './dropdown.js';

export function createUserPopup() {
  const container = document.createElement('div');
  container.className = 'user-popup-overlay';

  // State subscription
  store.subscribe('settingsOpen', (isOpen) => {
    if (isOpen) {
      container.setAttribute('data-open', 'true');
      loadFormData();
    } else {
      container.removeAttribute('data-open');
    }
  });

  container.innerHTML = `
    <div class="user-popup-content">
      <div class="popup-header">
        <h2>Settings & Accounts</h2>
        <button class="close-btn" id="popup-close">×</button>
      </div>
      
      <div class="popup-body">
        <section class="settings-section">
          <h3>Account</h3>
          <div class="account-summary" id="account-summary">
            <!-- Populated by JS -->
          </div>
        </section>

        <section class="settings-section">
          <h3>Steam Integration</h3>
          <p class="settings-desc">Enter your Steam credentials to fetch your library and wishlist.</p>
          
          <div class="input-group">
            <label for="steam-id">SteamID64</label>
            <input type="text" id="steam-id" placeholder="e.g. 76561198000000000" />
          </div>
        </section>

        <section class="settings-section">
          <h3>Preferences</h3>
          <div class="input-group row-group">
            <label>Theme</label>
            <div id="theme-dropdown-container"></div>
          </div>
          <div class="input-group row-group">
            <label>Language</label>
            <div id="lang-dropdown-container"></div>
          </div>
          <div class="input-group row-group">
            <label>Действие при закрытии (X)</label>
            <div id="close-dropdown-container"></div>
          </div>
          <div class="input-group row-group">
            <label for="startup-toggle" style="cursor: pointer;">Запускать при старте Windows</label>
            <input type="checkbox" id="startup-toggle" style="width: 20px; height: 20px; cursor: pointer; margin: 0;" />
          </div>
          <div class="input-group row-group" id="startup-minimized-group" style="display: none;">
            <label for="startup-minimized-toggle" style="cursor: pointer; padding-left: 10px; color: var(--color-text-secondary);">Сворачивать в трей при запуске</label>
            <input type="checkbox" id="startup-minimized-toggle" style="width: 20px; height: 20px; cursor: pointer; margin: 0;" />
          </div>
        </section>

        <section class="settings-section">
          <h3>Auto-Farm</h3>
          <p class="settings-desc">Параметры двухфазного фарма карточек (Idle Master Extended)</p>
          <div class="input-group row-group">
            <label for="fc-p1-max">Макс. игр в прогреве</label>
            <input type="number" id="fc-p1-max" min="1" max="30" value="30" style="width: 70px;" title="Максимум игр одновременно в фазе прогрева (1-30)" />
          </div>
          <div class="input-group row-group">
            <label for="fc-p1-interval">Проверка прогрева (мин)</label>
            <input type="number" id="fc-p1-interval" min="5" max="30" value="10" style="width: 70px;" title="Интервал проверки наигранных часов (5-30 мин)" />
          </div>
          <div class="input-group row-group">
            <label for="fc-p1-threshold">Порог часов</label>
            <input type="number" id="fc-p1-threshold" min="0.5" max="5" step="0.5" value="2" style="width: 70px;" title="Минимум часов для разблокировки дропа карточек (0.5-5)" />
          </div>
          <div class="input-group row-group">
            <label for="fc-p2-restart">Перезапуск фарма (мин)</label>
            <input type="number" id="fc-p2-restart" min="1" max="15" value="5" style="width: 70px;" title="Интервал перезапуска игры в фазе фарма (1-15 мин)" />
          </div>
          <div class="input-group row-group">
            <label for="fc-p2-stall">Таймаут без дропа (мин)</label>
            <input type="number" id="fc-p2-stall" min="10" max="60" value="30" style="width: 70px;" title="Если нет дропа N минут — пропустить игру (10-60 мин)" />
          </div>
        </section>

        <section class="settings-section" style="margin-bottom: 0;">
          <h3 style="text-transform: uppercase;">О приложении</h3>
          <div class="account-summary" style="flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <span style="font-weight: 500;">Версия</span>
              <span id="app-version-popup" style="color: var(--color-text-primary);">загрузка...</span>
            </div>
            <div style="height: 1px; background: var(--color-border); margin: 0;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 500;">Обновления</span>
                <span id="update-status-popup" class="settings-desc" style="margin-bottom: 0; margin-top: 4px;">—</span>
              </div>
              <button id="btn-check-update-popup" class="btn-check-update">Проверить обновление</button>
            </div>
          </div>
        </section>
      </div>
      
      <div class="popup-footer">
        <button id="logout-btn" style="margin-right: auto; padding: 8px 16px; background: var(--color-danger); color: #fff; border: none; border-radius: var(--radius-sm); cursor: pointer;">Logout</button>
        <button id="save-settings" class="btn-primary">Save Changes</button>
      </div>
    </div>
  `;

  // Attach styles dynamically for encapsulation
  const style = document.createElement('style');
  style.textContent = `
    .user-popup-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(4px);
      display: none; /* Hidden by default */
      justify-content: center;
      align-items: center;
      z-index: 10001;
    }
    .user-popup-overlay[data-open="true"] {
      display: flex; /* Show when data-open is true */
    }
    .user-popup-content {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      width: 440px;
      max-width: 90vw;
      box-shadow: var(--shadow-md);
      display: flex;
      flex-direction: column;
    }
    .popup-header {
      padding: var(--spacing-lg);
      border-bottom: 1px solid var(--color-border);
      background: rgba(255, 255, 255, 0.02);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .popup-header h2 { margin: 0; font-size: 1.15rem; font-weight: 600; letter-spacing: -0.01em; }
    .close-btn {
      background: transparent; border: none; font-size: 1.5rem; line-height: 1; padding: 0 4px; color: var(--color-text-secondary); border-radius: var(--radius-sm);
    }
    .close-btn:hover { color: var(--color-text-primary); background: var(--color-bg-surface-light); }
    
    .popup-body {
      padding: var(--spacing-lg);
      max-height: 60vh;
      overflow-y: auto;
    }
    .settings-section {
      margin-bottom: var(--spacing-xl);
    }
    .account-summary {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px;
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      margin-bottom: var(--spacing-lg);
    }
    .account-avatar {
      width: 48px; height: 48px; border-radius: var(--radius-sm);
      background-size: cover; background-position: center; background-repeat: no-repeat;
      background-color: var(--color-border);
      border: 1px solid var(--color-border);
    }
    .account-details {
      display: flex; flex-direction: column; flex: 1; overflow: hidden;
    }
    .account-name { font-weight: 600; font-size: 1rem; color: var(--color-text-primary); white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
    .account-id { font-size: 0.8rem; color: var(--color-text-secondary); font-family: monospace; margin-top: 2px; }
    .account-status {
      font-size: 0.8rem; font-weight: 500; display: flex; align-items: center; gap: 4px; border-left: 1px solid var(--color-border); padding-left: 16px;
    }
    .status-ok { color: var(--color-success); }
    .status-error { color: var(--color-danger); }
    .settings-section h3 {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: var(--spacing-xs);
      margin-top: 0;
    }
    .settings-desc {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      margin-bottom: var(--spacing-md);
    }
    .input-group {
      display: flex;
      flex-direction: column;
      margin-bottom: var(--spacing-md);
    }
    .row-group {
      flex-direction: row; align-items: center; justify-content: space-between;
      padding: 8px 0;
    }
    .input-group label {
      font-size: 0.85rem; font-weight: 500; margin-bottom: 6px; color: var(--color-text-secondary);
    }
    .input-group input {
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      color: var(--color-text-primary);
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      font-family: inherit; font-size: 0.9rem;
      transition: border-color var(--transition-fast);
      outline: none;
    }
    .input-group input:focus {
      border-color: var(--color-action-primary);
    }
    .popup-footer {
      padding: var(--spacing-md) var(--spacing-lg);
      border-top: 1px solid var(--color-border);
      background: rgba(255, 255, 255, 0.02);
      display: flex;
      justify-content: flex-end;
    }
    .btn-primary {
      background: var(--color-action-primary); color: var(--color-bg-base); font-weight: 500; border: none; border-radius: var(--radius-sm); padding: 8px 16px;
    }
    .btn-primary:hover { background: var(--color-action-hover); }
    
    .btn-check-update {
      padding: 8px 16px;
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: rgba(255,255,255,0.03);
      color: var(--color-text-primary);
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }
    .btn-check-update:hover:not(:disabled) {
      background: rgba(255,255,255,0.08);
      border-color: var(--color-action-primary);
    }
    .btn-check-update:active:not(:disabled) {
      transform: scale(0.97);
    }
    .btn-check-update:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .update-available { color: var(--color-action-primary); }
    .update-ok        { color: var(--color-success, #4caf50); }
    .update-error     { color: var(--color-danger,  #f44336); }
  `;
  container.appendChild(style);

  // Initialize dropdowns
  const themeDropdown = createDropdown({
    id: 'theme-select',
    options: [
      { value: 'dark', label: 'Dark (Yin)' },
      { value: 'light', label: 'Light (Yang)' }
    ],
    selectedValue: 'dark'
  });
  container.querySelector('#theme-dropdown-container').appendChild(themeDropdown);

  const langDropdown = createDropdown({
    id: 'lang-select',
    options: [
      { value: 'en', label: 'English' },
      { value: 'ru', label: 'Русский' }
    ],
    selectedValue: 'en'
  });
  container.querySelector('#lang-dropdown-container').appendChild(langDropdown);

  const closeDropdown = createDropdown({
    id: 'close-select',
    options: [
      { value: 'prompt', label: 'Спросить' },
      { value: 'tray', label: 'Свернуть в трей' },
      { value: 'quit', label: 'Закрыть полностью' }
    ],
    selectedValue: 'prompt'
  });
  container.querySelector('#close-dropdown-container').appendChild(closeDropdown);

  // Bind Events
  const closeBtn = container.querySelector('#popup-close');
  // Close modal logic
  closeBtn.addEventListener('click', () => {
    store.set('settingsOpen', false);
  });
  
  // Startup toggle logic
  container.querySelector('#startup-toggle').addEventListener('change', (e) => {
    container.querySelector('#startup-minimized-group').style.display = e.target.checked ? 'flex' : 'none';
  });
  
  container.addEventListener('click', (e) => {
    if (e.target === container) store.set('settingsOpen', false);
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.get('settingsOpen')) {
      store.set('settingsOpen', false);
    }
  });

  container.querySelector('#logout-btn').addEventListener('click', () => {
    store.logout();
    store.set('settingsOpen', false);
    window.location.reload();
  });

  // Update logic
  const initUpdateLogic = async () => {
    try {
      const version = await window.electronAuth.getAppVersion();
      const versionEl = container.querySelector('#app-version-popup');
      if (versionEl) versionEl.textContent = `v${version}`;
    } catch (e) {
      console.error('Failed to fetch app version', e);
    }

    const btn = container.querySelector('#btn-check-update-popup');
    const statusEl = container.querySelector('#update-status-popup');

    if (btn && statusEl) {
      btn.addEventListener('click', async () => {
        if (btn.dataset.action === 'install') {
          window.electronAuth.installUpdate();
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Проверяем...';
        statusEl.textContent = '';
        statusEl.className = 'settings-desc';

        try {
          const result = await window.electronAuth.checkUpdate();

          if (result.status === 'available') {
            statusEl.textContent = `Доступна версия ${result.version}`;
            statusEl.classList.add('update-available');
            btn.textContent = 'Установить и перезапустить';
            btn.disabled = false;
            btn.dataset.action = 'install';
          } else if (result.status === 'not-available') {
            statusEl.textContent = 'Установлена последняя версия';
            statusEl.classList.add('update-ok');
            btn.textContent = 'Проверить обновление';
            btn.disabled = false;
          } else {
            statusEl.textContent = `Ошибка: ${result.message}`;
            statusEl.classList.add('update-error');
            btn.textContent = 'Попробовать снова';
            btn.disabled = false;
          }
        } catch (e) {
          statusEl.textContent = 'Не удалось проверить обновление';
          statusEl.classList.add('update-error');
          btn.textContent = 'Попробовать снова';
          btn.disabled = false;
        }
      });
    }
  };
  initUpdateLogic();

  container.querySelector('#save-settings').addEventListener('click', () => {
    const steamId = container.querySelector('#steam-id').value.trim();
    const theme = themeDropdown.__getValue();
    const lang = langDropdown.__getValue();

    // Read farm config
    const farmConfig = {
      phase1_max_concurrent: Math.max(1, Math.min(30, parseInt(container.querySelector('#fc-p1-max').value) || 30)),
      phase1_check_interval: Math.max(5, Math.min(30, parseInt(container.querySelector('#fc-p1-interval').value) || 10)),
      phase1_hours_threshold: Math.max(0.5, Math.min(5, parseFloat(container.querySelector('#fc-p1-threshold').value) || 2)),
      phase2_restart_interval: Math.max(1, Math.min(15, parseInt(container.querySelector('#fc-p2-restart').value) || 5)),
      phase2_stall_timeout: Math.max(10, Math.min(60, parseInt(container.querySelector('#fc-p2-stall').value) || 30)),
    };

    const closeBehavior = closeDropdown.__getValue();
    const startMinimized = container.querySelector('#startup-minimized-toggle').checked;
    const runOnStartup = container.querySelector('#startup-toggle').checked;

    if (steamId) {
      store.loginManual({ steamId });
    }
    
    // Save preferences
    const prefs = storage.get('preferences') || {};
    prefs.theme = theme;
    prefs.lang = lang;
    if (closeBehavior === 'prompt') delete prefs.closeBehavior;
    else prefs.closeBehavior = closeBehavior;
    prefs.startMinimized = startMinimized;
    
    storage.set('preferences', prefs);
    storage.set('farmConfig', farmConfig);
    
    // Apply startup settings backend
    if (window.electronAuth && window.electronAuth.setStartupSettings) {
      window.electronAuth.setStartupSettings({
        openAtLogin: runOnStartup,
        openAsHidden: startMinimized
      });
    }
    
    store.set('theme', theme);
    store.set('lang', lang);
    store.set('farmConfig', farmConfig);
    store.set('steamCredentialsUpdated', Date.now()); // trigger re-fetch if needed

    store.set('settingsOpen', false);
    
    // Fetch profile with new credentials and refresh current view in background
    store.fetchUserProfile();
    if (store.get('currentRoute')) {
      router.handleRoute(store.get('currentRoute'));
    }
  });

  function loadFormData() {
    const creds = storage.getDecrypted('steam_credentials') || {};
    const prefs = storage.get('preferences') || { theme: 'dark', lang: 'en' };
    const fc = storage.get('farmConfig') || {};
    
    container.querySelector('#steam-id').value = creds.steamId || '';
    container.querySelector('#fc-p1-max').value = fc.phase1_max_concurrent ?? 30;
    container.querySelector('#fc-p1-interval').value = fc.phase1_check_interval ?? 10;
    container.querySelector('#fc-p1-threshold').value = fc.phase1_hours_threshold ?? 2;
    container.querySelector('#fc-p2-restart').value = fc.phase2_restart_interval ?? 5;
    container.querySelector('#fc-p2-stall').value = fc.phase2_stall_timeout ?? 30;
    
    const user = store.get('user');
    const summaryContainer = container.querySelector('#account-summary');
    
    if (user) {
      summaryContainer.innerHTML = `
        <div class="account-avatar" style="background-image: url('${user.avatar || ''}')"></div>
        <div class="account-details">
          <div class="account-name">${user.name || 'Unknown'}</div>
          <div class="account-id">ID: ${user.steamId || creds.steamId || 'N/A'}</div>
        </div>
        <div class="account-status status-ok">
          ✅ Connected
        </div>
      `;
      summaryContainer.style.display = 'flex';
    } else {
      if (creds.steamId) {
        summaryContainer.innerHTML = `
          <div class="account-avatar"></div>
          <div class="account-details">
            <div class="account-name">Not Connected</div>
            <div class="account-id">ID: ${creds.steamId || 'N/A'}</div>
          </div>
          <div class="account-status status-error">
            ❌ Error Fetching
          </div>
        `;
        summaryContainer.style.display = 'flex';
      } else {
         summaryContainer.style.display = 'none';
      }
    }
    
    if (themeDropdown.__updateValue) themeDropdown.__updateValue(prefs.theme || 'dark');
    if (langDropdown.__updateValue) langDropdown.__updateValue(prefs.lang || 'en');
    if (closeDropdown.__updateValue) closeDropdown.__updateValue(prefs.closeBehavior || 'prompt');
    
    // Fetch and load startup settings from Electron Backend
    if (window.electronAuth && window.electronAuth.getStartupSettings) {
      window.electronAuth.getStartupSettings().then(settings => {
        const toggle = container.querySelector('#startup-toggle');
        const minToggle = container.querySelector('#startup-minimized-toggle');
        const minGroup = container.querySelector('#startup-minimized-group');
        
        toggle.checked = settings.openAtLogin;
        minToggle.checked = prefs.startMinimized || false;
        minGroup.style.display = settings.openAtLogin ? 'flex' : 'none';
      }).catch(err => console.error('Failed to get startup settings:', err));
    }
  }

  return container;
}
