import steamApi from '../api/steam.js';
import store from '../store/index.js';
import router from '../router/index.js';
import storage from '../utils/storage.js';
import cache from '../utils/cache.js';
import { CACHE_TTL } from '../utils/cacheTTL.js';
import toast from '../utils/toast.js';
import { createDropdown } from '../components/dropdown.js';
import { createGameCardsBlock } from '../components/GameCardsBlock.js';

const REGIONS = [
  { code: 'US', name: 'США' },
  { code: 'TR', name: 'Турция' },
  { code: 'AR', name: 'Аргентина' },
  { code: 'KZ', name: 'Казахстан' },
  { code: 'UA', name: 'Украина' },
  { code: 'PL', name: 'Польша' },
  { code: 'DE', name: 'Германия' },
  { code: 'GB', name: 'Великобритания' },
  { code: 'CN', name: 'Китай' },
  { code: 'BR', name: 'Бразилия' },
  { code: 'RU', name: 'Россия' },
];

let currentMediaItems = [];
let currentLightboxIndex = 0;
let currentDetails = null;

let navigationHistory = [];
let historyIndex = -1;
let navBarElement = null;
let unsubscribeRoute = null;

/**
 * Renders idle toggle + Play button block or Install button for library-sourced games.
 */
async function renderGameControls(appId, isInstalled) {
  const wrap = document.createElement('div');
  wrap.className = 'game-detail-controls';

  // Idle switch - Always show
  const idleSwitch = document.createElement('label');
  idleSwitch.className = 'idle-switch';
  idleSwitch.innerHTML = `
    <span class="idle-label">Idle</span>
    <div class="switch-control">
      <input type="checkbox" class="idle-checkbox" data-appid="${appId}">
      <span class="switch-thumb"></span>
    </div>
  `;

  const checkbox = idleSwitch.querySelector('.idle-checkbox');

  // Restore current idle state
  if (window.electronAuth && window.electronAuth.getIdleActive) {
    try {
      const res = await window.electronAuth.getIdleActive();
      if (res && res.success && Array.isArray(res.data)) {
        checkbox.checked = res.data.includes(appId.toString()) || res.data.includes(Number(appId));
      }
    } catch (e) { /* non-fatal */ }
  }

  idleSwitch.addEventListener('change', async () => {
    if (!window.electronAuth) return;
    if (checkbox.checked) {
      const res = await window.electronAuth.idleStart(appId);
      if (res && res.success) {
        store.set('runningAppId', appId);
      } else {
        checkbox.checked = false;
      }
    } else {
      await window.electronAuth.idleStop(appId);
      if (String(store.get('runningAppId')) === String(appId)) {
        store.set('runningAppId', null);
      }
    }
  });

  wrap.appendChild(idleSwitch);

  const renderButtons = () => {
    // Remove existing buttons if any
    const existingPlay = wrap.querySelector('.detail-play-btn');
    const existingInstall = wrap.querySelector('.btn-install');
    if (existingPlay) existingPlay.remove();
    if (existingInstall) existingInstall.remove();

    if (isInstalled) {
      // Play button
      const playBtn = document.createElement('button');
      playBtn.className = 'play-btn detail-play-btn';
      playBtn.textContent = 'Play';
      playBtn.addEventListener('click', async () => {
        if (window.electronAuth && window.electronAuth.setRunningGame) {
          await window.electronAuth.setRunningGame({ appId: appId, pid: null });
        }
        window.location.href = `steam://run/${appId}`;
        store.set('runningAppId', appId);
      });
      wrap.appendChild(playBtn);
    } else {
      // Install button
      const installBtn = document.createElement('button');
      installBtn.className = 'btn-install';
      installBtn.innerHTML = `Установить`;
      installBtn.addEventListener('click', () => {
        window.open(`steam://install/${appId}`, '_self');
      });
      wrap.appendChild(installBtn);
    }
  };

  renderButtons();

  // Subscribe to runningAppId changes to update buttons dynamically
  const unsubscribe = store.subscribe('runningAppId', () => {
    renderButtons();
  });

  // Since we don't have a good place to unsubscribe from here easily 
  // (the element might be removed from DOM), we just keep it for now.
  // In a more complex app we'd use a MutationObserver or a lifecycle hook.

  return wrap;
}

function sanitizeRequirements(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}

/**
 * Verifies if the game is actually in the user's library.
 */
async function checkIsOwnedGame(appId) {
  try {
    const ownedGamesRaw = await steamApi.getOwnedGames();
    console.log('[GameDetail] ownedGamesRaw:', JSON.stringify(ownedGamesRaw)?.slice(0, 200));

    const ownedGames = Array.isArray(ownedGamesRaw) 
      ? ownedGamesRaw 
      : (ownedGamesRaw?.response?.games ?? ownedGamesRaw?.games ?? []);

    console.log('[GameDetail] getOwnedGames count:', ownedGames?.length);
    if (Array.isArray(ownedGames)) {
      const isOwned = ownedGames.some(game => String(game.appid) === String(appId));
      console.log(`[GameDetail] appId ${appId} match:`, isOwned);
      return isOwned;
    }
  } catch (e) {
    console.error('[GameDetail] getOwnedGames failed:', e);
  }
  return false;
}

