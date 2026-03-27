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
  `;
  titlebar.appendChild(style);

  // Bind Events
  if (window.electronAuth) {
    titlebar.querySelector('.minimize-btn').addEventListener('click', () => {
      window.electronAuth.minimizeWindow();
    });
    titlebar.querySelector('.maximize-btn').addEventListener('click', () => {
      window.electronAuth.maximizeWindow();
    });
    titlebar.querySelector('.close-btn').addEventListener('click', () => {
      window.electronAuth.closeWindow();
    });
  }

  return titlebar;
}
