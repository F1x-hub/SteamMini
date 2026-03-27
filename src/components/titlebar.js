import storage from '../utils/storage.js';

export function createTitlebar() {
  const titlebar = document.createElement('div');
  titlebar.className = 'custom-titlebar';

  titlebar.innerHTML = `
    <div class="titlebar-drag-region"></div>
    <div class="titlebar-controls">
      <button class="win-btn minimize-btn" aria-label="Minimize">
        <svg viewBox="0 0 10 1" stroke="currentColor" stroke-width="1.5"><path d="M0 0.5h10"/></svg>
      </button>
      <button class="win-btn maximize-btn" aria-label="Maximize">
        <svg viewBox="0 0 10 10" stroke="currentColor" fill="none"><rect x="0.5" y="0.5" width="9" height="9"/></svg>
      </button>
      <button class="win-btn close-btn" aria-label="Close">
        <svg viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.5"><path d="M0 0L10 10M10 0L0 10"/></svg>
      </button>
    </div>
  `;

  // Provide styles
  const style = document.createElement('style');
  style.textContent = `
    .custom-titlebar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 32px;
      background-color: var(--color-bg-base);
      user-select: none;
      z-index: 9999;
      position: relative;
    }
    .titlebar-drag-region {
      flex: 1;
      height: 100%;
      -webkit-app-region: drag;
    }
    .titlebar-controls {
      display: flex;
      height: 100%;
      -webkit-app-region: no-drag;
    }
    .win-btn {
      width: 46px;
      height: 100%;
      background: transparent;
      border: none;
      color: var(--color-text-secondary);
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 0;
      border-radius: 0;
      transition: background-color var(--transition-fast), color var(--transition-fast);
      cursor: pointer;
    }
    .win-btn svg {
      width: 10px;
      height: 10px;
    }
    .win-btn:hover {
      background-color: var(--color-bg-surface-light);
      color: var(--color-text-primary);
    }
    .win-btn.close-btn:hover {
      background-color: var(--color-danger);
      color: white;
    }
    
    .close-prompt-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
      display: flex; justify-content: center; align-items: center;
      z-index: 10002;
    }
    .close-prompt-content {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 24px;
      width: 320px;
      box-shadow: var(--shadow-lg);
    }
    .close-prompt-content h3 { margin: 0 0 12px 0; font-size: 1.15rem; color: var(--color-text-primary); text-align: center; }
    .close-prompt-content p { font-size: 0.9rem; color: var(--color-text-secondary); text-align: center; margin-bottom: 20px; }
    .close-prompt-actions { display: flex; flex-direction: column; gap: 10px; }
    .btn-danger {
      background: rgba(255, 255, 255, 0.05); color: var(--color-text-primary); border: 1px solid var(--color-border); font-weight: 500; border-radius: var(--radius-sm); padding: 8px 16px; cursor: pointer;
    }
    .btn-danger:hover { background: var(--color-danger); border-color: var(--color-danger); color: white; }
  `;
  titlebar.appendChild(style);

  function showClosePrompt() {
    const overlay = document.createElement('div');
    overlay.className = 'close-prompt-overlay';
    overlay.innerHTML = `
      <div class="close-prompt-content">
        <h3>Закрытие SteamMini</h3>
        <p>Как вы хотите, чтобы приложение вело себя при закрытии?</p>
        <div class="close-prompt-actions">
          <button id="btn-minimize-tray" class="btn-primary" style="padding: 8px 16px; border-radius: var(--radius-sm); border: none; font-weight: 500; cursor: pointer;">Свернуть в трей</button>
          <button id="btn-quit-app" class="btn-danger">Закрыть полностью</button>
        </div>
        <p style="font-size: 11px; margin-top: 15px; margin-bottom: 0; color: var(--color-text-secondary); text-align: center;">Этот выбор можно изменить в настройках профиля.</p>
      </div>
    `;
    document.body.appendChild(overlay);

    const saveBehavior = (behavior) => {
      const prefs = storage.get('preferences') || {};
      prefs.closeBehavior = behavior;
      storage.set('preferences', prefs);
    };

    overlay.querySelector('#btn-minimize-tray').addEventListener('click', () => {
      saveBehavior('tray');
      window.electronAuth.hideWindow();
      overlay.remove();
    });
    overlay.querySelector('#btn-quit-app').addEventListener('click', () => {
      saveBehavior('quit');
      window.electronAuth.quitApp();
      overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove(); 
    });
  }

  // Bind Events
  if (window.electronAuth) {
    const handleClose = () => {
      const prefs = storage.get('preferences') || {};
      if (prefs.closeBehavior === 'tray') {
        window.electronAuth.hideWindow();
      } else if (prefs.closeBehavior === 'quit') {
        window.electronAuth.quitApp();
      } else {
        if (!document.querySelector('.close-prompt-overlay')) {
          showClosePrompt();
        }
      }
    };

    titlebar.querySelector('.minimize-btn').addEventListener('click', () => {
      window.electronAuth.minimizeWindow();
    });
    titlebar.querySelector('.maximize-btn').addEventListener('click', () => {
      window.electronAuth.maximizeWindow();
    });
    titlebar.querySelector('.close-btn').addEventListener('click', handleClose);
    
    // Also listen to Alt+F4 or native close requests
    if (window.electronAuth.onCloseRequested) {
      window.electronAuth.onCloseRequested(handleClose);
    }
  }

  return titlebar;
}