export async function renderGameDetail(appId) {
  // Clear module-level state on new render to prevent stale data
  currentMediaItems = [];
  currentLightboxIndex = 0;
  currentDetails = null;

  const container = document.createElement('div');
  container.className = 'page-container game-detail-page';
  
  // Basic loading state
  container.innerHTML = `
    <div class="loading">Loading Game Data...</div>
  `;

  // Persist source route for reloads
  const incomingSource = store.get('previousRoute');
  console.log('[GameDetail] previousRoute from store:', incomingSource);

  if (incomingSource) {
    sessionStorage.setItem('gameDetailSource', incomingSource);
  }

  const source = incomingSource 
    || sessionStorage.getItem('gameDetailSource') 
    || null;

  console.log('[GameDetail] previousRoute from session:', sessionStorage.getItem('gameDetailSource'));
  console.log('[GameDetail] source resolved:', source);

  const isFromLibrary = source === '/library';
  const isFromWishlist = source === '/wishlist';

  console.log('[GameDetail] isFromLibrary:', isFromLibrary);
  console.log('[GameDetail] isFromWishlist:', isFromWishlist);

  // Clear previousRoute AFTER reading it so it doesn't pollute direct refreshes
  store.set('previousRoute', null);

  const meta = store.get('currentGameMeta');
  
  // Clear meta so it's not reused accidentally if user navigates directly
  store.set('currentGameMeta', null);

  // Check if this game is currently running according to main process
  if (window.electronAuth && window.electronAuth.getRunningGame) {
    try {
      const running = await window.electronAuth.getRunningGame();
      if (running && String(running.appId) === String(appId)) {
        store.set('runningAppId', appId);
      }
    } catch (e) {
      console.error('[GameDetail] getRunningGame failed:', e);
    }
  }

  // Handle history
  if (historyIndex === -1 || navigationHistory[historyIndex].appId !== appId) {
    if (historyIndex > -1 && historyIndex < navigationHistory.length - 1) {
      navigationHistory = navigationHistory.slice(0, historyIndex + 1);
    }
    navigationHistory.push({ appId, name: 'Loading...' });
    historyIndex = navigationHistory.length - 1;
  }

  const updateNavBar = () => {
    if (!navBarElement) return;
    
    const canGoBack = historyIndex >= 0;
    const canGoForward = historyIndex < navigationHistory.length - 1;
    
    const currentItem = navigationHistory[historyIndex] || {};
    const gameName = currentItem.name || 'Loading...';
    const slugName = gameName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const steamUrl = `https://store.steampowered.com/app/${currentItem.appId || appId}/${slugName}`;
    
    navBarElement.innerHTML = `
      <div class="game-nav-buttons">
        <button class="game-nav-btn prev-btn" ${!canGoBack ? 'disabled' : ''}>&#10094;</button>
        <button class="game-nav-btn next-btn" ${!canGoForward ? 'disabled' : ''}>&#10095;</button>
      </div>
      <div class="game-nav-address-container">
        <div class="game-nav-address" contenteditable="false" title="${steamUrl}">
          <span class="addr-icon">&#128274;</span>
          <span class="addr-domain">store.steampowered.com</span>
          <span class="addr-path">/app/${currentItem.appId || appId}/${slugName}</span>
        </div>
      </div>
      <div class="game-nav-spacer"></div>
    `;
    
    const prevBtn = navBarElement.querySelector('.prev-btn');
    const nextBtn = navBarElement.querySelector('.next-btn');
    const addressBar = navBarElement.querySelector('.game-nav-address');
    
    if (canGoBack && prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (historyIndex > 0) {
          historyIndex--;
          const prevItem = navigationHistory[historyIndex];
          router.navigate(`/game/${prevItem.appId}`);
        } else {
          sessionStorage.removeItem('gameDetailSource');
          router.navigate(source || '/library');
        }
      });
    }
    
    if (canGoForward && nextBtn) {
      nextBtn.addEventListener('click', () => {
        historyIndex++;
        const nextItem = navigationHistory[historyIndex];
        router.navigate(`/game/${nextItem.appId}`);
      });
    }
    
    if (addressBar) {
      addressBar.addEventListener('click', () => {
        navigator.clipboard.writeText(steamUrl).then(() => {
          addressBar.classList.add('copied');
          
          let pill = addressBar.parentElement.querySelector('.game-nav-toast');
          if (!pill) {
            pill = document.createElement('div');
            pill.className = 'game-nav-toast';
            pill.innerHTML = '&#10003; Скопировано';
            addressBar.parentElement.appendChild(pill);
          } else {
            pill.style.animation = 'none';
            pill.offsetHeight;
            pill.style.animation = null;
          }
          
          setTimeout(() => {
            addressBar.classList.remove('copied');
          }, 1500);
          
          setTimeout(() => {
            if (pill && pill.parentNode) {
              pill.remove();
            }
          }, 1800);
        });
      });
    }
  };

  const mountNavBar = () => {
    if (!navBarElement) {
      navBarElement = document.createElement('div');
      navBarElement.className = 'game-nav-bar';
      
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.parentNode.insertBefore(navBarElement, mainContent);
      }

      unsubscribeRoute = store.subscribe('currentRoute', (route) => {
        if (!route.startsWith('/game/')) {
          if (navBarElement) {
            navBarElement.remove();
            navBarElement = null;
          }
          if (unsubscribeRoute) {
            unsubscribeRoute();
            unsubscribeRoute = null;
          }
          navigationHistory = [];
          historyIndex = -1;
        }
      });
    }
    
    updateNavBar();
  };

  mountNavBar();

  // Setup wait and fetch
  try {
    currentDetails = await steamApi.getAppDetails(appId);
    const details = currentDetails;
    
    if (details && navigationHistory[historyIndex]) {
      navigationHistory[historyIndex].name = details.name;
      updateNavBar();
    }

    if (!details) {
      container.innerHTML = `
        <div class="error">
          <h3>Failed to load game details</h3>
          <p>The Steam Store API didn't return data for this game. It might be delisted or region locked.</p>
        </div>
      `;
    } else {
      
      const movies = details.movies || [];
      const genres = (details.genres || []).map(g => g.description).join(', ');
      const developers = (details.developers || []).join(', ');
      const publishers = (details.publishers || []).join(', ');
      
      // Combine movies and screenshots into a single media array
      if (details.movies) {
        details.movies.forEach(m => {
          const hlsSrc = m.hls_h264 ?? m.hls_av1 ?? null;
          
          if (hlsSrc) {
            currentMediaItems.push({
              type: 'video',
              src: hlsSrc,
              format: 'hls',
              thumbnail: m.thumbnail,
              title: m.name
            });
          }
        });
      }
      
      (details.screenshots || []).forEach(s => {
        currentMediaItems.push({
          type: 'image',
          src: s.path_full,
          thumbnail: s.path_thumbnail,
          title: ''
        });
      });
      
      const releaseDateFull = details.release_date?.coming_soon ? 'Скоро выйдет' : (details.release_date?.date || 'Неизвестно');

      // Setup price row (Primary: Store API, Fallback: Meta)
      let priceHtml = '';
      const priceOverview = details.price_overview;
      
      const shouldShowPrice = isFromWishlist || (!isFromLibrary && (priceOverview || details.is_free));

      if (shouldShowPrice) {
        if (details.is_free) {
          priceHtml = `<div class="store-price price-free">Бесплатно</div>`;
        } else if (priceOverview || (meta && meta.formattedFinal)) {
          const discount = priceOverview ? priceOverview.discount_percent : (meta?.discountPct || 0);
          const finalPrice = priceOverview ? priceOverview.final_formatted : meta?.formattedFinal;
          const originalPrice = priceOverview ? priceOverview.initial_formatted : meta?.formattedOriginal;

          const discountBox = discount > 0 
            ? `<div class="store-discount">-${discount}%</div>` 
            : '';
          const origPrice = (discount > 0 && originalPrice) 
            ? `<div class="store-price-original">${originalPrice}</div>` 
            : '';
          
          priceHtml = `
            <div class="detail-price-block">
              ${discountBox}
              <div class="store-price-cols">
               ${origPrice}
               <div class="store-price-final">${finalPrice}</div>
              </div>
              <button class="store-action-btn" onclick="window.open('https://store.steampowered.com/app/${appId}', '_blank')">В магазин</button>
            </div>
          `;
        }
      }

      container.innerHTML = `
        <div class="detail-content-wrapper" style="margin-top: 24px;">
          <div class="detail-main-col">
            ${isFromLibrary ? '<div id="detail-game-controls"></div>' : ''}
            
            ${currentMediaItems.length > 0
              ? '<div class="detail-hero" id="detail-media-player"></div>'
              : `<div class="detail-hero"><img src="${details.header_image}" alt="${details.name}" class="detail-cover" 
                  onerror="const self = this; self.onerror = null; window.electronAuth.steamGetCoverUrl('${appId}').then(url => { if (url) self.src = url; }).catch(() => {});" /></div>`
            }
            
            <div class="detail-description">
              ${details.short_description}
            </div>

            ${priceHtml ? `<div class="detail-price-row">${priceHtml}</div>` : ''}
            
            ${details.pc_requirements && (details.pc_requirements.minimum || details.pc_requirements.recommended) ? '<div id="detail-sysreqs"></div>' : ''}
            
            <div id="detail-achievements"></div>
          </div>
          
          <div class="detail-side-col">
            <h1 class="side-title">${details.name}</h1>
            <div class="info-card">
               <div class="info-row">
                 <span class="info-label">Дата выхода</span>
                 <span class="info-value">${releaseDateFull}</span>
               </div>
               <div class="info-row">
                 <span class="info-label">Разработчик</span>
                 <span class="info-value">${developers}</span>
               </div>
               <div class="info-row">
                 <span class="info-label">Издатель</span>
                 <span class="info-value">${publishers}</span>
               </div>
               <div class="info-row">
                  <span class="info-label">Жанр</span>
                  <span class="info-value">${genres}</span>
                </div>
             </div>
             <div id="price-regions-container"></div>
             <div id="game-cards-container"></div>
           </div>
        </div>
      `;

      // Render regional prices
      if (details?.price_overview || details?.is_free) {
        renderPriceRegions(appId, details, container.querySelector('#price-regions-container'));
      }

      // Render collectible trading cards block
      const cardsSlot = container.querySelector('#game-cards-container');
      if (cardsSlot) {
        cardsSlot.replaceWith(createGameCardsBlock(appId));
      }

      // Render achievements if logged in
      if (isFromLibrary) {
        renderAchievements(appId, container.querySelector('#detail-achievements'));
      }
    }

  } catch (err) {
    container.innerHTML = `
      <div class="error">Failed to structure game details: ${err.message}</div>
    `;
  }
  
  // --- Lightbox Slider Logic (Media) ---
  const createLightbox = (initialIndex) => {
    currentLightboxIndex = parseInt(initialIndex, 10);
    const maxIndex = currentMediaItems.length - 1;

    // 1. Create overlay container
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';

    // 2. Create the media wrapper (for hitboxes and content)
    const mediaWrapper = document.createElement('div');
    mediaWrapper.className = 'lightbox-img-wrapper';

    // 3. Create Hitboxes for left/right clicks
    const hitboxLeft = document.createElement('div');
    hitboxLeft.className = 'lightbox-hitbox hitbox-left';
    const hitboxRight = document.createElement('div');
    hitboxRight.className = 'lightbox-hitbox hitbox-right';

    // 4. Create Navigation Arrows
    const navPrev = document.createElement('button');
    navPrev.className = 'lightbox-nav nav-prev';
    navPrev.innerHTML = '&#10094;'; // '‹'

    const navNext = document.createElement('button');
    navNext.className = 'lightbox-nav nav-next';
    navNext.innerHTML = '&#10095;'; // '›'

    // 5. Create the close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'lightbox-close';
    closeBtn.innerHTML = '&#10005;'; // '✕'

    // 6. Append everything to overlay
    overlay.appendChild(navPrev);
    overlay.appendChild(mediaWrapper);
    overlay.appendChild(navNext);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    // Cleanup helper for video
    const pauseCurrentVideo = () => {
      const vid = mediaWrapper.querySelector('video');
      if (vid) {
        if (vid._hls) {
          vid._hls.destroy();
          vid._hls = null;
        }
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      }
    };

    // Update Media Function
    const updateMedia = () => {
      pauseCurrentVideo();
      mediaWrapper.innerHTML = ''; // clear previous media
      
      const item = currentMediaItems[currentLightboxIndex];
      let mediaNode;
      
      if (item.type === 'video') {
        mediaNode = document.createElement('video');
        mediaNode.className = 'lightbox-media-node lightbox-video';
        mediaNode.controls = true;
        
        // Push to DOM before volume setting for Electron/Chromium accuracy constraints
        mediaNode.style.opacity = '0';
        mediaWrapper.appendChild(mediaNode);

        if (window.Hls && window.Hls.isSupported() && item.format === 'hls') {
          const hls = new window.Hls();
          hls.loadSource(item.src);
          hls.attachMedia(mediaNode);
          mediaNode._hls = hls;
        } else {
          // Fallback parsing (Safari native / Electron)
          mediaNode.src = item.src;
        }
        
        // Safely restore volume preferences using isolated keys
        const videoPrefs = storage.get('video_prefs') || {};
        
        mediaNode.addEventListener('canplay', () => {
          mediaNode.volume = typeof videoPrefs.volume === 'number' ? videoPrefs.volume : 1.0;
          mediaNode.muted = videoPrefs.muted ?? false;
        }, { once: true });

        // Save volume changes uniquely
        mediaNode.addEventListener('volumechange', () => {
          const newPrefs = {
            volume: mediaNode.volume,
            muted: mediaNode.muted
          };
          storage.set('video_prefs', newPrefs);
        });

        mediaNode.autoplay = true;
      } else {
        mediaNode = document.createElement('img');
        mediaNode.className = 'lightbox-media-node lightbox-img';
        mediaNode.src = item.src;

        mediaNode.style.opacity = '0';
        mediaWrapper.appendChild(mediaNode);
      }
      
      // Hitboxes for clicks only apply visually & functionally towards images
      if (item.type !== 'video') {
        mediaWrapper.appendChild(hitboxLeft);
        mediaWrapper.appendChild(hitboxRight);
      }
      
      setTimeout(() => {
        mediaNode.style.opacity = '1';
        
        // Update nav buttons visibility
        navPrev.style.visibility = currentLightboxIndex === 0 ? 'hidden' : 'visible';
        navNext.style.visibility = currentLightboxIndex === maxIndex ? 'hidden' : 'visible';
        hitboxLeft.style.cursor = currentLightboxIndex === 0 ? 'default' : 'pointer';
        hitboxRight.style.cursor = currentLightboxIndex === maxIndex ? 'default' : 'pointer';
      }, 50);
    };

    // Navigation logic
    const goPrev = () => {
      if (currentLightboxIndex > 0) {
        currentLightboxIndex--;
        updateMedia();
      }
    };

    const goNext = () => {
      if (currentLightboxIndex < maxIndex) {
        currentLightboxIndex++;
        updateMedia();
      }
    };

    // 7. Close logic function
    const closeLightbox = () => {
      pauseCurrentVideo();
      document.removeEventListener('keydown', handleKeydown);
      overlay.remove();
    };

    // Keyboard navigation
    const handleKeydown = (e) => {
      const isVideoActive = currentMediaItems[currentLightboxIndex]?.type === 'video';
      
      if (e.key === 'Escape') closeLightbox();
      
      // Keyboard navigation is skipped for videos avoiding 'seek' mapping collision
      if (!isVideoActive) {
        if (e.key === 'ArrowLeft') goPrev();
        if (e.key === 'ArrowRight') goNext();
      }
    };
    document.addEventListener('keydown', handleKeydown);

    // Event Listeners
    closeBtn.addEventListener('click', closeLightbox);
    
    // Close on overlay background click (only if target is the overlay background)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightbox();
    });

    navPrev.addEventListener('click', goPrev);
    navNext.addEventListener('click', goNext);
    hitboxLeft.addEventListener('click', goPrev);
    hitboxRight.addEventListener('click', goNext);

    // Initial render
    updateMedia();
  };

  // Mount media player
  if (currentMediaItems.length > 0) {
    setTimeout(() => {
      const slot = container.querySelector('#detail-media-player');
      if (!slot) return;

      let activeIndex = 0;
      let activeHls = null;

      // --- DOM structure ---
      const wrap = document.createElement('div');
      wrap.className = 'detail-hero media-player';

      // Main viewer
      const viewer = document.createElement('div');
      viewer.className = 'media-viewer';

      const viewerInner = document.createElement('div');
      viewerInner.className = 'media-viewer-inner';
      viewer.appendChild(viewerInner);

      const btnPrev = document.createElement('button');
      btnPrev.className = 'media-viewer-nav nav-left';
      btnPrev.innerHTML = '&#10094;';

      const btnNext = document.createElement('button');
      btnNext.className = 'media-viewer-nav nav-right';
      btnNext.innerHTML = '&#10095;';

      viewer.appendChild(btnPrev);
      viewer.appendChild(btnNext);

      // Thumbnail strip
      const stripWrap = document.createElement('div');
      stripWrap.className = 'media-strip-wrap';

      const stripPrev = document.createElement('button');
      stripPrev.className = 'media-strip-btn strip-prev';
      stripPrev.innerHTML = '&#10094;';

      const strip = document.createElement('div');
      strip.className = 'media-strip';

      const stripNext = document.createElement('button');
      stripNext.className = 'media-strip-btn strip-next';
      stripNext.innerHTML = '&#10095;';

      stripWrap.appendChild(stripPrev);
      stripWrap.appendChild(strip);
      stripWrap.appendChild(stripNext);

      wrap.appendChild(viewer);
      wrap.appendChild(stripWrap);

      // Build thumbs
      const thumbEls = currentMediaItems.map((item, idx) => {
        const thumb = document.createElement('div');
        thumb.className = 'media-thumb';

        const img = document.createElement('img');
        img.src = item.thumbnail;
        img.alt = '';
        thumb.appendChild(img);

        if (item.type === 'video') {
          const play = document.createElement('div');
          play.className = 'media-thumb-play';
          play.textContent = '\u25b6';
          thumb.appendChild(play);
        }

        thumb.addEventListener('click', () => setActive(idx));
        strip.appendChild(thumb);
        return thumb;
      });

      // --- Helper: stop current video ---
      const stopCurrentVideo = () => {
        if (activeHls) {
          activeHls.destroy();
          activeHls = null;
        }
        const vid = viewerInner.querySelector('video');
        if (vid) {
          vid.pause();
          vid.removeAttribute('src');
          vid.load();
        }
      };

      // --- Helper: render main viewer ---
      const renderViewer = (item) => {
        stopCurrentVideo();
        viewerInner.innerHTML = '';
        viewerInner.style.opacity = '0';

        if (item.type === 'video') {
          const video = document.createElement('video');
          video.className = 'media-viewer-video';
          video.controls = true;
          video.autoplay = true;
          viewerInner.appendChild(video);

          if (window.Hls && window.Hls.isSupported() && item.format === 'hls') {
            const hls = new window.Hls();
            hls.loadSource(item.src);
            hls.attachMedia(video);
            activeHls = hls;
          } else {
            video.src = item.src;
          }

          const videoPrefs = storage.get('video_prefs') || {};
          video.addEventListener('canplay', () => {
            video.volume = typeof videoPrefs.volume === 'number' ? videoPrefs.volume : 1.0;
            video.muted = videoPrefs.muted ?? false;
          }, { once: true });
          video.addEventListener('volumechange', () => {
            storage.set('video_prefs', { volume: video.volume, muted: video.muted });
          });
        } else {
          const img = document.createElement('img');
          img.className = 'media-viewer-img';
          img.src = item.src;
          img.style.cursor = 'zoom-in';
          img.addEventListener('click', () => createLightbox(activeIndex));
          viewerInner.appendChild(img);
        }

        requestAnimationFrame(() => {
          viewerInner.style.transition = 'opacity 0.2s ease';
          viewerInner.style.opacity = '1';
        });

        // Nav button visibility
        btnPrev.style.opacity = activeIndex === 0 ? '0.2' : '1';
        btnNext.style.opacity = activeIndex === currentMediaItems.length - 1 ? '0.2' : '1';
      };

      // --- setActive ---
      const setActive = (idx) => {
        activeIndex = idx;
        currentLightboxIndex = idx;

        // Update thumbs
        thumbEls.forEach((t, i) => t.classList.toggle('media-thumb--active', i === idx));
        // Scroll thumb into view
        thumbEls[idx]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        // Render main viewer
        renderViewer(currentMediaItems[idx]);
      };

      // Nav arrows (main viewer)
      btnPrev.addEventListener('click', () => {
        if (activeIndex > 0) setActive(activeIndex - 1);
      });
      btnNext.addEventListener('click', () => {
        if (activeIndex < currentMediaItems.length - 1) setActive(activeIndex + 1);
      });

      // Strip scroll arrows
      stripPrev.addEventListener('click', () => strip.scrollBy({ left: -300, behavior: 'smooth' }));
      stripNext.addEventListener('click', () => strip.scrollBy({ left: 300, behavior: 'smooth' }));

      slot.replaceWith(wrap);
      setActive(0);
    }, 0);
  }

  // Mount game controls (only from library)
  if (isFromLibrary) {
    setTimeout(async () => {
      const slot = container.querySelector('#detail-game-controls');
      if (slot) {
        const isOwned = await checkIsOwnedGame(appId);
        if (isOwned) {
          let isInstalled = false;
          // Check installation status through IPC
          if (window.electronAuth && window.electronAuth.steamIsInstalled) {
            isInstalled = await window.electronAuth.steamIsInstalled(appId);
          }
          const controls = await renderGameControls(appId, isInstalled);
          slot.replaceWith(controls);
        } else {
          slot.remove();
        }
      }
    }, 0);
  }

  // Mount system requirements
  setTimeout(() => {
    const sysreqSlot = container.querySelector('#detail-sysreqs');
    if (!sysreqSlot || !currentDetails?.pc_requirements) return;

    const req = currentDetails.pc_requirements;
    const hasRecommended = !!req.recommended;

    const section = document.createElement('div');
    section.className = 'detail-sysreqs';

    const heading = document.createElement('h3');
    heading.textContent = 'Системные требования';
    section.appendChild(heading);

    const cols = document.createElement('div');
    cols.className = 'sysreqs-cols' + (hasRecommended ? ' two-cols' : '');

    if (req.minimum) {
      const minCol = document.createElement('div');
      minCol.className = 'sysreqs-col';
      minCol.innerHTML = sanitizeRequirements(req.minimum);
      cols.appendChild(minCol);
    }

    if (hasRecommended) {
      const sep = document.createElement('div');
      sep.className = 'sysreqs-sep';
      cols.appendChild(sep);

      const recCol = document.createElement('div');
      recCol.className = 'sysreqs-col';
      recCol.innerHTML = sanitizeRequirements(req.recommended);
      cols.appendChild(recCol);
    }

    section.appendChild(cols);
    sysreqSlot.replaceWith(section);
  }, 0);
  


  const style = document.createElement('style');
  style.textContent = `
    .game-detail-page {
      padding: 0 40px;
      max-width: 1200px;
      margin: 0 auto;
      animation: fadeIn 0.3s ease;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    /* Game Detail Controls (Library only) */
    .game-detail-controls {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      padding: 12px 16px;
      background: #111;
      border: 1px solid #1e1e1e;
      border-radius: 10px;
      animation: fadeIn 0.3s ease;
    }
    .game-detail-controls .idle-switch {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .game-detail-controls .idle-label {
      font-size: 12px;
      color: #555;
      user-select: none;
    }
    .game-detail-controls .switch-control {
      position: relative;
      width: 28px;
      height: 16px;
      background: #2a2a2a;
      border-radius: 8px;
      transition: background 200ms ease;
    }
    .game-detail-controls .switch-control input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }
    .game-detail-controls .switch-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
      transition: transform 200ms ease;
    }
    .game-detail-controls .switch-control:has(input:checked) .switch-thumb {
      transform: translateX(12px);
    }
    .game-detail-controls .switch-control:has(input:checked) {
      background: #22c55e;
    }
    .game-detail-controls .detail-play-btn {
      padding: 6px 20px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 7px;
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      color: #888;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
    }
    .game-detail-controls .detail-play-btn:hover {
      background: #f5f5f5;
      color: #111;
      border-color: #f5f5f5;
    }

    .game-detail-controls .btn-install {
      padding: 5px 12px; 
      font-size: 12px; 
      font-weight: 500;
      border-radius: 6px;
      background: #1a1a1a; 
      border: 1px solid rgba(255, 255, 255, 0.1); 
      color: #888; 
      cursor: pointer;
      transition: background 0.2s, color 0.2s, transform 0.2s;
    }
    .game-detail-controls .btn-install:hover {
      background: #f5f5f5;
      color: #111;
    }
    .game-detail-controls .btn-install:active {
      transform: scale(0.96);
    }

    /* Game Nav Bar */
    .game-nav-bar {
      display: flex;
      align-items: center;
      padding: 8px 24px;
      background: rgba(13, 13, 13, 0.7);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .game-nav-buttons {
      display: flex;
      gap: 6px;
      flex: 1;
    }
    .game-nav-btn {
      background: transparent;
      border: none;
      color: var(--color-text-primary);
      width: 30px;
      height: 30px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      cursor: pointer;
      transition: background 0.15s;
      padding: 0;
    }
    .game-nav-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
    }
    .game-nav-btn:disabled {
      opacity: 0.25;
      cursor: default;
    }
    .game-nav-address-container {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      flex: 2;
    }
    .game-nav-address {
      background: rgba(0, 0, 0, 0.45);
      border: 1px solid var(--color-border);
      border-radius: 20px;
      padding: 5px 18px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
      transition: border-color 0.2s, background 0.2s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 460px;
      font-family: var(--font-family-base);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .addr-icon {
      font-style: normal;
      font-size: 10px;
      opacity: 0.6;
      flex-shrink: 0;
    }
    .addr-domain {
      color: var(--color-text-primary);
      font-weight: 500;
    }
    .addr-path {
      color: var(--color-text-secondary);
      font-weight: 400;
    }
    .game-nav-address:hover .addr-domain {
      opacity: 0.9;
    }
    .game-nav-address:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.18);
    }
    .game-nav-address.copied {
      border-color: #10b981;
      background: rgba(16, 185, 129, 0.08);
    }
    .game-nav-address.copied .addr-domain,
    .game-nav-address.copied .addr-path,
    .game-nav-address.copied .addr-icon {
      color: #10b981;
    }
    .game-nav-spacer {
      flex: 1;
    }
    .game-nav-toast {
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: #000;
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      pointer-events: none;
      z-index: 100;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
      animation: pillFade 1.8s ease forwards;
    }
    @keyframes pillFade {
      0%   { opacity: 0; transform: translateX(-50%) translateY(-4px); }
      10%  { opacity: 1; transform: translateX(-50%) translateY(0); }
      80%  { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
    }
    
    .detail-content-wrapper {
      display: flex;
      flex-direction: column;
      gap: 32px;
    }
    @media (min-width: 900px) {
      .detail-content-wrapper {
        flex-direction: row;
      }
      .detail-main-col {
        flex: 1;
        min-width: 0;
      }
      .detail-side-col {
        width: 320px;
        flex-shrink: 0;
      }
    }
    
    .side-title {
      margin: 0 0 16px 0;
      font-size: 24px;
      font-weight: 700;
      color: var(--color-text-primary);
      line-height: 1.2;
    }
    
    .detail-hero {
      margin-bottom: 24px;
      border-radius: 12px;
      overflow: hidden;
      background: #111;
      border: 1px solid #222;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    /* When detail-hero IS the media player, reset card styles */
    .detail-hero.media-player {
      background: none;
      border: none;
      box-shadow: none;
      overflow: visible;
      border-radius: 0;
      padding: 0;
    }
    
    .detail-cover {
      width: 100%;
      height: auto;
      display: block;
      aspect-ratio: 460/215;
      object-fit: cover;
    }
    
    .detail-price-row {
      margin: 10px 0 24px 0;
    }
    .detail-price-block {
      display: flex;
      align-items: center;
      padding: 16px 24px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      gap: 20px;
      backdrop-filter: blur(10px);
    }
    
    .store-discount {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      padding: 6px 10px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 1.2rem;
    }
    
    .store-price-cols {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .store-price-original {
      color: #666;
      text-decoration: line-through;
      font-size: 0.85rem;
    }
    
    .store-price-final {
      font-weight: 600;
      font-size: 1.2rem;
      color: var(--text-primary);
    }
    
    .store-action-btn {
      margin-left: auto;
      background: var(--color-action-primary);
      color: var(--color-bg-base);
      border: none;
      padding: 10px 24px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, filter 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
    }
    .store-action-btn:hover {
      transform: translateY(-1px);
      filter: brightness(1.1);
      box-shadow: 0 6px 16px rgba(255, 255, 255, 0.15);
    }
    
    .detail-description {
      font-size: 15px;
      line-height: 1.6;
      color: #ccc;
      background: #111;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #222;
      margin-bottom: 24px;
    }
    
    /* Media Player */
    .media-player {
      margin-bottom: 24px;
    }
    .media-viewer {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      aspect-ratio: 16/9;
      margin-bottom: 8px;
    }
    .media-viewer-inner {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s ease;
    }
    .media-viewer-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .media-viewer-video {
      width: 100%;
      height: 100%;
      display: block;
      outline: none;
      background: #000;
    }
    .media-viewer-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(0,0,0,0.55);
      border: none;
      color: rgba(255,255,255,0.85);
      width: 40px;
      height: 64px;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
      z-index: 2;
      border-radius: 4px;
    }
    .nav-left { left: 0; border-radius: 0 4px 4px 0; }
    .nav-right { right: 0; border-radius: 4px 0 0 4px; }
    .media-viewer-nav:hover { background: rgba(0,0,0,0.8); }
    /* Strip */
    .media-strip-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .media-strip {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      scroll-behavior: smooth;
      scrollbar-width: none;
      flex: 1;
    }
    .media-strip::-webkit-scrollbar { display: none; }
    .media-strip-btn {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--color-text-secondary);
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s;
    }
    .media-strip-btn:hover { background: rgba(255,255,255,0.12); }
    .media-thumb {
      position: relative;
      flex-shrink: 0;
      width: 130px;
      height: 73px;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      border: 2px solid transparent;
      transition: border-color 0.15s, opacity 0.15s;
    }
    .media-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .media-thumb:hover { opacity: 0.8; }
    .media-thumb--active {
      border-color: var(--color-action-primary);
    }
    .media-thumb-play {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: rgba(255,255,255,0.9);
      background: rgba(0,0,0,0.4);
    }

    
    .detail-sysreqs {
      margin-top: 24px;
    }
    .detail-sysreqs h3 {
      margin: 0 0 16px;
      font-size: 18px;
      color: var(--color-text-primary);
    }
    .sysreqs-cols {
      background: #111;
      border: 1px solid #1e1e1e;
      border-radius: 12px;
      padding: 20px 24px;
      font-size: 13px;
      line-height: 1.65;
      color: var(--color-text-secondary);
    }
    .sysreqs-cols.two-cols {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 0;
    }
    .sysreqs-col {
      padding: 0 4px;
    }
    .sysreqs-cols.two-cols .sysreqs-col:first-child {
      padding-right: 24px;
    }
    .sysreqs-cols.two-cols .sysreqs-col:last-child {
      padding-left: 24px;
    }
    .sysreqs-sep {
      width: 1px;
      background: var(--color-border);
      align-self: stretch;
    }
    /* Steam API injects strong, br, ul — style them */
    .sysreqs-col strong {
      color: var(--color-text-primary);
      font-weight: 600;
    }
    .sysreqs-col ul {
      margin: 4px 0;
      padding-left: 16px;
    }
    .sysreqs-col li {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }
    /* Hide the <br> Steam puts between label and value inside each <li> */
    .sysreqs-col li br {
      display: none;
    }
    /* Ensure the strong label doesn't stretch — value flows next to it */
    .sysreqs-col li strong {
      flex-shrink: 0;
    }
    /* The "MINIMUM:" / "RECOMMENDED:" header line Steam wraps in <strong> */
    .sysreqs-col > strong:first-child,
    .sysreqs-col > br + strong,
    .sysreqs-col strong:has(+ br) {
      display: block;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-text-secondary);
      margin-bottom: 10px;
      font-weight: 500;
    }
    
    .screenshots-scroll {
      display: flex;
      gap: 12px;
      overflow-x: auto;
      padding-bottom: 12px;
    }
    .screenshots-scroll::-webkit-scrollbar {
      height: 6px;
    }
    .screenshots-scroll::-webkit-scrollbar-thumb {
      background: #333;
      border-radius: 3px;
    }
    
    .detail-media-thumb {
      position: relative;
      height: 120px;
      border-radius: 8px;
      border: 1px solid #222;
      cursor: pointer;
      transition: border-color 0.2s;
      flex-shrink: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      background: #0a0a0a;
    }
    .detail-media-thumb:hover {
      border-color: #555;
    }
    .detail-media-thumb img {
      height: 100%;
      width: auto;
      display: block;
    }
    .media-play-icon {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 40px;
      background: rgba(0, 0, 0, 0.6);
      border-radius: 50%;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      padding-left: 2px; /* Polish visual centering for triangle */
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      transition: background 0.2s, transform 0.2s;
    }
    .detail-media-thumb:hover .media-play-icon {
      background: rgba(0, 0, 0, 0.8);
      transform: translate(-50%, -50%) scale(1.1);
    }
    
    .info-card {
      background: #111;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 14px;
    }
    .info-label {
      color: #666;
      font-weight: 500;
    }
    .info-value {
      color: #ddd;
      text-align: right;
    }
    
    /* Lightbox Styles */
    .lightbox-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: lightboxFadeIn 0.2s ease forwards;
    }
    
    .lightbox-img-wrapper {
      position: relative;
      max-width: 90%;
      max-height: 90%;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .lightbox-media-node {
      max-width: 100%;
      max-height: 90vh;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.8);
      animation: lightboxImgScale 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: opacity 0.15s ease-in-out;
    }
    
    .lightbox-img {
      object-fit: contain;
    }
    
    .lightbox-video {
      background: #000;
      outline: none;
    }
    
    /* Invisible hitboxes over the image */
    .lightbox-hitbox {
      position: absolute;
      top: 0;
      width: 45%; 
      z-index: 2;
    }
    .hitbox-left {
      left: 0;
    }
    .hitbox-right {
      right: 0;
    }
    
    /* Navigation Arrows */
    .lightbox-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 60px;
      height: 60px;
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      font-size: 48px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      z-index: 3;
      padding-bottom: 6px; /* optical vertical align */
    }
    .lightbox-nav:hover {
      color: #fff;
      transform: translateY(-50%) scale(1.1);
    }
    .nav-prev {
      left: 20px;
    }
    .nav-next {
      right: 20px;
    }
    
    .lightbox-close {
      position: absolute;
      top: 24px;
      right: 24px;
      width: 44px;
      height: 44px;
      background: rgba(20, 20, 20, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-radius: 50%;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    
    .lightbox-close:hover {
      background: rgba(255, 255, 255, 0.15);
      transform: scale(1.05);
    }
    
    @keyframes lightboxFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes lightboxImgScale {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }

    /* Regional Prices */
    .price-regions-card {
      margin-top: 16px;
      padding: 0;
      overflow: visible; /* Changed from hidden to prevent clipping */
    }
    .price-regions-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text-primary);
      border-radius: 12px 12px 0 0;
    }
    .price-regions-list {
      display: flex;
      flex-direction: column;
    }
    .region-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      animation: fadeIn 0.3s ease-out;
    }
    .region-row:last-child {
      border-bottom: none;
    }
    .region-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .region-name {
      font-size: 13px;
      color: #ddd;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .region-flag {
      width: 18px;
      height: 14px;
      object-fit: cover;
      border-radius: 2px;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }
    .region-code {
      font-size: 11px;
      color: #666;
    }
    .region-price-box {
      text-align: right;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .region-price {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .region-diff {
      font-size: 11px;
      font-weight: 500;
    }
    .diff-positive { color: var(--color-danger); }
    .diff-negative { color: var(--color-accent-green); }
    .diff-neutral { color: #666; }

    .region-remove-btn {
      background: none;
      border: none;
      color: #555;
      cursor: pointer;
      padding: 4px;
      font-size: 10px;
      margin-left: 8px;
      transition: color 0.2s;
      opacity: 0;
    }
    .region-row:hover .region-remove-btn {
      opacity: 1;
    }
    .region-remove-btn:hover {
      color: var(--color-danger);
    }

    .add-region-block {
      padding: 12px 20px;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 0 0 12px 12px;
    }
    .add-region-btn {
      width: 100%;
      padding: 8px;
      background: none;
      border: 1px dashed rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: var(--color-text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .add-region-btn:hover {
      border-color: rgba(255, 255, 255, 0.2);
      color: var(--color-text-primary);
      background: rgba(255, 255, 255, 0.02);
    }

    .region-skeleton {
      height: 48px;
      position: relative;
      overflow: hidden;
    }
    .region-skeleton::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent);
      animation: skeleton-shimmer 1.5s infinite;
    }
    @keyframes skeleton-shimmer {
      from { transform: translateX(-100%); }
      to { transform: translateX(100%); }
    }
  `;
  container.appendChild(style);
  
  return {
    element: container,
    cleanup: () => {
      console.log(`[GameDetail] Cleaning up achievements for appId: ${appId}`);
      if (window.electronAuth && window.electronAuth.achievementsClose) {
        window.electronAuth.achievementsClose().catch(err => {
          console.error('[Achievements] Close error:', err);
        });
      }
      if (String(store.get('runningAppId')) === String(appId)) {
        store.set('runningAppId', null);
      }
    }
  };
}

