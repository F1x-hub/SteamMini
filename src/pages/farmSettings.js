import toast from '../utils/toast.js';

export function renderFarmSettings() {
  const container = document.createElement('div');
  container.className = 'farm-settings-page';
  container.style.padding = '24px';
  container.style.color = 'var(--color-text-primary)';
  container.style.maxWidth = '800px';
  container.style.margin = '0 auto';

  container.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div class="spinner"></div>
      <div style="margin-top: 16px; color: var(--color-text-secondary);">Загрузка настроек...</div>
    </div>
  `;

  let currentSettings = null;

  async function loadData() {
    try {
      currentSettings = await window.electronAuth.settingsGet();
      render();
    } catch (err) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--color-danger); padding: 40px;">
          Ошибка загрузки настроек: ${err.message}
        </div>
      `;
    }
  }

  async function handleSave() {
    try {
      const btn = container.querySelector('#save-btn');
      if (btn) {
        btn.textContent = 'Сохранение...';
        btn.disabled = true;
      }
      
      const newSettings = {
        phase1DurationMin: parseInt(container.querySelector('#phase1-input').value, 10) || 5,
        phase2DurationSec: parseInt(container.querySelector('#phase2-input').value, 10) || 5,
        maxConcurrent: parseInt(container.querySelector('#concurrent-input').value, 10) || 30,
        whitelist: container.querySelector('#whitelist-input').value.split(',').map(s => s.trim()).filter(s => s),
        blacklist: container.querySelector('#blacklist-input').value.split(',').map(s => s.trim()).filter(s => s),
        notifications: {
          onCardDrop: container.querySelector('#notify-drop').checked,
          onAllReceived: container.querySelector('#notify-all').checked,
          onFarmComplete: container.querySelector('#notify-complete').checked,
        }
      };

      await window.electronAuth.settingsSave(newSettings);
      currentSettings = newSettings;
      
      if (btn) {
        btn.textContent = 'Сохранить параметры';
        btn.disabled = false;
      }
      toast.show('Настройки успешно сохранены!', 'success');
    } catch (err) {
      console.error(err);
      toast.show('Ошибка сохранения настроек', 'error');
      const btn = container.querySelector('#save-btn');
      if (btn) {
          btn.textContent = 'Сохранить параметры';
          btn.disabled = false;
      }
    }
  }

  function render() {
    if (!currentSettings) return;

    container.innerHTML = `
      <h2 style="margin: 0 0 8px 0; font-size: 1.5rem;">Настройки фарма</h2>
      <p style="color: var(--color-text-secondary); margin-bottom: 24px;">Параметры алгоритма IME Fast Mode и уведомления.</p>

      <!-- Интервалы -->
      <section style="margin-bottom: 32px;">
        <h3 style="color: var(--color-text-secondary); font-size: 12px; letter-spacing: 1px; margin-bottom: 16px; text-transform: uppercase;">
          Интервалы и тайминги
        </h3>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; background: var(--color-bg-surface); padding: 16px; border-radius: 8px; border: 1px solid var(--color-border);">
              <label for="phase1-input" style="font-weight: 500;">Прогрев (минут) фаза 1</label>
              <input type="number" id="phase1-input" value="${currentSettings.phase1DurationMin}" min="1" max="60" style="width: 80px; padding: 8px; background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-primary); text-align: center; outline: none;">
            </div>
            
            <div style="display: flex; align-items: center; justify-content: space-between; background: var(--color-bg-surface); padding: 16px; border-radius: 8px; border: 1px solid var(--color-border);">
              <label for="phase2-input" style="font-weight: 500;">Фарм — время на игру (секунд) фаза 2</label>
              <input type="number" id="phase2-input" value="${currentSettings.phase2DurationSec}" min="1" max="120" style="width: 80px; padding: 8px; background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-primary); text-align: center; outline: none;">
            </div>
            
            <div style="display: flex; align-items: center; justify-content: space-between; background: var(--color-bg-surface); padding: 16px; border-radius: 8px; border: 1px solid var(--color-border);">
              <label for="concurrent-input" style="font-weight: 500;">Макс. игр одновременно</label>
              <input type="number" id="concurrent-input" value="${currentSettings.maxConcurrent}" min="1" max="50" style="width: 80px; padding: 8px; background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-primary); text-align: center; outline: none;">
            </div>
        </div>
      </section>

      <!-- Уведомления -->
      <section style="margin-bottom: 32px;">
        <h3 style="color: var(--color-text-secondary); font-size: 12px; letter-spacing: 1px; margin-bottom: 16px; text-transform: uppercase;">
          Уведомления системы
        </h3>
        
        <div style="display: flex; flex-direction: column; gap: 16px; background: var(--color-bg-surface); padding: 16px; border-radius: 8px; border: 1px solid var(--color-border);">
           <div style="display: flex; align-items: center; justify-content: space-between;">
             <label for="notify-drop" style="font-weight: 500; cursor: pointer;">Карточка получена</label>
             <input type="checkbox" id="notify-drop" ${currentSettings.notifications.onCardDrop ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--color-success); cursor: pointer;">
           </div>
           
           <div style="display: flex; align-items: center; justify-content: space-between;">
             <label for="notify-all" style="font-weight: 500; cursor: pointer;">Все карточки игры получены</label>
             <input type="checkbox" id="notify-all" ${currentSettings.notifications.onAllReceived ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--color-success); cursor: pointer;">
           </div>
           
           <div style="display: flex; align-items: center; justify-content: space-between;">
             <label for="notify-complete" style="font-weight: 500; cursor: pointer;">Фарм завершён</label>
             <input type="checkbox" id="notify-complete" ${currentSettings.notifications.onFarmComplete ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--color-success); cursor: pointer;">
           </div>
        </div>
      </section>

      <!-- Белый / Черный списки -->
      <section style="margin-bottom: 32px;">
        <h3 style="color: var(--color-text-secondary); font-size: 12px; letter-spacing: 1px; margin-bottom: 16px; text-transform: uppercase;">
          Фильтры игр
        </h3>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div>
              <label style="display: block; margin-bottom: 8px; font-weight: 500;">Белый список (AppIDs через запятую)</label>
              <input type="text" id="whitelist-input" value="${currentSettings.whitelist.join(', ')}" style="width: 100%; padding: 12px; background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-primary); outline: none;" placeholder="Например: 730, 440">
              <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 6px;">Если заполнено, фармим только эти игры.</div>
            </div>
            
            <div>
              <label style="display: block; margin-bottom: 8px; font-weight: 500;">Чёрный список (AppIDs через запятую)</label>
              <input type="text" id="blacklist-input" value="${currentSettings.blacklist.join(', ')}" style="width: 100%; padding: 12px; background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text-primary); outline: none;" placeholder="Например: 730, 440">
              <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 6px;">Эти игры будут проигнорированы.</div>
            </div>
        </div>
      </section>
      
      <button id="save-btn" style="padding: 10px 24px; font-size: 14px; font-weight: 600; background: var(--color-accent-green); border-radius: var(--radius-sm); color: var(--color-bg-base); cursor: pointer; border: none; transition: transform var(--transition-fast);">
        Сохранить параметры
      </button>
    `;

    container.querySelector('#save-btn').addEventListener('click', handleSave);
  }

  loadData();

  return container;
}
