import { icons } from '../utils/icons.js';
import storage from '../utils/storage.js';
import store from '../store/index.js';
import router from '../router/index.js';
import { createDropdown } from './dropdown.js';
import toast from '../utils/toast.js';

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
        <section class="settings-section" id="set-sec-account">
          <h3>Account</h3>
          <div class="account-summary" id="account-summary">
            <!-- Populated by JS -->
          </div>
        </section>

        <section class="settings-section" id="set-sec-integration">
          <h3>Steam Integration</h3>
          <p class="settings-desc">Enter your Steam credentials to fetch your library and wishlist.</p>
          
          <div class="input-group">
            <label for="steam-id">SteamID64</label>
            <input type="text" id="steam-id" placeholder="e.g. 76561198000000000" />
          </div>
        </section>

        <section class="settings-section" id="set-sec-preferences">
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

        <section class="settings-section" id="set-sec-backup">
          <h3>Backup & Restore</h3>
          <p class="settings-desc">Экспортируйте или импортируйте настройки и данные приложения.</p>
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button id="export-btn-popup" style="
              flex: 1; padding: 10px 12px;
              background: rgba(255,255,255,0.03);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-sm);
              color: var(--color-text-primary);
              font-size: 0.85rem; font-family: inherit;
              cursor: pointer;
              transition: all var(--transition-fast);
            ">Экспорт</button>
            <button id="import-btn-popup" style="
              flex: 1; padding: 10px 12px;
              background: rgba(255,255,255,0.03);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-sm);
              color: var(--color-text-primary);
              font-size: 0.85rem; font-family: inherit;
              cursor: pointer;
              transition: all var(--transition-fast);
            ">Импорт</button>
          </div>
        </section>

        <section class="settings-section" id="set-sec-autofarm">
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

        <section class="settings-section" id="set-sec-about" style="margin-bottom: 0;">
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
            <div style="height: 1px; background: var(--color-border); margin: 0;"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
              <span style="font-weight: 500;">Авто-загрузка обновлений</span>
              <label class="toggle-switch">
                <input type="checkbox" id="auto-update-toggle">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </section>

        <div style="height:1px;background:rgba(255,255,255,0.08);margin:8px 0"></div>
        <button id="btn-send-report" style="
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 10px 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text-secondary);
          font-size: 0.85rem; font-family: inherit;
          cursor: pointer;
          transition: all var(--transition-fast);
        ">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Отправить отчёт</span>
        </button>
      </div>
      
      <div class="popup-footer">
        <button id="logout-btn" style="margin-right: auto; padding: 8px 16px; background: var(--color-danger); color: #fff; border: none; border-radius: var(--radius-sm); cursor: pointer;">Logout</button>
        <button id="save-settings" class="btn-primary">Save Changes</button>
      </div>
    </div>
  `;



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

  // Backup & Restore button handlers
  const exportBtnPopup = container.querySelector('#export-btn-popup');
  const importBtnPopup = container.querySelector('#import-btn-popup');

  if (exportBtnPopup) {
    exportBtnPopup.addEventListener('mouseenter', () => {
      exportBtnPopup.style.background = 'rgba(255,255,255,0.08)';
      exportBtnPopup.style.borderColor = 'var(--color-action-primary)';
    });
    exportBtnPopup.addEventListener('mouseleave', () => {
      exportBtnPopup.style.background = 'rgba(255,255,255,0.03)';
      exportBtnPopup.style.borderColor = 'var(--color-border)';
    });
    exportBtnPopup.addEventListener('click', async () => {
      try {
        const auth = store.get('auth');
        const steamId = auth?.steamId || store.get('user')?.steamId || null;
        exportBtnPopup.disabled = true;

        const result = await window.electronAuth.backupExport(steamId);
        if (result.success) {
          toast.show('Резервная копия успешно создана!', 'success');
        } else if (result.reason !== 'cancelled') {
          toast.show(`Ошибка экспорта: ${result.error}`, 'error');
        }
      } catch (err) {
        console.error(err);
        toast.show('Ошибка экспорта данных', 'error');
      } finally {
        exportBtnPopup.disabled = false;
      }
    });
  }

  if (importBtnPopup) {
    importBtnPopup.addEventListener('mouseenter', () => {
      importBtnPopup.style.background = 'rgba(255,255,255,0.08)';
      importBtnPopup.style.borderColor = 'var(--color-action-primary)';
    });
    importBtnPopup.addEventListener('mouseleave', () => {
      importBtnPopup.style.background = 'rgba(255,255,255,0.03)';
      importBtnPopup.style.borderColor = 'var(--color-border)';
    });
    importBtnPopup.addEventListener('click', async () => {
      try {
        const auth = store.get('auth');
        const steamId = auth?.steamId || store.get('user')?.steamId || null;
        importBtnPopup.disabled = true;

        const result = await window.electronAuth.backupImport(steamId);
        if (result.success) {
          toast.show('Данные успешно импортированы!', 'success');
          store.set('settingsOpen', false);
          await window.electronAuth.clearSessions();
          alert('Импорт успешно завершен! В целях безопасности все сессии сброшены. Пожалуйста, войдите в Steam и Epic Games Store заново.');
          window.location.reload();
        } else if (result.reason !== 'cancelled') {
          alert(`Не удалось импортировать данные: ${result.error}`);
        }
      } catch (err) {
        console.error(err);
        toast.show('Ошибка импорта данных', 'error');
      } finally {
        importBtnPopup.disabled = false;
      }
    });
  }
  
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

  container.querySelector('#logout-btn').addEventListener('click', async () => {
    store.set('settingsOpen', false);
    await store.logout();
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

  // Report button logic
  const reportBtn = container.querySelector('#btn-send-report');
  if (reportBtn) {
    reportBtn.addEventListener('mouseenter', () => {
      reportBtn.style.background = 'rgba(255,255,255,0.08)';
      reportBtn.style.borderColor = 'var(--color-action-primary)';
      reportBtn.style.color = 'var(--color-text-primary)';
    });
    reportBtn.addEventListener('mouseleave', () => {
      reportBtn.style.background = 'rgba(255,255,255,0.03)';
      reportBtn.style.borderColor = 'var(--color-border)';
      reportBtn.style.color = 'var(--color-text-secondary)';
    });
    reportBtn.addEventListener('click', async () => {
      reportBtn.disabled = true;
      reportBtn.style.opacity = '0.6';
      reportBtn.querySelector('span').textContent = 'Отправка...';

      const result = await window.electronAuth.sendReport();

      if (result.ok) {
        reportBtn.querySelector('span').textContent = '✓ Отправлено';
        reportBtn.style.color = 'var(--color-success, #4caf50)';
      } else {
        reportBtn.querySelector('span').textContent = '✗ Ошибка';
        reportBtn.style.color = 'var(--color-danger, #f44336)';
        console.error('[sendReport]', result.error);
      }

      setTimeout(() => {
        reportBtn.disabled = false;
        reportBtn.style.opacity = '1';
        reportBtn.querySelector('span').textContent = 'Отправить отчёт';
        reportBtn.style.color = 'var(--color-text-secondary)';
      }, 3000);
    });
  }

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
    const autoUpdate = container.querySelector('#auto-update-toggle').checked;

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
    prefs.autoDownloadUpdates = autoUpdate;
    window.electronAuth.setAutoDownload?.(autoUpdate);
    
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
    const isAuth = store.get('isAuthenticated');
    const secAccount = container.querySelector('#set-sec-account');
    const secIntegration = container.querySelector('#set-sec-integration');
    const secFarm = container.querySelector('#set-sec-autofarm');
    const logoutBtn = container.querySelector('#logout-btn');
    
    if (secAccount) secAccount.style.display = isAuth ? 'block' : 'none';
    if (secIntegration) secIntegration.style.display = isAuth ? 'block' : 'none';
    if (secFarm) secFarm.style.display = isAuth ? 'block' : 'none';
    if (logoutBtn) logoutBtn.style.display = isAuth ? 'block' : 'none';

    const creds = storage.getDecrypted('steam_credentials') || {};
    const prefs = storage.get('preferences') || { theme: 'dark', lang: 'en' };
    const fc = storage.get('farmConfig') || {};
    
    container.querySelector('#steam-id').value = creds.steamId || '';
    container.querySelector('#fc-p1-max').value = fc.phase1_max_concurrent ?? 30;
    container.querySelector('#fc-p1-interval').value = fc.phase1_check_interval ?? 10;
    container.querySelector('#fc-p1-threshold').value = fc.phase1_hours_threshold ?? 2;
    container.querySelector('#fc-p2-restart').value = fc.phase2_restart_interval ?? 5;
    container.querySelector('#fc-p2-stall').value = fc.phase2_stall_timeout ?? 30;
    
    const autoUpdateToggle = container.querySelector('#auto-update-toggle');
    if (autoUpdateToggle) autoUpdateToggle.checked = !!prefs.autoDownloadUpdates;
    
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
          ${icons.check} Connected
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
            ${icons.error} Error Fetching
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