/**
 * Helper to get flag SVG URL from country code
 */
function getFlagUrl(code) {
  if (code === 'GE_GLOBE') return 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/png/128/emoji_u1f30d.png'; // Globe emoji fallback if GE flag is not desired
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

/**
 * Renders the regional price comparison section
 */
async function renderPriceRegions(appId, details, parentContainer) {
  const userPriceObj = details.price_overview || { final: 0, final_formatted: details.is_free ? 'Бесплатно' : 'Н/Д', currency: 'USD' };
  
  const regionsCard = document.createElement('div');
  regionsCard.className = 'info-card price-regions-card';
  regionsCard.innerHTML = `
    <div class="price-regions-header">Цены по регионам</div>
    <div class="price-regions-list">
      <div class="region-row" id="user-region-row">
        <div class="region-info">
          <div class="region-name"><img src="${getFlagUrl('ge')}" class="region-flag"> Ваш регион (GE)</div>
        </div>
        <div class="region-price-box">
          <div class="region-price">${userPriceObj.final_formatted}</div>
        </div>
      </div>
    </div>
    <div class="add-region-block">
      <button class="add-region-btn">+ Добавить регион</button>
    </div>
  `;
  
  parentContainer.appendChild(regionsCard);
  
  const listContainer = regionsCard.querySelector('.price-regions-list');
  const addBtn = regionsCard.querySelector('.add-region-btn');

  // Helper: Fetch exchange rates with 24h cache
  const getUSDRates = async () => {
    const cached = cache.get('usd_rates');
    if (cached) return cached;
    
    try {
      const res = await fetch('/api/rates/v6/latest/USD');
      const data = await res.json();
      if (data && data.rates) {
        cache.set('usd_rates', data.rates, CACHE_TTL.RATES);
        return data.rates;
      }
    } catch (e) {
      console.error('Failed to fetch exchange rates', e);
    }
    return null;
  };

  const calcDiffPercent = async (regionPriceData) => {
    if (details.is_free || !userPriceObj.final || !regionPriceData.final) return null;
    
    const rates = await getUSDRates();
    if (!rates) return null;

    // Convert both to USD: final is in cents (so / 100)
    const userUSD = (userPriceObj.final / 100) / (rates[userPriceObj.currency] || 1);
    const regionUSD = (regionPriceData.final / 100) / (rates[regionPriceData.currency] || 1);

    const diff = ((regionUSD - userUSD) / userUSD) * 100;
    const sign = diff > 0 ? '+' : '';
    const percentage = Math.round(diff);
    
    const colorClass = percentage < 0 ? 'diff-negative' : (percentage > 0 ? 'diff-positive' : 'diff-neutral');
    return { text: `${sign}${percentage}%`, colorClass };
  };
  
  // Storage logic
  const getSavedRegions = () => {
    const saved = storage.get('price_regions');
    return saved?.codes || [];
  };
  
  const saveRegion = (code) => {
    const codes = getSavedRegions();
    if (!codes.includes(code)) {
      storage.set('price_regions', { codes: [...codes, code] });
      return true;
    }
    return false;
  };
  
  const removeSavedRegion = (code) => {
    const codes = getSavedRegions().filter(c => c !== code);
    storage.set('price_regions', { codes });
  };

  const fetchAndAddRegion = async (code, animate = false) => {
    // Check if already in list
    if (listContainer.querySelector(`[data-region-code="${code}"]`)) return;

    const regionMeta = REGIONS.find(r => r.code === code);
    if (!regionMeta) return;

    // Create skeleton
    const skeleton = document.createElement('div');
    skeleton.className = 'region-row region-skeleton';
    skeleton.dataset.regionCode = code;
    listContainer.appendChild(skeleton);

    try {
      const priceData = await steamApi.getAppPrice(appId, code);
      skeleton.remove();

      const row = document.createElement('div');
      row.className = 'region-row';
      row.dataset.regionCode = code;
      if (animate) row.style.animation = 'fadeIn 0.5s ease-out';

      const isUnavailable = priceData.unavailable;
      const priceText = isUnavailable ? 'Недоступно' : (details.is_free ? 'Бесплатно' : priceData.final_formatted);
      const diff = isUnavailable ? null : await calcDiffPercent(priceData);

      row.innerHTML = `
        <div class="region-info">
          <div class="region-name"><img src="${getFlagUrl(code)}" class="region-flag"> ${regionMeta.name} (${code})</div>
        </div>
        <div class="region-price-box">
          <div class="region-price">${priceText}</div>
          ${diff ? `<div class="region-diff ${diff.colorClass}">${diff.text}</div>` : ''}
        </div>
        <button class="region-remove-btn" title="Удалить">✕</button>
      `;

      row.querySelector('.region-remove-btn').addEventListener('click', () => {
        row.remove();
        removeSavedRegion(code);
      });

      listContainer.appendChild(row);
    } catch (e) {
      console.error('Failed to load region price', e);
      skeleton.remove();
    }
  };

  // Initial load
  const savedCodes = getSavedRegions();
  if (savedCodes.length > 0) {
    Promise.all(savedCodes.map(code => fetchAndAddRegion(code)));
  }

  // Dropdown logic
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // If dropdown already open, close it
    const existingDropdown = regionsCard.querySelector('.add-region-dropdown-wrap');
    if (existingDropdown) {
      existingDropdown.remove();
      return;
    }

    const dropdownWrap = document.createElement('div');
    dropdownWrap.className = 'add-region-dropdown-wrap';
    dropdownWrap.style.marginTop = '8px';
    
    // Create options for dropdown
    const options = REGIONS
      .filter(r => r.code !== 'GE') // Exclude current "Your Region" logic if specific
      .map(r => ({ value: r.code, label: `<img src="${getFlagUrl(r.code)}" class="region-flag" style="display:inline-block; vertical-align:middle; margin-right:8px; width:16px; height:12px;"> ${r.name}` }));

    const dropdown = createDropdown({
      options,
      onChange: (code) => {
        if (saveRegion(code)) {
          fetchAndAddRegion(code, true);
        } else {
          toast.show('Регион уже добавлен', 'warning');
        }
        dropdownWrap.remove();
      }
    });

    dropdownWrap.appendChild(dropdown);
    addBtn.parentNode.appendChild(dropdownWrap);
    
    // Close on click outside
    const clickHandler = (event) => {
      if (!dropdownWrap.contains(event.target) && event.target !== addBtn) {
        dropdownWrap.remove();
        document.removeEventListener('click', clickHandler);
      }
    };
    document.addEventListener('click', clickHandler);
  });
}

