import './styles/variables.css';
import './styles/global.css';
import './styles/skeleton.css';
import './styles/freeGames.css';
import './styles/updaterNotification.css';
import './styles/userPopup.css';

import store from './store/index.js';
import router from './router/index.js';
import { createTitlebar } from './components/titlebar.js';
import { createTopNav } from './components/topNav.js';
import { createUserPopup } from './components/userPopup.js';
import { createProfilePopup } from './components/profilePopup.js';
import { initTooltips } from './components/tooltip.js';
import { initContextMenu } from './components/contextMenu.js';
import { initInternalBrowser } from './components/internalBrowser.js';
import { initUpdaterNotification } from './components/updaterNotification.js';
import { initErrorBoundary } from './utils/errorBoundary.js';
import { initFarmingIndicator } from './components/farmingIndicator.js';

import { renderLibrary } from './pages/library.js';
import { renderWishlist } from './pages/wishlist.js';
import { renderLogin } from './pages/login.js';
import { renderGameDetail } from './pages/gameDetail.js';
import { renderCardsInventory } from './pages/cardsInventory.js';
import { renderFreeGames } from './pages/freeGames.js';
import { renderBacklog } from './pages/backlog.js';
import autoFarm from './utils/autoFarm.js';
import { startBackgroundPriceFetcher } from './utils/backgroundPrices.js';

import steamApi from './api/steam.js';
import logger from './utils/logger.js';

// ── Capture and store the stable absolute URL of index.html for later redirects ──
(function captureBaseUrl() {
  const currentHref = window.location.href.split('#')[0].split('?')[0];
  // If we are on index.html (first boot), save it to localStorage.
  // We only do this if it contains 'index.html' to avoid saving a mangled virtual path.
  if (currentHref.includes('index.html')) {
    localStorage.setItem('app_base_url', currentHref);
    logger.info('[Init] Saved stable base URL:', currentHref);
  } else if (window.location.protocol !== 'file:') {
    // On localhost, the root is always stable
    const stableRoot = window.location.origin + '/';
    localStorage.setItem('app_base_url', stableRoot);
    logger.info('[Init] Saved stable localhost base URL:', stableRoot);
  }
})();

// ── Global Error Catchers for persistent logging ──
window.onerror = (message, source, lineno, colno, error) => {
  logger.error(`[Global Error] ${message}`, { source, lineno, colno, error: error?.stack });
};
window.onunhandledrejection = (event) => {
  logger.error(`[Unhandled Rejection] ${event.reason}`);
};



function showSplash() {
  const splash = document.createElement('div');
  splash.id = 'app-splash';
  splash.innerHTML = `
    <div class="splash-logo">
      <div class="splash-dot"></div>
      <div class="splash-title">GameController</div>
    </div>
    <div class="splash-bar">
      <div class="splash-bar-fill"></div>
    </div>
  `;
  document.body.appendChild(splash);
  return splash;
}

function hideSplash(splash) {
  splash.classList.add('splash-hide');
  setTimeout(() => splash.remove(), 400);
}

async function preloadInitialData() {
  try {
    await Promise.allSettled([
      steamApi.getOwnedGames(),
      window.electronAuth?.steamGetWallet ? window.electronAuth.steamGetWallet() : Promise.resolve(),
    ]);
  } catch (e) {
    console.warn('[init] Preload partial fail:', e);
  }
}

