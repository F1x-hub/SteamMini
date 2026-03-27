import steamApi from '../api/steam.js';
import storage from '../utils/storage.js';
import store from '../store/index.js';
import router from '../router/index.js';
import { createDropdown } from '../components/dropdown.js';

// Placeholder SVG for missing game images
const PLACEHOLDER_IMG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215"><rect fill="%231b2838" width="460" height="215"/><text fill="%2366c0f4" font-family="Arial" font-size="18" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>')}`;

/**
 * Parse a wishlist item from either GetWishlistSortedFiltered (enriched)
 * or GetWishlist (basic) response format.
 */
function parseWishlistItem(item) {
  const appid = item.appid;
  const si = item.store_item || item.item || {};
  const basicInfo = si.basic_info || si;
  const assets = si.assets || {};
  const release = si.release || {};
  const reviews = si.reviews?.summary_filtered || si.reviews || {};
  const purchase = si.best_purchase_option || {};

  // Name: try multiple possible locations
  const name = basicInfo.name || si.name || item.name || `App ${appid}`;

  // Image: The enriched API provides an 'asset_url_format' like "steam/apps/1086940/${FILENAME}?t=..."
  // and specific filenames like "assets.header".
  let capsule = '';
  const assetFilename = assets.header || assets.main_capsule || assets.small_capsule;
  
  if (assets.asset_url_format && assetFilename) {
    const relativeUrl = assets.asset_url_format.replace('${FILENAME}', assetFilename);
    // Steam CDN requires /store_item_assets/ before the relative path
    capsule = `https://shared.akamai.steamstatic.com/store_item_assets/${relativeUrl}`;
  } else {
    // Fallback if formatting info is missing
    capsule = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`;
  }

  // Price info
  const finalPrice = purchase.final_price_in_cents ?? purchase.final_price ?? null;
  const originalPrice = purchase.original_price_in_cents ?? purchase.original_price ?? null;
  const discountPct = purchase.discount_pct ?? 0;
  const formattedFinal = purchase.formatted_final_price || null;
  const formattedOriginal = purchase.formatted_original_price || null;
  const isFree = si.is_free || basicInfo.is_free_game || false;

  // Release
  const releaseDate = release.steam_release_date || release.release_date || null;
  const comingSoon = release.coming_soon || false;
  const releaseDateFormatted = release.custom_release_date_message || null;

  // Reviews
  const reviewScore = reviews.review_score ?? item.review_score ?? 0;
  const reviewLabel = reviews.review_score_label || reviews.review_desc || '';
  const reviewCount = reviews.review_count ?? 0;
  const reviewPercent = reviews.percent_positive ?? 0;

  return {
    appid,
    name,
    capsule,
    priority: item.priority ?? 0,
    added: item.date_added ?? 0,
    isFree,
    finalPrice,
    originalPrice,
    discountPct,
    formattedFinal,
    formattedOriginal,
    releaseDate,
    comingSoon,
    releaseDateFormatted,
    reviewScore,
    reviewLabel,
    reviewCount,
    reviewPercent
  };
}

export async function renderWishlist() {
  const container = document.createElement('div');
  container.className = 'page-container wishlist-page';
  
  // Create style element ONCE and keep reference
  const style = document.createElement('style');
  style.textContent = `
    .wishlist-page { padding: var(--spacing-lg) var(--spacing-xl); max-width: 1000px; margin: 0 auto; }
    .wishlist-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-xl); flex-wrap: wrap; gap: var(--spacing-sm); }
    .wishlist-header h2 { margin: 0; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
    .controls { display: flex; gap: var(--spacing-md); align-items: center; z-index: 1000; }
    
    .wishlist-list { display: flex; flex-direction: column; gap: var(--spacing-md); }
    .wishlist-card { 
      display: flex; background: var(--color-bg-card); border: 1px solid transparent; padding: 6px;
      border-radius: var(--radius-md); overflow: hidden; min-height: 100px;
      cursor: pointer; transition: background-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
      outline: none;
    }
    .wishlist-card:focus-visible { outline: 2px solid var(--color-accent-green); outline-offset: 2px; }
    .wishlist-card:hover { background: var(--color-bg-surface-light); box-shadow: var(--shadow-md), var(--hover-ring); transform: translateY(-2px); }
    .wishlist-card:active { transform: scale(0.98); }
    .wishlist-img { width: 180px; min-width: 180px; height: 84px; object-fit: cover; border-radius: var(--radius-sm); background: var(--color-bg-base); }
    .wishlist-details { flex: 1; padding: 0 var(--spacing-md); display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
    .wishlist-details h3 { margin: 0 0 6px; font-size: 1.05rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.01em; }
    .wishlist-meta { font-size: 0.8rem; color: var(--color-text-secondary); display: flex; flex-wrap: wrap; gap: 4px 12px; }
    .wishlist-meta .review-positive { color: var(--color-success); font-weight: 500; }
    .wishlist-meta .review-mixed { color: var(--color-warning); font-weight: 500; }
    .wishlist-meta .review-negative { color: var(--color-danger); font-weight: 500; }
    
    .wishlist-price-block { 
      padding: 0 var(--spacing-md);
      display: flex; align-items: center; gap: var(--spacing-sm); min-width: 180px; justify-content: flex-end;
    }
    .discount-badge { background: rgba(34, 197, 94, 0.15); color: var(--color-accent-green); padding: 4px 8px; border-radius: var(--radius-sm); font-weight: 700; font-size: 0.9rem; }
    .prices { display: flex; flex-direction: column; align-items: flex-end; margin-right: var(--spacing-sm); justify-content: center; }
    .price-initial { color: var(--color-text-secondary); text-decoration: line-through; font-size: 0.75rem; }
    .price-final { font-weight: 600; font-size: 1rem; color: var(--color-text-primary); }
    
    .buy-btn { background: var(--color-bg-base); border: 1px solid var(--color-border); color: var(--color-text-primary); white-space: nowrap; border-radius: 20px; font-weight: 500; padding: 6px 14px; font-size: 0.85rem; transition: background-color var(--transition-base), color var(--transition-base), border-color var(--transition-base), transform var(--transition-fast), box-shadow var(--transition-fast); outline: none; cursor: pointer; }
    .buy-btn:focus-visible { outline: 2px solid var(--color-accent-green); outline-offset: 2px; }
    .buy-btn:hover { background: var(--color-action-primary); color: var(--color-bg-base); border-color: var(--color-action-primary); box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .buy-btn:active { transform: scale(0.96); box-shadow: none; }
  `;

  container.innerHTML = `<div class="loading">Loading Wishlist...</div>`;
  container.appendChild(style);

  try {
    const data = await steamApi.getWishlist();
    console.log('[Wishlist] API response method:', data._method, data);

    // Parse items from response
    const items = data?.response?.items;
    let games = [];

    if (items && items.length > 0) {
      games = items.map(parseWishlistItem);
    }

    if (games.length === 0) {
      container.innerHTML = `<div class="empty">Your wishlist is empty or not public.</div>`;
      container.appendChild(style);
      return container;
    }

    let currentSort = storage.get('wishlistSort') || 'date_desc';

    const getProcessedGames = () => {
      const result = [...games];

      result.sort((a, b) => {
        switch (currentSort) {
          case 'name_asc': return a.name.localeCompare(b.name);
          case 'price_asc': return (a.finalPrice ?? 999999) - (b.finalPrice ?? 999999);
          case 'price_desc': return (b.finalPrice ?? 0) - (a.finalPrice ?? 0);
          case 'discount': return (b.discountPct || 0) - (a.discountPct || 0);
          case 'date_desc': return (b.added || 0) - (a.added || 0);
          case 'release_desc': return (b.releaseDate || 0) - (a.releaseDate || 0);
          case 'review_desc': return (b.reviewScore || 0) - (a.reviewScore || 0);
          default: return 0;
        }
      });
      return result;
    };

    const renderCard = (game) => {
      const dateAdded = game.added ? new Date(game.added * 1000).toLocaleDateString() : '';
      const hasDiscount = game.discountPct > 0;
      
      // Price display
      let priceHtml = '';
      if (game.isFree) {
        priceHtml = `<span class="price-final">Free</span>`;
      } else if (game.formattedFinal) {
        priceHtml = `
          ${hasDiscount && game.formattedOriginal ? `<span class="price-initial">${game.formattedOriginal}</span>` : ''}
          <span class="price-final">${game.formattedFinal}</span>
        `;
      } else if (game.finalPrice != null) {
        const final$ = `$${(game.finalPrice / 100).toFixed(2)}`;
        const orig$ = game.originalPrice ? `$${(game.originalPrice / 100).toFixed(2)}` : '';
        priceHtml = `
          ${hasDiscount && orig$ ? `<span class="price-initial">${orig$}</span>` : ''}
          <span class="price-final">${final$}</span>
        `;
      } else {
        priceHtml = `<span class="price-final" style="font-size:0.85rem; color:var(--color-text-secondary);">—</span>`;
      }

      // Review color
      let reviewClass = '';
      if (game.reviewPercent >= 70) reviewClass = 'review-positive';
      else if (game.reviewPercent >= 40) reviewClass = 'review-mixed';
      else if (game.reviewPercent > 0) reviewClass = 'review-negative';

      return `
        <div class="wishlist-card" tabindex="0">
          <img src="${game.capsule}" alt="${game.name}" class="wishlist-img"
               onerror="const self = this; if (self._retry) return; self._retry=true; window.electronAuth.steamGetCoverUrl('${game.appid}').then(url => { if (url) self.src = url; else self.src='${PLACEHOLDER_IMG}'; }).catch(() => { self.src='${PLACEHOLDER_IMG}'; });" />
          
          <div class="wishlist-details">
            <h3 data-tooltip="${game.name}">${game.name}</h3>
            <div class="wishlist-meta">
              ${game.reviewLabel ? `<span class="${reviewClass}">${game.reviewLabel}</span>` : ''}
              ${dateAdded ? `<span>Added: ${dateAdded}</span>` : ''}
            </div>
          </div>

          <div class="wishlist-price-block">
            ${hasDiscount ? `<div class="discount-badge">-${game.discountPct}%</div>` : ''}
            <div class="prices">${priceHtml}</div>
            <button class="buy-btn" data-appid="${game.appid}">Store</button>
          </div>
        </div>
      `;
    };

    const updateView = () => {
      const processed = getProcessedGames();

      // Build inner HTML without removing the <style>
      const content = `
        <div class="wishlist-header">
          <h2>Your Wishlist (${games.length})</h2>
          <div class="controls" id="wishlist-controls">
          </div>
        </div>
        <div class="wishlist-list" id="wishlist-list">
          ${processed.map(renderCard).join('')}
        </div>
      `;

      // Replace content but keep the style element
      container.innerHTML = content;
      container.appendChild(style);

      // Inject custom dropdown
      const sortOptions = [
        { value: 'date_desc', label: 'Date Added' },
        { value: 'name_asc', label: 'Name' },
        { value: 'price_asc', label: 'Price: Low → High' },
        { value: 'price_desc', label: 'Price: High → Low' },
        { value: 'discount', label: 'Discount' },
        { value: 'release_desc', label: 'Release Date' },
        { value: 'review_desc', label: 'Review Score' }
      ];

      const sortDropdown = createDropdown({
        id: 'sort-select',
        options: sortOptions,
        selectedValue: currentSort,
        onChange: (val) => {
          currentSort = val;
          storage.set('wishlistSort', currentSort);
          updateView();
        }
      });
      container.querySelector('#wishlist-controls').appendChild(sortDropdown);

      // Bind events for buy buttons and cards
      container.querySelector('#wishlist-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('buy-btn')) {
          const appid = e.target.getAttribute('data-appid');
          window.electronAuth.openExternal(`https://store.steampowered.com/app/${appid}`);
          return;
        }
        
        const card = e.target.closest('.wishlist-card');
        if (card && !e.target.closest('.buy-btn')) {
          const appId = card.querySelector('.buy-btn').getAttribute('data-appid');
          const gameMeta = processed.find(g => g.appid == appId);
          store.set('currentGameMeta', gameMeta);
          router.navigate(`/game/${appId}`);
        }
      });
    };

    updateView();

  } catch (err) {
    const status = err.message.match(/(\d{3})/)?.[1];

    if (status === '401' || status === '403') {
      container.innerHTML = `
        <div class="error" style="text-align:center; padding: 2rem;">
          <h3 style="margin-bottom: 1rem;">🔒 Authorization Error (${status})</h3>
          <p style="color: var(--color-text-secondary); margin-bottom: 1.5rem;">
            Your session may have expired, or the authorization token is invalid.
          </p>
          <p style="color: var(--color-text-secondary); margin-bottom: 1rem;">
            Try logging out and logging in again using the profile menu in the top-right corner.
          </p>
        </div>
      `;
    } else if (err.message.includes('private') || err.message.includes('Private')) {
      container.innerHTML = `
        <div class="error" style="text-align:center; padding: 2rem;">
          <h3 style="margin-bottom: 1rem;">🔐 Profile is Private</h3>
          <p style="color: var(--color-text-secondary); margin-bottom: 1.5rem;">
            Your Steam profile's "Game details" must be set to <strong>Public</strong> to view your wishlist here.
          </p>
          <p>
            <a href="#" style="color: var(--color-action-primary);" onclick="window.electronAuth.openExternal('https://steamcommunity.com/id/me/edit/settings');return false;">
              Open Privacy Settings →
            </a>
          </p>
          <p style="color: var(--color-text-secondary); margin-top: 0.75rem; font-size: 0.85rem;">
            Set <strong>"Game details"</strong> to <strong>"Public"</strong>, then reload this page.
          </p>
        </div>
      `;
    } else {
      container.innerHTML = `<div class="error" style="text-align:center; padding: 2rem;">
        <h3 style="margin-bottom: 1rem;">Failed to load wishlist</h3>
        <p style="color: var(--color-text-secondary);">${err.message}</p>
      </div>`;
    }
    container.appendChild(style);
  }

  return container;
}
