export function initUpdaterNotification() {
  if (!window.electronAuth) return;

  const container = document.createElement('div');
  container.className = 'updater-notification-container';
  
  container.innerHTML = `
    <div class="updater-box" id="updater-box">
      <div class="updater-header">
        <h3 id="updater-title">Доступно обновление</h3>
        <button class="updater-close" id="updater-close">×</button>
      </div>
      <div class="updater-body">
         <p id="updater-desc">Версия 1.0.1 доступна для установки</p>
         <div class="updater-progress" id="updater-progress-container" style="display: none;">
           <div class="progress-bar-bg">
             <div class="progress-bar-fill" id="updater-progress-fill"></div>
           </div>
           <span class="progress-text" id="updater-progress-text">0% (0 KB/s)</span>
         </div>
      </div>
      <div class="updater-footer" id="updater-footer">
        <button class="btn-secondary" id="updater-later">Позже</button>
        <button class="btn-primary" id="updater-action">Скачать</button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .updater-notification-container {
      position: fixed;
      top: 50px;
      right: 24px;
      z-index: 99999;
      display: none;
    }
    .updater-box {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      width: 320px;
      box-shadow: var(--shadow-lg);
      display: flex;
      flex-direction: column;
      animation: slideInFromRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideInFromRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .updater-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.02);
    }
    .updater-header h3 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .updater-close {
      background: none;
      border: none;
      font-size: 1.2rem;
      color: var(--color-text-secondary);
      cursor: pointer;
      line-height: 1;
    }
    .updater-close:hover {
      color: var(--color-action-primary);
    }
    .updater-body {
      padding: 16px;
    }
    .updater-body p {
      margin: 0 0 12px 0;
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    .updater-progress {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .progress-bar-bg {
      width: 100%;
      height: 6px;
      background: var(--color-bg-base);
      border-radius: 3px;
      overflow: hidden;
      border: 1px solid var(--color-border);
    }
    .progress-bar-fill {
      height: 100%;
      background: var(--color-action-primary);
      width: 0%;
      transition: width 0.2s linear;
    }
    .progress-text {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      text-align: right;
    }
    .updater-footer {
      padding: 12px 16px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      border-top: 1px solid var(--color-border);
      background: rgba(255,255,255,0.01);
    }
    .btn-secondary {
      background: transparent;
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-secondary:hover {
      background: var(--color-bg-surface-light);
      color: var(--color-text-primary);
    }
    .updater-footer .btn-primary {
      background: var(--color-action-primary);
      color: var(--color-bg-base);
      border: none;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .updater-footer .btn-primary:hover {
      background: var(--color-action-hover);
    }
  `;
  
  container.appendChild(style);
  document.body.appendChild(container);

  const titleEl = container.querySelector('#updater-title');
  const descEl = container.querySelector('#updater-desc');
  const progContainer = container.querySelector('#updater-progress-container');
  const progFill = container.querySelector('#updater-progress-fill');
  const progText = container.querySelector('#updater-progress-text');
  
  const actionBtn = container.querySelector('#updater-action');
  const laterBtn = container.querySelector('#updater-later');
  const closeBtn = container.querySelector('#updater-close');
  const footerEl = container.querySelector('#updater-footer');
  
  let currentState = 'hidden'; 

  const hide = () => {
    container.style.display = 'none';
    currentState = 'hidden';
  };

  closeBtn.addEventListener('click', hide);
  laterBtn.addEventListener('click', hide);

  actionBtn.addEventListener('click', () => {
    if (currentState === 'available') {
      window.electronAuth.updateDownload();
      currentState = 'downloading';
      
      titleEl.textContent = 'Загрузка обновления';
      descEl.textContent = 'Пожалуйста, подождите...';
      progContainer.style.display = 'flex';
      progFill.style.width = '0%';
      progText.textContent = '0% (0 KB/s)';
      
      footerEl.style.display = 'none'; 
    } else if (currentState === 'downloaded') {
      actionBtn.disabled = true;
      actionBtn.textContent = 'Запуск...';
      window.electronAuth.installUpdate();
    }
  });

  if (window.electronAuth.onUpdateNotifyAvailable) {
    window.electronAuth.onUpdateNotifyAvailable((info) => {
      currentState = 'available';
      container.style.display = 'block';
      titleEl.textContent = 'Доступно обновление';
      descEl.textContent = `Версия ${info.version} доступна для установки.`;
      progContainer.style.display = 'none';
      footerEl.style.display = 'flex';
      actionBtn.textContent = 'Скачать';
      actionBtn.disabled = false;
    });
  }

  if (window.electronAuth.onUpdateProgress) {
    window.electronAuth.onUpdateProgress((data) => {
      if (currentState !== 'downloading') {
        currentState = 'downloading';
        container.style.display = 'block';
        titleEl.textContent = 'Загрузка обновления';
        descEl.textContent = 'Пожалуйста, подождите...';
        progContainer.style.display = 'flex';
        footerEl.style.display = 'none';
      }
      progFill.style.width = `${data.percent}%`;
      progText.textContent = `${data.percent}% (${data.speed} KB/s)`;
    });
  }

  if (window.electronAuth.onUpdateNotifyDownloaded) {
    window.electronAuth.onUpdateNotifyDownloaded((info) => {
      currentState = 'downloaded';
      container.style.display = 'block';
      titleEl.textContent = 'Обновление загружено';
      descEl.textContent = `Версия ${info.version} готова к установке.`;
      progContainer.style.display = 'none';
      footerEl.style.display = 'flex';
      actionBtn.textContent = 'Установить и перезапустить';
      actionBtn.disabled = false;
    });
  }
}
