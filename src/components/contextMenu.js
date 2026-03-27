export function initContextMenu() {
  const menuElement = document.createElement('div');
  menuElement.className = 'custom-context-menu';
  document.body.appendChild(menuElement);

  const style = document.createElement('style');
  style.textContent = `
    .custom-context-menu {
      position: fixed;
      background: var(--color-dropdown-bg);
      border: 1px solid var(--color-dropdown-border);
      border-radius: var(--radius-sm);
      padding: 4px 0;
      min-width: 160px;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-4px);
      transition: opacity 150ms ease, transform 150ms ease, visibility 150ms;
      box-shadow: var(--shadow-md);
      z-index: 100000;
      user-select: none;
    }
    .custom-context-menu.visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }
    .context-menu-item {
      padding: 8px 16px;
      font-size: 0.85rem;
      color: var(--color-text-primary);
      cursor: pointer;
      transition: background-color 0.15s;
    }
    .context-menu-item:hover {
      background: var(--color-dropdown-hover);
    }
    .context-menu-separator {
      height: 1px;
      background: var(--color-border);
      margin: 4px 0;
    }
  `;
  document.head.appendChild(style);

  let currentActions = [];

  const closeMenu = () => {
    menuElement.classList.remove('visible');
  };

  document.addEventListener('contextmenu', (e) => {
    // Check if we are right-clicking on something that allows default selection
    if (e.target.closest('input, textarea')) return;
    
    e.preventDefault();

    const gameCard = e.target.closest('.game-card');
    const wishlistCard = e.target.closest('.wishlist-card');
    
    currentActions = [];

    if (gameCard) {
      const appId = gameCard.querySelector('.play-btn')?.getAttribute('data-appid');
      const gameName = gameCard.querySelector('h3')?.textContent;
      if (appId) {
        currentActions = [
          { label: 'Play Game', action: () => window.location.href = 'steam://run/' + appId },
          { label: 'View in Store', action: () => window.open('https://store.steampowered.com/app/' + appId, '_blank') },
          { type: 'separator' },
          { label: 'Copy Name', action: () => navigator.clipboard.writeText(gameName) }
        ];
      }
    } else if (wishlistCard) {
      const appId = wishlistCard.querySelector('.buy-btn')?.getAttribute('data-appid');
      const gameName = wishlistCard.querySelector('h3')?.textContent;
      if (appId) {
        currentActions = [
          { label: 'View in Store', action: () => window.open('https://store.steampowered.com/app/' + appId, '_blank') },
          { type: 'separator' },
          { label: 'Copy Name', action: () => navigator.clipboard.writeText(gameName) }
        ];
      }
    } else {
        // Global context menu for the app
        currentActions = [
            { label: 'Reload App', action: () => window.location.reload() },
            { label: 'Toggle Fullscreen', action: () => window.electronAuth ? window.electronAuth.maximizeWindow() : null }
        ];
    }

    if (currentActions.length > 0) {
      menuElement.innerHTML = currentActions.map((item, i) => 
        item.type === 'separator' ? '<div class="context-menu-separator"></div>' :
        '<div class="context-menu-item" data-index="' + i + '">' + item.label + '</div>'
      ).join('');

      menuElement.classList.add('visible');
      
      let x = e.clientX;
      let y = e.clientY;
      
      requestAnimationFrame(() => {
        if (x + menuElement.offsetWidth > window.innerWidth) x = window.innerWidth - menuElement.offsetWidth - 4;
        if (y + menuElement.offsetHeight > window.innerHeight) y = window.innerHeight - menuElement.offsetHeight - 4;
        
        menuElement.style.left = x + 'px';
        menuElement.style.top = y + 'px';
      });
    } else {
      closeMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.context-menu-item')) {
      const idx = e.target.getAttribute('data-index');
      if (currentActions[idx] && currentActions[idx].action) {
        currentActions[idx].action();
      }
    }
    closeMenu();
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}
