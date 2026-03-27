import store from '../store/index.js';
import router from '../router/index.js';

export function createTopNav() {
  const nav = document.createElement('nav');
  nav.className = 'top-nav';

  nav.innerHTML = `
    <div class="nav-left">
      <div class="logo">
        <div class="logo-dot"></div>
        GameController
      </div>
      <ul class="nav-links">
        <li><a href="/library" data-link class="active">Библиотека</a></li>
        <li><a href="/cards-inventory" data-link>Карточки</a></li>
        <li><a href="/wishlist" data-link>Вишлист</a></li>
        <li><a href="/free-games" data-link>🎁 Бесплатно</a></li>
      </ul>
    </div>
    <div class="nav-right">
      <div id="farm-indicator" class="farm-indicator" style="display: none;"></div>
      <div id="wallet-balance" class="wallet-balance" style="display: none;">
        <span class="wallet-icon">💰</span>
        <span class="wallet-amount">...</span>
      </div>
      <div class="user-profile-trigger" id="user-trigger">
        <div class="avatar-placeholder"></div>
        <span class="user-name">Guest</span>
      </div>
    </div>
  `;

  // Encapsulated styles
  const style = document.createElement('style');
  style.textContent = `
    .top-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background-color: var(--color-bg-base);
      padding: 0 var(--spacing-lg);
      height: 50px;
      position: sticky;
      top: 0;
      z-index: 9999;
    }
    .nav-left, .nav-right {
      display: flex;
      align-items: center;
      height: 100%;
    }
    .logo {
      font-weight: 700;
      font-size: 1.1rem;
      margin-right: var(--spacing-xl);
      color: var(--color-text-primary);
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: var(--color-text-accent); /* White in dark, Black in light */
    }
    .nav-links {
      display: flex;
      list-style: none;
      margin: 0;
      padding: 0;
      height: 100%;
      gap: 4px;
    }
    .nav-links li {
      height: 100%;
      display: flex;
      align-items: center;
    }
    .nav-links a {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      color: var(--color-text-secondary);
      font-weight: 500;
      border-radius: var(--radius-sm);
      transition: background-color var(--transition-fast), color var(--transition-fast);
      position: relative;
    }
    .nav-links a:hover {
      color: var(--color-text-primary);
      background-color: var(--color-bg-surface-light);
      text-decoration: none;
    }
    .nav-links a.active {
      color: var(--color-text-primary);
      background-color: transparent;
    }
    .nav-links a.active::after {
      content: '';
      position: absolute;
      bottom: -4px;
      left: 50%;
      transform: translateX(-50%) scale(1);
      width: 4px;
      height: 4px;
      background-color: var(--color-text-primary);
      border-radius: 50%;
      animation: dotAppear var(--transition-base) ease;
    }
    @keyframes dotAppear {
      from { transform: translateX(-50%) scale(0); opacity: 0; }
      to   { transform: translateX(-50%) scale(1); opacity: 1; }
    }
    .user-profile-trigger {
      display: flex;
      align-items: center;
      cursor: pointer;
      padding: 4px 12px 4px 6px;
      border-radius: 20px;
      background-color: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      transition: border-color var(--transition-fast), background-color var(--transition-fast);
    }
    .user-profile-trigger:hover {
      border-color: var(--color-text-secondary);
      background-color: var(--color-bg-surface-light);
    }
    .avatar-placeholder {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: var(--color-border);
      margin-right: 8px;
      background-size: cover;
      background-position: center;
    }
    .user-name {
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--color-text-primary);
    }
    
    .wallet-balance {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-right: 16px;
      padding: 4px 10px;
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .wallet-icon {
      font-size: 14px;
    }
    
    /* Farm Indicator */
    .farm-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 10px;
      border-radius: var(--radius-sm);
      border: 1px solid;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 150ms ease, transform 150ms ease;
      animation: farmIndicatorIn 200ms ease;
      margin-right: 12px;
      white-space: nowrap;
      user-select: none;
    }
    .farm-indicator:hover {
      opacity: 0.85;
      transform: scale(1.03);
    }
    .farm-indicator.indicator-warmup {
      background: rgba(245, 158, 11, 0.15);
      border-color: var(--color-warning);
      color: #fbbf24;
    }
    .farm-indicator.indicator-farm {
      background: rgba(34, 197, 94, 0.15);
      border-color: var(--color-accent-green);
      color: #4ade80;
    }
    .farm-indicator.indicator-mixed {
      background: rgba(202, 138, 4, 0.15);
      border-color: var(--color-warning);
      color: #fbbf24;
    }
    @keyframes farmIndicatorIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }
  `;
  nav.appendChild(style);

  // Bind Events
  nav.querySelector('#user-trigger').addEventListener('click', (e) => {
    e.stopPropagation(); // prevent immediate close
    store.set('profilePopupOpen', !store.get('profilePopupOpen'));
  });

  // Highlight active link based on route changes
  store.subscribe('currentRoute', (path) => {
    const links = nav.querySelectorAll('.nav-links a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      const isActive = path.startsWith(href);
      if (isActive) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  });

  // Track User changes
  const onUserUpdate = (user) => {
    // Select elements from the document to avoid stale references if the nav is re-rendered
    const nameEl = document.querySelector('.top-nav .user-name');
    const avatarEl = document.querySelector('.top-nav .avatar-placeholder');
    
    if (!nameEl || !avatarEl) return;

    if (user) {
      nameEl.textContent = user.name || 'Guest';
      if (user.avatar) {
         avatarEl.style.backgroundImage = `url('${user.avatar}')`;
      } else {
         avatarEl.style.backgroundImage = 'none';
      }
    } else {
      nameEl.textContent = 'Guest';
      avatarEl.style.backgroundImage = 'none';
    }

    // Update wallet balance
    const walletEl = nav.querySelector('#wallet-balance');
    const walletAmountEl = walletEl ? walletEl.querySelector('.wallet-amount') : null;

    if (user && user.steamId && walletEl && walletAmountEl) {
      window.electronAuth.steamGetWallet(user.steamId).then(wallet => {
        if (wallet.success) {
          walletEl.style.display = 'flex';
          if (wallet.delayed > 0) {
            walletAmountEl.innerHTML = `
              ${wallet.balanceFmt}
              <span style="
                font-size:10px;color:var(--color-warning);margin-left:4px;
                background:rgba(245,158,11,0.12);padding:2px 6px;border-radius:var(--radius-sm);
              " title="На удержании">
                +${wallet.delayedFmt} ⏳
              </span>
            `;
          } else {
            walletAmountEl.textContent = wallet.balanceFmt;
          }
        } else {
          walletEl.style.display = 'none';
        }
      });
    } else if (walletEl) {
      walletEl.style.display = 'none';
    }
  };

  store.subscribe('user', onUserUpdate);
  // Manual trigger for initial state (in case it was fetched before component mount)
  // use setTimeout to let DOM attachment finish so querySelector finds the elements
  setTimeout(() => onUserUpdate(store.get('user')), 0);

  // --- Farm Indicator ---
  const farmIndicator = nav.querySelector('#farm-indicator');
  
  const updateFarmIndicator = () => {
    const status = store.get('autoFarmStatus');
    if (!status || !status.isActive || !status.phase) {
      farmIndicator.style.display = 'none';
      return;
    }
    
    farmIndicator.style.display = 'inline-flex';
    
    // Support both old phase names (warmup/farming) and new (simultaneous/sequential)
    const phaseClass = {
      simultaneous: 'indicator-warmup',
      sequential:   'indicator-farm',
      warmup:       'indicator-warmup',
      farming:      'indicator-farm',
      mixed:        'indicator-mixed',
    };
    
    const pClass = phaseClass[status.phase] || 'indicator-warmup';
    farmIndicator.className = `farm-indicator ${pClass}`;
    
    const isWarmPhase = status.phase === 'simultaneous' || status.phase === 'warmup' || status.phase === 'mixed';
    const formatTime = (seconds) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const iconChar = isWarmPhase ? '🔥' : '▶';
    const phaseText = isWarmPhase ? 'Прогрев' : 'Фарм';

    farmIndicator.innerHTML = `
      <span>${iconChar}</span>
      <span style="font-size: 11px; margin-left: -2px; text-transform: uppercase;">${phaseText}</span>
      <span style="color: var(--color-text-secondary); font-size: 12px; margin-left: 2px;">${formatTime(status.phaseTimeLeft || 0)}</span>
    `;
  };
  
  store.subscribe('autoFarmStatus', updateFarmIndicator);
  // Initial render
  updateFarmIndicator();
  
  farmIndicator.addEventListener('click', () => {
    store.set('farmScrollToStatus', true);
    router.navigate('/library');
  });

  return nav;
}