/**
 * Renders Steam Achievements using SAMBackend API
 */
async function renderAchievements(appId, parentContainer) {
  if (!window.electronAuth || !window.electronAuth.achievementsLoad) return;

  const section = document.createElement('div');
  section.className = 'detail-achievements-section';
  section.innerHTML = `
    <h3 class="achievements-title">Достижения</h3>
    <div class="achievements-loading">Загрузка достижений...</div>
  `;
  parentContainer.appendChild(section);

  try {
    const res = await window.electronAuth.achievementsLoad(Number(appId));
    
    if (!res || !res.success) {
      section.innerHTML = `
        <h3 class="achievements-title">Достижения</h3>
        <div class="achievements-error">
          Не удалось загрузить достижения: ${res?.error || 'Неизвестная ошибка'}
        </div>
      `;
      return;
    }

    // Mark game as running since SAM backend is active
    store.set('runningAppId', appId);

    let achievements = res.achievements || [];
    if (achievements.length === 0) {
      section.innerHTML = `
        <h3 class="achievements-title">Достижения</h3>
        <div class="achievements-empty">В этой игре нет достижений.</div>
      `;
      return;
    }

    let currentFilter = 'all'; // 'all' | 'locked' | 'unlocked'

    // Styles for the filter and new layout
    const style = document.createElement('style');
    style.textContent = `
      .detail-achievements-section { margin-top: 32px; }
      .achievements-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        flex-wrap: wrap;
        gap: 16px;
      }
      .achievements-title { margin: 0; font-size: 18px; color: var(--color-text-primary); }
      
      .achievements-controls { display: flex; align-items: center; gap: 12px; }

      /* Filter Tabs */
      .achievements-filter {
        display: flex;
        gap: 2px;
        background: #0f0f0f;
        border: 1px solid #1e1e1e;
        border-radius: 8px;
        padding: 3px;
      }
      .filter-tab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.15s ease;
        background: transparent;
        color: #555;
        font-weight: 400;
      }
      .filter-tab.active {
        background: #1e1e1e;
        color: #f5f5f5;
        font-weight: 600;
      }
      .filter-count {
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 10px;
        background: #1a1a1a;
        color: var(--color-text-primary);
      }
      .filter-tab.active .filter-count { color: #888; background: #2a2a2a; }
      .filter-tab.active[data-filter="unlocked"] .filter-count { color: #22c55e; background: #16532b; }
      .filter-tab.active[data-filter="locked"] .filter-count { color: #f59e0b; background: #4a3000; }

      .btn-unlock-all {
        padding: 7px 16px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 8px;
        background: transparent;
        border: 1px solid #22c55e;
        color: #22c55e;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-unlock-all:hover { background: rgba(34, 197, 94, 0.1); }

      .achievements-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 12px;
      }
      .achievement-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: #111;
        border: 1px solid #222;
        border-radius: 8px;
        transition: border-color 0.2s;
      }
      .achievement-card:hover { border-color: #333; }
      .achievement-card.locked { opacity: 0.6; }
      .achievement-card.locked .achievement-icon { filter: grayscale(100%); }
      .achievement-icon { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; }
      .achievement-info { flex: 1; min-width: 0; }
      .achievement-name { font-size: 14px; font-weight: 600; color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .achievement-desc { font-size: 12px; color: var(--color-text-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      
      .btn-toggle-achievement {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: var(--color-text-secondary);
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .btn-toggle-achievement:hover { background: rgba(255, 255, 255, 0.05); color: var(--color-text-primary); }
      .achievement-card.locked .btn-toggle-achievement { color: #22c55e; border-color: rgba(34, 197, 94, 0.3); }
      .achievement-card.locked .btn-toggle-achievement:hover { background: rgba(34, 197, 94, 0.1); }

      .achievements-empty, .achievements-error {
        padding: 24px;
        background: #111;
        border-radius: 8px;
        text-align: center;
        color: var(--color-text-secondary);
        font-size: 14px;
      }
    `;
    section.appendChild(style);

    const render = () => {
      const lockedCount = achievements.filter(a => !a.unlocked).length;
      const unlockedCount = achievements.filter(a => a.unlocked).length;
      
      const filtered = achievements.filter(a => {
        if (currentFilter === 'locked') return !a.unlocked;
        if (currentFilter === 'unlocked') return a.unlocked;
        return true;
      });

      section.innerHTML = '';
      section.appendChild(style);

      const header = document.createElement('div');
      header.className = 'achievements-header';
      header.innerHTML = `
        <h3 class="achievements-title">Достижения (${unlockedCount} / ${achievements.length})</h3>
        <div class="achievements-controls">
          <div class="achievements-filter">
            <button class="filter-tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">
              Все <span class="filter-count">${achievements.length}</span>
            </button>
            <button class="filter-tab ${currentFilter === 'locked' ? 'active' : ''}" data-filter="locked">
              Не получены <span class="filter-count">${lockedCount}</span>
            </button>
            <button class="filter-tab ${currentFilter === 'unlocked' ? 'active' : ''}" data-filter="unlocked">
              Получены <span class="filter-count">${unlockedCount}</span>
            </button>
          </div>
          <button class="btn-unlock-all">Разблокировать все</button>
        </div>
      `;
      section.appendChild(header);

      const list = document.createElement('div');
      list.className = 'achievements-list';
      
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'achievements-empty';
        empty.textContent = currentFilter === 'locked' ? 'Все достижения получены!' : 'Нет достижений в этой категории.';
        section.appendChild(empty);
      } else {
        filtered.forEach(a => {
          const card = document.createElement('div');
          card.className = `achievement-card ${a.unlocked ? 'unlocked' : 'locked'}`;
          card.dataset.id = a.id;
          
          const icon = (a.unlocked ? a.iconUrl : (a.iconLockedUrl || a.iconUrl)) 
            || 'https://steamcommunity-a.akamaihd.net/public/images/sharedfiles/default_image_achievements.png';
          
          card.innerHTML = `
            <img src="${icon}" class="achievement-icon" />
            <div class="achievement-info">
              <div class="achievement-name">${a.name}</div>
              <div class="achievement-desc">${a.description || (a.hidden ? 'Скрытое достижение' : '')}</div>
            </div>
            <div class="achievement-action">
              <button class="btn-toggle-achievement" data-id="${a.id}" data-action="${a.unlocked ? 'lock' : 'unlock'}">
                ${a.unlocked ? 'Заблокировать' : 'Разблокировать'}
              </button>
            </div>
          `;
          
          card.querySelector('.btn-toggle-achievement').addEventListener('click', async (e) => {
            const achId = e.currentTarget.dataset.id;
            const action = e.currentTarget.dataset.action;
            const method = action === 'unlock' ? window.electronAuth.achievementsUnlock : window.electronAuth.achievementsLock;
            
            const resp = await method(Number(appId), achId);
            if (resp && resp.success) {
              toast.show(`Достижение ${action === 'unlock' ? 'разблокировано' : 'заблокировано'}`, 'success');
              // Update local data and re-render
              const ach = achievements.find(x => x.id === achId);
              if (ach) ach.unlocked = (action === 'unlock');
              render();
            } else {
              toast.show('Ошибка: ' + (resp?.error || 'Неизвестная ошибка'), 'error');
            }
          });
          
          list.appendChild(card);
        });
        section.appendChild(list);
      }

      // Header Listeners
      header.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          currentFilter = tab.dataset.filter;
          render();
        });
      });

      header.querySelector('.btn-unlock-all').addEventListener('click', async () => {
        const resp = await window.electronAuth.achievementsUnlockAll(Number(appId));
        if (resp && resp.success) {
          toast.show(`Разблокировано ${resp.count} достижений`, 'success');
          // Update all local data to unlocked
          achievements.forEach(a => a.unlocked = true);
          render();
        } else {
          toast.show('Ошибка: ' + (resp?.error || 'Неизвестная ошибка'), 'error');
        }
      });
    };

    render();

  } catch (err) {
    // Тихо убрать секцию если запрос был отменён (debounce)
    if (err.cancelled) {
      section.remove();
      return;
    }
    section.innerHTML = `
      <h3 class="achievements-title">Достижения</h3>
      <div class="achievements-error">Ошибка: ${err.message}</div>
    `;
  }
}

