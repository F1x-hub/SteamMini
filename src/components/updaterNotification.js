let _initialized = false;

export function initUpdaterNotification() {
  if (_initialized) return;
  _initialized = true;

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
