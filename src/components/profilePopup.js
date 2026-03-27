import store from '../store/index.js';
import steamApi from '../api/steam.js';

export function createProfilePopup() {
  const container = document.createElement('div');
  container.className = 'profile-popup-wrapper';
  
  // Style encapsulation
  const style = document.createElement('style');
  style.textContent = `
    .profile-popup-wrapper {
      position: absolute;
      top: 54px;
      right: 24px;
      width: 280px;
      background: var(--color-dropdown-bg);
      border: 1px solid var(--color-dropdown-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      padding: var(--spacing-md);
      z-index: 10001;
      
      /* Animation */
      opacity: 0;
      visibility: hidden;
      transform: translateY(-8px);
      transition: opacity var(--transition-fast), transform var(--transition-fast), visibility var(--transition-fast);
    }
    
    .profile-popup-wrapper[data-open="true"] {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }
    
    .profile-popup-header {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: var(--spacing-md);
    }
    
    .profile-popup-avatar {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-sm);
      background-color: var(--color-border);
      background-size: cover;
      background-position: center;
      border: 1px solid var(--color-border);
    }
    
    .profile-popup-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }
    
    .profile-popup-name {
      font-weight: 600;
      color: var(--color-text-primary);
      font-size: 1rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .profile-popup-status {
      font-size: 0.8rem;
      color: var(--color-text-secondary);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #8f98a0;
    }
    
    .status-dot.online { background: #57cbde; }
    .status-dot.away { background: #eab308; }
    .status-dot.playing { background: #a3e635; }
    
    .profile-popup-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: var(--spacing-sm);
    }
    
    .popup-stat-box {
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .popup-stat-value {
      font-weight: 700;
      color: var(--color-text-primary);
      font-size: 1.1rem;
    }
    
    .popup-stat-label {
      font-size: 0.7rem;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .profile-popup-level {
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      margin-bottom: var(--spacing-md);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .level-badge {
      font-weight: bold;
      color: var(--color-text-primary);
      border: 1px solid #8c8c8c;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 0.85rem;
      transition: border-color var(--transition-slow), box-shadow var(--transition-slow);
    }
    
    .xp-bar-container {
      flex: 1;
      margin-left: 12px;
    }
    
    .xp-label {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
    }
    
    .xp-bar {
      height: 4px;
      background: var(--color-border);
      border-radius: 2px;
      overflow: hidden;
    }
    
    .xp-fill {
      height: 100%;
      background: var(--color-text-accent);
      width: 0%; 
      border-radius: 2px;
      transition: width 0.4s ease;
    }
    
    .profile-stat-skeleton {
      background: linear-gradient(90deg, var(--color-bg-base) 25%, var(--color-border) 50%, var(--color-bg-base) 75%);
      background-size: 200% 100%;
      animation: skeleton-loading 1.5s infinite;
      border-radius: var(--radius-sm);
      height: 1.2rem;
      width: 60px;
    }
    
    .profile-level-skeleton {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(90deg, var(--color-bg-base) 25%, var(--color-border) 50%, var(--color-bg-base) 75%);
      background-size: 200% 100%;
      animation: skeleton-loading 1.5s infinite;
    }
    
    .profile-xp-skeleton {
      height: 4px;
      width: 100%;
      border-radius: 2px;
      background: linear-gradient(90deg, var(--color-bg-base) 25%, var(--color-border) 50%, var(--color-bg-base) 75%);
      background-size: 200% 100%;
      animation: skeleton-loading 1.5s infinite;
    }
    
    @keyframes skeleton-loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    
    .profile-popup-divider {
      height: 1px;
      background: var(--color-border);
      margin: var(--spacing-sm) 0;
    }
    
    .profile-popup-action {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      color: var(--color-text-primary);
      background: transparent;
      border: none;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background-color var(--transition-fast);
      text-align: left;
      font-family: inherit;
      text-decoration: none;
    }
    
    .profile-popup-action:hover {
      background: var(--color-dropdown-hover);
      text-decoration: none;
      color: var(--color-text-primary);
    }
    
    .profile-popup-action.danger {
      color: var(--color-danger);
    }
    .profile-popup-action.danger:hover {
      background: rgba(239, 68, 68, 0.1);
    }
    
    .profile-popup-icon {
      font-size: 1.1rem;
      width: 20px;
      display: inline-block;
      text-align: center;
      opacity: 0.8;
    }
  `;
  container.appendChild(style);
  
  const content = document.createElement('div');
  container.appendChild(content);

  const getLevelColor = (levelNum) => {
    if (typeof levelNum !== 'number') return '#8c8c8c';
    const tier = Math.floor(levelNum / 10);
    const colors = {
      0:  '#8c8c8c', // 0–9   gray
      1:  '#cc3333', // 10–19 red
      2:  '#cc3333', // 20–29 red (darker)
      3:  '#ccaa00', // 30–39 gold
      4:  '#336633', // 40–49 dark green
      5:  '#336699', // 50–59 blue
      6:  '#6633cc', // 60–69 purple
      7:  '#cc3399', // 70–79 pink
      8:  '#00aaaa', // 80–89 turquoise
      9:  '#888833', // 90–99 olive
    };
    return colors[Math.min(tier, 9)] ?? '#8c8c8c';
  };

  const renderContent = async () => {
    const user = store.get('user');
    
    if (!user) {
      content.innerHTML = `
        <div style="text-align:center; padding: 20px 0; color: var(--color-text-secondary);">
          Not logged in
        </div>
        <div class="profile-popup-divider"></div>
        <button class="profile-popup-action" id="profile-settings-btn">
          <span class="profile-popup-icon">⚙️</span> Settings
        </button>
      `;
      bindGlobalButtons();
      return;
    }

    const statusText = user.personastate === 1 ? 'Online' 
                     : user.personastate === 3 ? 'Away'
                     : 'Offline';
                     
    const statusClass = user.personastate === 1 ? 'online'
                      : user.personastate === 3 ? 'away'
                      : 'offline';

    // 1. Initial Render with Skeletons
    content.innerHTML = `
      <div class="profile-popup-header">
        <div class="profile-popup-avatar" style="background-image: url('${user.avatar || ''}')"></div>
        <div class="profile-popup-info">
          <div class="profile-popup-name">${user.name || 'Guest'}</div>
          <div class="profile-popup-status">
            <span class="status-dot ${statusClass}"></span> ${statusText}
          </div>
        </div>
      </div>
      
      <div class="profile-popup-level">
        <div class="level-badge" id="dyn-level"><div class="profile-level-skeleton"></div></div>
        <div class="xp-bar-container">
          <div class="xp-label">
            <span>XP Progress</span>
            <span id="dyn-xp-perc"><div class="profile-stat-skeleton" style="width: 30px; height: 12px"></div></span>
          </div>
          <div class="xp-bar">
            <div class="xp-fill" id="dyn-xp-fill" style="width: 0%"></div>
          </div>
        </div>
      </div>
      
      <div class="profile-popup-stats">
        <div class="popup-stat-box">
          <span class="popup-stat-value" id="dyn-games"><div class="profile-stat-skeleton"></div></span>
          <span class="popup-stat-label">Games</span>
        </div>
        <div class="popup-stat-box">
          <span class="popup-stat-value" id="dyn-wishlist"><div class="profile-stat-skeleton"></div></span>
          <span class="popup-stat-label">Wishlist</span>
        </div>
      </div>
      
      <a href="${user.profileUrl || '#'}" target="_blank" class="profile-popup-action">
        <span class="profile-popup-icon">🌐</span> View on Steam
      </a>
      
      <div class="profile-popup-divider"></div>
      
      <button class="profile-popup-action" id="profile-settings-btn">
        <span class="profile-popup-icon">⚙️</span> Settings & Accounts
      </button>
      
      <button class="profile-popup-action danger" id="profile-logout-btn">
        <span class="profile-popup-icon">🚪</span> Logout
      </button>
    `;

    bindGlobalButtons();

    // 2. Fetch Data
    try {
      const [levelData, badgesData, gamesData, wishlistData] = await Promise.all([
        steamApi.getSteamLevel().catch(() => null),
        steamApi.getBadges().catch(() => null),
        steamApi.getOwnedGames().catch(() => null),
        steamApi.getWishlist().catch(() => null)
      ]);

      // Process Level & XP
      let level = '?';
      let xpPercent = 0;
      let xpText = '?';

      if (levelData !== null) level = levelData;
      
      if (badgesData) {
        if (badgesData.player_level !== undefined) level = badgesData.player_level;
        
        const xp = badgesData.player_xp || 0;
        const xpCurrentLvl = badgesData.player_xp_needed_current_level || 0;
        const xpNeeded = badgesData.player_xp_needed_to_level_up || 1; // prevent / 0

        const progress = xp - xpCurrentLvl;
        xpPercent = Math.round((progress / (progress + xpNeeded)) * 100);
        xpPercent = Math.min(Math.max(xpPercent, 0), 100); // clamp 0-100
        xpText = `${xpPercent}%`;
      }

      // Process Game Count
      const gamesCount = gamesData?.response?.game_count ?? '?';

      // Process Wishlist Count
      let wishlistCount = '?';
      if (wishlistData && wishlistData.response && Array.isArray(wishlistData.response.items)) {
        wishlistCount = wishlistData.response.items.length;
      }

      // Update DOM if elements still exist (user might have closed popup during fetch)
      const elLevel = content.querySelector('#dyn-level');
      if (elLevel) {
        elLevel.innerHTML = level;
        
        // Apply level color
        if (level !== '?' && typeof level === 'number') {
          const lvlColor = getLevelColor(level);
          elLevel.style.borderColor = lvlColor;
          elLevel.style.boxShadow = `0 0 6px ${lvlColor}40`;
        }
        
        content.querySelector('#dyn-xp-perc').innerHTML = xpText;
        content.querySelector('#dyn-xp-fill').style.width = `${xpPercent}%`;
        content.querySelector('#dyn-games').innerHTML = gamesCount;
        content.querySelector('#dyn-wishlist').innerHTML = wishlistCount;
      }

    } catch (err) {
      console.error('[ProfilePopup] Error fetching stats:', err);
      // Replace skeletons with ? on absolute failure
      const elLevel = content.querySelector('#dyn-level');
      if (elLevel) {
        elLevel.innerHTML = '?';
        content.querySelector('#dyn-xp-perc').innerHTML = '?';
        content.querySelector('#dyn-xp-fill').style.width = '0%';
        content.querySelector('#dyn-games').innerHTML = '?';
        content.querySelector('#dyn-wishlist').innerHTML = '?';
      }
    }
  };

  const bindGlobalButtons = () => {
    const settingsBtn = content.querySelector('#profile-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.set('profilePopupOpen', false);
        store.set('settingsOpen', true);
      });
    }
    
    const logoutBtn = content.querySelector('#profile-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.logout();
        store.set('profilePopupOpen', false);
        window.location.reload();
      });
    }
  };

  // Subscribe to popup state
  let isOpen = false;
  store.subscribe('profilePopupOpen', (openState) => {
    isOpen = openState;
    if (isOpen) {
      renderContent(); // Re-render to get latest stats/user info
      container.setAttribute('data-open', 'true');
    } else {
      container.removeAttribute('data-open');
    }
  });

  // Re-render when user updates (if it's open)
  store.subscribe('user', () => {
    if (isOpen) renderContent();
  });

  // Handle clicking outside to close
  document.addEventListener('click', (e) => {
    if (isOpen && !container.contains(e.target) && !e.target.closest('#user-trigger')) {
      store.set('profilePopupOpen', false);
    }
  });

  // Handle Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      store.set('profilePopupOpen', false);
    }
  });

  return container;
}