async function main() {
  logger.info('[Main] Initializing application...');
  initErrorBoundary();

  const app = document.getElementById('app');
  
  const splash = showSplash();
  const bar = document.querySelector('.splash-bar-fill');

  // Initialize global custom UI elements needed for login
  initTooltips();
  initContextMenu();
  initInternalBrowser();
  initUpdaterNotification();

  // Initialize Authentication
  await store.initAuth();
  if (bar) bar.style.width = '30%';

  const userPopup = createUserPopup();
  document.body.appendChild(userPopup);

  if (!store.get('isAuthenticated')) {
    hideSplash(splash);
    app.innerHTML = '';
    
    // Add custom titlebar to login screen as well
    const titlebar = createTitlebar();
    app.appendChild(titlebar);
    
    const loginEl = renderLogin();
    app.appendChild(loginEl);
    
    if (window.electronAuth && window.electronAuth.appReady) {
      window.electronAuth.appReady();
    }
    return;
  }

  // Preload initial library/wallet data
  await Promise.allSettled([
    preloadInitialData(),
    store.fetchUserProfile()
  ]);
  startBackgroundPriceFetcher();
  if (bar) bar.style.width = '60%';

  // Create layout
  const titlebar = createTitlebar();
  const topNav = createTopNav();
  const mainContent = document.createElement('main');
  mainContent.className = 'main-content';
  mainContent.style.flex = '1';
  mainContent.style.position = 'relative';
  mainContent.style.overflowY = 'auto'; // allow inner scroll

  const profilePopup = createProfilePopup();
  document.body.appendChild(profilePopup);

  app.appendChild(titlebar);
  app.appendChild(topNav);







  app.appendChild(mainContent);

  // Listen for route changes in store and router
  const originalNavigate = router.navigate.bind(router);
  router.navigate = (path) => {
    const current = store.get('currentRoute');
    if (current && current !== path) {
      store.set('previousRoute', current);
    }
    // Close internal browser on any navigation
    store.set('isBrowserOpen', false);
    
    store.set('currentRoute', path);
    return originalNavigate(path);
  };
  
  window.addEventListener('popstate', () => {
    store.set('isBrowserOpen', false);
    store.set('currentRoute', window.location.pathname);
  });

  // Register basic routes
  router.add('/', () => {
    router.navigate('/library');
    return document.createElement('div');
  });
  router.add('/library', renderLibrary);
  router.add('/cards-inventory', renderCardsInventory);
  router.add('/wishlist', renderWishlist);
  router.add('/free-games', renderFreeGames);
  router.add('/backlog', renderBacklog);
  router.add(/^\/game\/(.+)$/, (appId) => {
    // Reset previousRoute if it's not a valid origin (e.g. refresh)
    const validOrigins = ['/library', '/cards-inventory', '/wishlist', '/free-games', '/backlog'];
    const prev = store.get('previousRoute');
    if (!validOrigins.includes(prev)) {
      store.set('previousRoute', null);
    }
    return renderGameDetail(appId);
  });

  let currentPath = window.location.pathname;
  if (currentPath === '/' || currentPath.endsWith('index.html')) {
    currentPath = '/library';
    window.history.replaceState(null, '', currentPath);
  }

  // Initialize router inside mainContent
  await router.init(mainContent, currentPath);
  store.set('currentRoute', currentPath);
  
  if (bar) bar.style.width = '100%';

  // Small delay for bar animation visually completing
  await new Promise(r => setTimeout(r, 200));

  hideSplash(splash);

  requestAnimationFrame(() => {
    if (window.electronAuth && window.electronAuth.appReady) {
      window.electronAuth.appReady();
    }
  });

  // Apply theme initial
  const prefs = store.get('preferences') || { theme: 'dark' };
  document.documentElement.setAttribute('data-theme', prefs.theme);
  
  // Listen for theme preference changes
  store.subscribe('theme', (themeMode) => {
    document.documentElement.setAttribute('data-theme', themeMode);
  });


  
  // Clean up idle games on close
  window.addEventListener('beforeunload', () => {
    autoFarm.stop();
    if (window.electronAuth && window.electronAuth.idleStopAll) {
       window.electronAuth.idleStopAll();
    }
    if (window.electronAuth && window.electronAuth.achievementsClose) {
       window.electronAuth.achievementsClose();
    }
  });
}

document.addEventListener('DOMContentLoaded', main);
