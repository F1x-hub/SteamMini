import { icons } from '../utils/icons.js';
import steamApi from '../api/steam.js';
import storage from '../utils/storage.js';
import store from '../store/index.js';
import router from '../router/index.js';
import { createDropdown } from '../components/dropdown.js';
import { getGGDealsKeyshopsBatch } from '../api/ggdeals.js';

// Placeholder SVG for missing game images
const PLACEHOLDER_IMG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215"><rect fill="%231b2838" width="460" height="215"/><text fill="%2366c0f4" font-family="Arial" font-size="18" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>')}`;

/** List of supported regions for price comparison */
const REGIONS = [
  { cc: 'US', label: 'США',         symbol: '$'  },
  { cc: 'RU', label: 'Россия',      symbol: '₽'  },
  { cc: 'KZ', label: 'Казахстан',   symbol: '₸'  },
  { cc: 'TR', label: 'Турция',      symbol: '₺'  },
  { cc: 'AR', label: 'Аргентина',   symbol: '$'  },
  { cc: 'UA', label: 'Украина',     symbol: '₴'  },
  { cc: 'GE', label: 'Грузия',      symbol: '₾'  },
  { cc: 'PL', label: 'Польша',      symbol: 'zł' },
  { cc: 'FI', label: 'Финляндия',   symbol: '€'  },
];

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

  let capsule = '';
  const assetFilename = assets.header || assets.main_capsule || assets.small_capsule;
  if (assets.asset_url_format && assetFilename) {
    const relativeUrl = assets.asset_url_format.replace('${FILENAME}', assetFilename);
    capsule = `https://shared.akamai.steamstatic.com/store_item_assets/${relativeUrl}`;
  } else {
    capsule = `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`;
  }

  const finalPrice = purchase.final_price_in_cents ?? purchase.final_price ?? null;
  const originalPrice = purchase.original_price_in_cents ?? purchase.original_price ?? null;
  const discountPct = purchase.discount_pct ?? 0;
  const formattedFinal = purchase.formatted_final_price || null;
  const formattedOriginal = purchase.formatted_original_price || null;
  const isFree = si.is_free || basicInfo.is_free_game || false;

  const releaseDate = release.steam_release_date || release.release_date || null;
  const comingSoon = release.coming_soon || false;
  const releaseDateFormatted = release.custom_release_date_message || null;

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

export function renderWishlist() {
  const container = document.createElement('div');
  container.className = 'page-container wishlist-page';

  const style = document.createElement('style');
  style.textContent = `
    .wishlist-page { padding: var(--spacing-lg) var(--spacing-xl); max-width: 1100px; margin: 0 auto; }
    .wishlist-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--spacing-xl); flex-wrap: wrap; gap: var(--spacing-sm); }
    .wishlist-header h2 { margin: 0; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
    .controls { display: flex; gap: var(--spacing-md); align-items: flex-start; z-index: 1000; flex-wrap: wrap; }

    /* ── Region Panel ── */
    .region-panel-wrap { position: relative; }
    .region-toggle-btn {
      display: flex; align-items: center; gap: 6px;
      background: var(--color-bg-card); border: 1px solid var(--color-border);
      color: var(--color-text-primary); border-radius: var(--radius-md);
      padding: 7px 14px; font-size: 0.85rem; font-weight: 500; cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast);
      outline: none; white-space: nowrap;
    }
    .region-toggle-btn:hover { background: var(--color-bg-surface-light); border-color: var(--color-accent-green); }
    .region-toggle-btn:focus-visible { outline: 2px solid var(--color-accent-green); outline-offset: 2px; }
    .region-toggle-btn .badge-count {
      background: var(--color-accent-green); color: var(--color-bg-base);
      border-radius: 50%; width: 18px; height: 18px; font-size: 0.7rem; font-weight: 700;
      display: flex; align-items: center; justify-content: center; line-height: 1;
    }

    .region-panel {
      position: absolute; top: calc(100% + 8px); right: 0;
      background: var(--color-bg-card); border: 1px solid var(--color-border);
      border-radius: var(--radius-lg); padding: 16px; min-width: 320px; z-index: 2000;
      box-shadow: var(--shadow-lg);
      display: none; flex-direction: column; gap: 14px;
    }
    .region-panel.open { display: flex; }
    .region-panel__title { font-size: 0.8rem; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }

    .region-checkboxes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .region-check-item {
      display: flex; align-items: center; gap: 8px; padding: 6px 8px;
      border-radius: var(--radius-sm); cursor: pointer;
      transition: background var(--transition-fast);
    }
    .region-check-item:hover { background: var(--color-bg-surface-light); }
    .region-check-item input[type="checkbox"] { width: 14px; height: 14px; cursor: pointer; accent-color: var(--color-accent-green); flex-shrink: 0; }
    .region-check-item label { font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .region-check-item .region-symbol { font-size: 0.75rem; color: var(--color-text-secondary); min-width: 16px; }

    .region-threshold-row { display: flex; flex-direction: column; gap: 6px; }
    .region-threshold-row label { font-size: 0.8rem; color: var(--color-text-secondary); }
    .region-threshold-input-wrap { display: flex; align-items: center; gap: 8px; }
    .region-threshold-input {
      width: 80px; background: var(--color-bg-base); border: 1px solid var(--color-border);
      color: var(--color-text-primary); border-radius: var(--radius-sm); padding: 5px 8px;
      font-size: 0.9rem; outline: none;
      transition: border-color var(--transition-fast);
    }
    .region-threshold-input:focus { border-color: var(--color-accent-green); }
    .region-threshold-hint { font-size: 0.75rem; color: var(--color-text-secondary); }

    .region-progress-row { display: flex; flex-direction: column; gap: 4px; }
    .region-progress-bar-bg { background: var(--color-bg-base); border-radius: 3px; height: 4px; overflow: hidden; }
    .region-progress-bar-fill { background: var(--color-accent-green); height: 100%; border-radius: 3px; width: 0%; transition: width 0.2s ease; }
    .region-progress-label { font-size: 0.75rem; color: var(--color-text-secondary); }

    .region-panel-actions { display: flex; gap: 8px; }
    .region-reset-btn {
      flex: 1; background: transparent; border: 1px solid var(--color-border);
      color: var(--color-text-secondary); border-radius: var(--radius-sm); padding: 6px 10px;
      font-size: 0.8rem; cursor: pointer; transition: all var(--transition-fast); outline: none;
    }
    .region-reset-btn:hover { border-color: var(--color-danger); color: var(--color-danger); }
    .region-apply-btn {
      flex: 1; background: var(--color-action-primary); border: none;
      color: var(--color-bg-base); border-radius: var(--radius-sm); padding: 6px 10px;
      font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: opacity var(--transition-fast); outline: none;
    }
    .region-apply-btn:hover { opacity: 0.85; }

    /* ── Cards ── */
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
      display: flex; align-items: center; gap: var(--spacing-sm); min-width: 200px; justify-content: flex-end; flex-wrap: wrap;
    }
    .discount-badge { background: rgba(34, 197, 94, 0.15); color: var(--color-accent-green); padding: 4px 8px; border-radius: var(--radius-sm); font-weight: 700; font-size: 0.9rem; }
    .keyshop-badge { background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 4px 8px; border-radius: var(--radius-sm); font-weight: 600; font-size: 0.85rem; border: 1px solid rgba(245, 158, 11, 0.2); white-space: nowrap; margin-right: 6px; }
    .prices { display: flex; flex-direction: column; align-items: flex-end; margin-right: var(--spacing-sm); justify-content: center; }
    .price-initial { color: var(--color-text-secondary); text-decoration: line-through; font-size: 0.75rem; }
    .price-final { font-weight: 600; font-size: 1rem; color: var(--color-text-primary); }

    /* Region price badges on card */
    .region-prices-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .region-price-badge {
      display: inline-flex; align-items: center; gap: 3px;
      background: rgba(102,192,244,0.08); border: 1px solid rgba(102,192,244,0.18);
      border-radius: var(--radius-sm); padding: 2px 6px;
      font-size: 0.72rem; color: var(--color-text-secondary); white-space: nowrap;
    }
    .region-price-badge .rpb-cc { font-weight: 700; color: var(--color-text-primary); }
    .region-price-badge .rpb-diff { font-size: 0.65rem; }
    .region-price-badge .rpb-diff.cheaper { color: var(--color-success); }
    .region-price-badge .rpb-diff.pricier  { color: var(--color-danger); }
    .region-price-badge.unavail { opacity: 0.45; border-color: var(--color-border); }

    .buy-btn { background: var(--color-bg-base); border: 1px solid var(--color-border); color: var(--color-text-primary); white-space: nowrap; border-radius: 20px; font-weight: 500; padding: 6px 14px; font-size: 0.85rem; transition: background-color var(--transition-base), color var(--transition-base), border-color var(--transition-base), transform var(--transition-fast), box-shadow var(--transition-fast); outline: none; cursor: pointer; }
    .buy-btn:focus-visible { outline: 2px solid var(--color-accent-green); outline-offset: 2px; }
    .buy-btn:hover { background: var(--color-action-primary); color: var(--color-bg-base); border-color: var(--color-action-primary); box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .buy-btn:active { transform: scale(0.96); box-shadow: none; }

    .wishlist-page .skel { animation-duration: 1.82s; }

    /* Filter active indicator */
    .filter-active-bar {
      display: flex; align-items: center; gap: 10px; padding: 8px 14px;
      background: rgba(102,192,244,0.07); border: 1px solid rgba(102,192,244,0.15);
      border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--color-text-secondary);
      margin-bottom: var(--spacing-sm);
    }
    .filter-active-bar strong { color: var(--color-text-primary); }
  `;

  function buildWishlistSkeletons(count) {
    return `
      <div class="wishlist-header">
        <div class="skel" style="width: 220px; height: 28px; border-radius: 4px;"></div>
        <div class="controls" id="wishlist-controls">
          <div class="skel" style="width: 250px; height: 36px; border-radius: 8px;"></div>
        </div>
      </div>
      <div class="wishlist-list">
        ${Array.from({ length: count }, (_, i) => `
          <div class="wishlist-card" style="cursor: default; pointer-events: none; animation-delay: ${i * 80}ms;">
            <div class="skel" style="width: 180px; min-width: 180px; height: 84px; border-radius: var(--radius-sm); border: none;"></div>
            <div class="wishlist-details" style="gap: 8px;">
              <div class="skel" style="width: 40%; height: 18px; border-radius: 4px;"></div>
              <div class="skel" style="width: 25%; height: 14px; border-radius: 3px;"></div>
            </div>
            <div class="wishlist-price-block">
              <div class="skel" style="width: 60px; height: 24px; border-radius: 4px; margin-right: 6px;"></div>
              <div class="skel" style="width: 40px; height: 24px; border-radius: 4px;"></div>
              <div class="prices" style="margin-left: 8px; width: 50px;">
                <div class="skel" style="width: 100%; height: 20px; border-radius: 4px;"></div>
              </div>
              <div class="skel" style="width: 64px; height: 32px; border-radius: 16px;"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const skeletonCount = Math.max(5, Math.ceil(window.innerHeight / 110));
  container.innerHTML = buildWishlistSkeletons(skeletonCount);
  container.appendChild(style);

  (async () => {
    try {
      const data = await steamApi.getWishlist();
      console.log('[Wishlist] API response method:', data._method, data);

      const items = data?.response?.items;
      let games = [];

      if (items && items.length > 0) {
        games = items.map(parseWishlistItem);
      }

      if (games.length === 0) {
        container.innerHTML = `<div class="empty"> Your wishlist is empty or not public.</div>`;
        container.appendChild(style);
        return;
      }

      // Async fetch GG.deals keyshop prices
      try {
        const appIdsToFetch = games.map(g => g.appid);
        const keyshopsData = await getGGDealsKeyshopsBatch(appIdsToFetch);
        games.forEach(game => {
          const ggData = keyshopsData[game.appid];
          if (ggData && ggData.prices && ggData.prices.currentKeyshops !== null) {
            game.keyshopPrice = parseFloat(ggData.prices.currentKeyshops);
            game.keyshopCurrency = ggData.prices.currency || '$';
          } else {
            game.keyshopPrice = null;
          }
        });
      } catch (e) {
        console.error('Failed fetching batch keyshop prices in wishlist:', e);
      }

      // ── State ──
      let currentSort = storage.get('wishlistSort') || 'date_desc';
      let selectedRegions = storage.get('wishlistRegions') || [];
      let diffThreshold = storage.get('wishlistDiffPct') ?? '';

      // regionPrices[appid][cc] = { final_price (cents), unavailable }
      const regionPrices = {};
      let regionsLoaded = false;
      let regionsLoading = false;

      // ── Load region prices for all games and selected CCs ──
      async function loadRegionPrices(ccs, onProgress) {
        if (!ccs.length) return;
        regionsLoading = true;
        const total = games.length * ccs.length;
        let done = 0;
        for (const game of games) {
          if (!regionPrices[game.appid]) regionPrices[game.appid] = {};
          for (const cc of ccs) {
            if (regionPrices[game.appid][cc] !== undefined) {
              done++;
              onProgress(done, total);
              continue;
            }
            try {
              const result = await steamApi.getAppPrice(game.appid, cc);
              regionPrices[game.appid][cc] = result;
            } catch (e) {
              regionPrices[game.appid][cc] = { unavailable: true };
            }
            done++;
            onProgress(done, total);
            // Real-time update of specific card badges in DOM without rebuilding the whole page
            const cardEl = container.querySelector(`.wishlist-card .buy-btn[data-appid="${game.appid}"]`)?.closest('.wishlist-card');
            if (cardEl) {
              const detailsEl = cardEl.querySelector('.wishlist-details');
              if (detailsEl) {
                // Remove old badges row if exists
                const oldBadges = detailsEl.querySelector('.region-prices-row');
                if (oldBadges) oldBadges.remove();
                
                // Add new badges row
                const newBadgesHtml = buildRegionBadges(game);
                if (newBadgesHtml) {
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = newBadgesHtml;
                  detailsEl.appendChild(tempDiv.firstElementChild);
                }
              }
            }
            // Delay 5 seconds to avoid HTTP 429 Too Many Requests
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        regionsLoaded = true;
        regionsLoading = false;
      }

      // ── Exchange Rates helper for price comparison ──
      let exchangeRates = null;
      async function getUSDRates() {
        if (exchangeRates) return exchangeRates;
        try {
          const isPackaged = window.location.protocol === 'file:';
          const url = isPackaged ? 'https://open.er-api.com/v6/latest/USD' : '/api/rates/v6/latest/USD';
          const res = await fetch(url);
          const data = await res.json();
          if (data && data.rates) {
            exchangeRates = data.rates;
            return exchangeRates;
          }
        } catch (e) {
          console.error('Failed to fetch exchange rates in wishlist:', e);
        }
        return null;
      }

      // Helper to convert Steam price to USD
      function convertToUSD(finalCents, currency, rates) {
        if (!finalCents || !rates) return null;
        const rate = rates[currency] || 1;
        return (finalCents / 100) / rate;
      }

      // ── Filtering logic ──
      function getProcessedGames() {
        let result = [...games];

        // Filter by regions (only when regions selected)
        if (selectedRegions.length > 0) {
          // Threshold: compare price in USD of region vs US price in USD.
          // If threshold=10, hide games where |regionUSD - baseUSD| / baseUSD > 10%
          const threshold = diffThreshold !== '' ? parseFloat(diffThreshold) : null;

          result = result.filter(game => {
            let anyRegionPasses = false;

            for (const cc of selectedRegions) {
              const rp = regionPrices[game.appid]?.[cc];

              // Not loaded yet → treat as passing so it is visible while loading
              if (rp === undefined) { anyRegionPasses = true; continue; }

              // Unavailable in this region → skip
              if (rp.unavailable || rp.final === undefined) continue;

              // Free games always pass
              if (game.isFree) { anyRegionPasses = true; continue; }

              // Apply percentage threshold based on converted USD prices
              if (threshold !== null && threshold >= 0 && exchangeRates) {
                const regionUSD = convertToUSD(rp.final, rp.currency || 'USD', exchangeRates);
                const baseUSD = convertToUSD(game.finalPrice, 'USD', exchangeRates); // base is in USD cents
                if (regionUSD !== null && baseUSD !== null && baseUSD > 0) {
                  const pctDiff = Math.abs((regionUSD - baseUSD) / baseUSD) * 100;
                  if (pctDiff > threshold) continue;
                }
              }

              anyRegionPasses = true;
            }

            return anyRegionPasses;
          });
        }

        // Sorting
        result.sort((a, b) => {
          switch (currentSort) {
            case 'name_asc': return a.name.localeCompare(b.name);
            case 'price_asc': return (a.finalPrice ?? 999999) - (b.finalPrice ?? 999999);
            case 'price_desc': return (b.finalPrice ?? 0) - (a.finalPrice ?? 0);
            case 'keyshop_asc': return (a.keyshopPrice ?? 999999) - (b.keyshopPrice ?? 999999);
            case 'discount': return (b.discountPct || 0) - (a.discountPct || 0);
            case 'date_desc': return (b.added || 0) - (a.added || 0);
            case 'release_desc': return (b.releaseDate || 0) - (a.releaseDate || 0);
            case 'review_desc': return (b.reviewScore || 0) - (a.reviewScore || 0);
            case 'region_price_asc': {
              // Sort by min price among selected regions
              const getMin = game => {
                if (!selectedRegions.length) return 999999;
                let min = Infinity;
                for (const cc of selectedRegions) {
                  const rp = regionPrices[game.appid]?.[cc];
                  if (rp && !rp.unavailable && rp.final != null) {
                    if (rp.final < min) min = rp.final;
                  }
                }
                return min === Infinity ? 999999 : min;
              };
              return getMin(a) - getMin(b);
            }
            default: return 0;
          }
        });

        return result;
      }

      // ── Format region price badge ──
      function buildRegionBadges(game) {
        if (!selectedRegions.length) return '';
        const badges = selectedRegions.map(cc => {
          const rp = regionPrices[game.appid]?.[cc];
          const regionMeta = REGIONS.find(r => r.cc === cc);
          if (!rp) {
            return `<span class="region-price-badge" title="${regionMeta?.label || cc}">
              <span class="rpb-cc">${cc}</span>
              <span class="rpb-diff">…</span>
            </span>`;
          }
          if (rp.unavailable || rp.final === undefined) {
            return `<span class="region-price-badge unavail" title="${regionMeta?.label || cc} — недоступна">
              <span class="rpb-cc">${cc}</span>
              <span class="rpb-diff">—</span>
            </span>`;
          }
          const priceFormatted = rp.final_formatted || `${(rp.final / 100).toFixed(2)}`;
          let diffHtml = '';
          
          if (exchangeRates && game.finalPrice && game.finalPrice > 0) {
            const regionUSD = convertToUSD(rp.final, rp.currency || 'USD', exchangeRates);
            const baseUSD = convertToUSD(game.finalPrice, 'USD', exchangeRates);
            if (regionUSD !== null && baseUSD !== null) {
              const diffPct = ((regionUSD - baseUSD) / baseUSD) * 100;
              const rounded = Math.round(diffPct);
              if (Math.abs(rounded) >= 1) {
                const sign = rounded > 0 ? '+' : '';
                const cls  = rounded < 0 ? 'cheaper' : 'pricier';
                diffHtml = `<span class="rpb-diff ${cls}">${sign}${rounded}%</span>`;
              }
            }
          }
          
          return `<span class="region-price-badge" title="${regionMeta?.label || cc}">
            <span class="rpb-cc">${cc}</span>
            <span>${priceFormatted}</span>
            ${diffHtml}
          </span>`;
        }).join('');
        return `<div class="region-prices-row">${badges}</div>`;
      }

      // ── Render a single card ──
      const renderCard = (game) => {
        const dateAdded = game.added ? new Date(game.added * 1000).toLocaleDateString() : '';
        const hasDiscount = game.discountPct > 0;

        let priceHtml = '';
        let keyshopHtml = '';
        if (game.keyshopPrice != null) {
          keyshopHtml = `<div class="keyshop-badge" title="Keyshop Price (GG.deals)">${icons.key} $${game.keyshopPrice.toFixed(2)}</div>`;
        }

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

        let reviewClass = '';
        if (game.reviewPercent >= 70) reviewClass = 'review-positive';
        else if (game.reviewPercent >= 40) reviewClass = 'review-mixed';
        else if (game.reviewPercent > 0) reviewClass = 'review-negative';

        const regionBadges = buildRegionBadges(game);

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
              ${regionBadges}
            </div>

            <div class="wishlist-price-block">
              ${keyshopHtml}
              ${hasDiscount ? `<div class="discount-badge">-${game.discountPct}%</div>` : ''}
              <div class="prices">${priceHtml}</div>
              <button class="buy-btn" data-appid="${game.appid}">Store</button>
            </div>
          </div>
        `;
      };

      // ── Build region panel HTML ──
      function buildRegionPanel(progressDone = 0, progressTotal = 0) {
        const loading = progressTotal > 0 && progressDone < progressTotal;
        const pct = progressTotal > 0 ? Math.round(progressDone / progressTotal * 100) : 0;

        const checkboxes = REGIONS.map(r => {
          const checked = selectedRegions.includes(r.cc) ? 'checked' : '';
          return `
            <label class="region-check-item">
              <input type="checkbox" data-cc="${r.cc}" ${checked} />
              <span>${r.label}</span>
              <span class="region-symbol">${r.symbol}</span>
            </label>`;
        }).join('');

        const progressHtml = loading ? `
          <div class="region-progress-row">
            <div class="region-progress-bar-bg">
              <div class="region-progress-bar-fill" id="rp-fill" style="width:${pct}%"></div>
            </div>
            <div class="region-progress-label" id="rp-label">Загрузка цен: ${progressDone} / ${progressTotal}</div>
          </div>` : '';

        return `
          <div class="region-panel__title">Регионы для сравнения</div>
          <div class="region-checkboxes">${checkboxes}</div>
          <div class="region-threshold-row">
            <label for="rp-threshold">Порог разброса цены (%)</label>
            <div class="region-threshold-input-wrap">
              <input type="number" id="rp-threshold" class="region-threshold-input"
                     min="0" max="500" step="1" value="${diffThreshold}"
                     placeholder="—" />
              <span class="region-threshold-hint">0 = точное совпадение, пусто = без фильтра</span>
            </div>
          </div>
          ${progressHtml}
          <div class="region-panel-actions">
            <button class="region-reset-btn" id="rp-reset">Сбросить</button>
            <button class="region-apply-btn" id="rp-apply">Применить</button>
          </div>`;
      }

      // ── Main render ──
      let regionPanelOpen = false;
      let filterApplyPending = false;

      const updateView = () => {
        const processed = getProcessedGames();
        const isFiltered = selectedRegions.length > 0;
        const hiddenCount = games.length - processed.length;

        const filterBar = isFiltered ? `
          <div class="filter-active-bar">
            ${icons.globe}
            Регионы: <strong>${selectedRegions.join(', ')}</strong>
            ${diffThreshold ? `· Порог: <strong>±${diffThreshold}%</strong>` : ''}
            ${hiddenCount > 0 ? `· Скрыто: <strong>${hiddenCount}</strong>` : ''}
          </div>` : '';

        const content = `
          <div class="wishlist-header">
            <h2>Your Wishlist (${processed.length}${hiddenCount > 0 ? `/${games.length}` : ''})</h2>
            <div class="controls" id="wishlist-controls"></div>
          </div>
          ${filterBar}
          <div class="wishlist-list" id="wishlist-list">
            ${processed.map(renderCard).join('')}
          </div>
        `;

        container.innerHTML = content;
        container.appendChild(style);

        // Sort dropdown
        const sortOptions = [
          { value: 'date_desc',         label: 'Date Added' },
          { value: 'name_asc',          label: 'Name' },
          { value: 'price_asc',         label: 'Price: Low → High' },
          { value: 'price_desc',        label: 'Price: High → Low' },
          { value: 'keyshop_asc',       label: 'Price: Keyshop (Low → High)' },
          { value: 'discount',          label: 'Discount' },
          { value: 'release_desc',      label: 'Release Date' },
          { value: 'review_desc',       label: 'Review Score' },
          { value: 'region_price_asc',  label: 'Цена в регионе (Low → High)' },
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

        const controlsEl = container.querySelector('#wishlist-controls');
        controlsEl.appendChild(sortDropdown);

        // Region panel toggle button
        const regionWrap = document.createElement('div');
        regionWrap.className = 'region-panel-wrap';

        const regionBtn = document.createElement('button');
        regionBtn.className = 'region-toggle-btn';
        regionBtn.id = 'region-toggle-btn';
        const countBadge = selectedRegions.length
          ? `<span class="badge-count">${selectedRegions.length}</span>`
          : '';
        regionBtn.innerHTML = `${icons.globe || icons.wallet} Регионы ${countBadge}`;

        const panel = document.createElement('div');
        panel.className = `region-panel${regionPanelOpen ? ' open' : ''}`;
        panel.id = 'region-panel';
        panel.innerHTML = buildRegionPanel();

        regionWrap.appendChild(regionBtn);
        regionWrap.appendChild(panel);
        controlsEl.appendChild(regionWrap);

        // Toggle panel
        regionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          regionPanelOpen = !regionPanelOpen;
          panel.classList.toggle('open', regionPanelOpen);
        });

        // Close on outside click
        document.addEventListener('click', function onDocClick(e) {
          if (!regionWrap.contains(e.target)) {
            regionPanelOpen = false;
            panel.classList.remove('open');
            document.removeEventListener('click', onDocClick);
          }
        });

        // Apply button
        panel.querySelector('#rp-apply').addEventListener('click', async () => {
          if (filterApplyPending) return;

          // Read checkbox state
          const newRegions = [];
          panel.querySelectorAll('input[type="checkbox"][data-cc]').forEach(cb => {
            if (cb.checked) newRegions.push(cb.getAttribute('data-cc'));
          });

          const thresholdVal = panel.querySelector('#rp-threshold')?.value?.trim() ?? '';
          diffThreshold = thresholdVal;
          storage.set('wishlistDiffPct', thresholdVal);

          // Determine which regions need loading
          const toLoad = newRegions.filter(cc => {
            return games.some(g => regionPrices[g.appid]?.[cc] === undefined);
          });

          selectedRegions = newRegions;
          storage.set('wishlistRegions', selectedRegions);

          if (toLoad.length > 0) {
            filterApplyPending = true;
            let done = 0;
            const total = games.length * toLoad.length;

            // Show progress in panel
            const panelEl = container.querySelector('#region-panel');
            if (panelEl) {
              panelEl.innerHTML = buildRegionPanel(done, total);
            }

            await loadRegionPrices(toLoad, (d, t) => {
              done = d;
              const fill = container.querySelector('#rp-fill');
              const label = container.querySelector('#rp-label');
              if (fill) fill.style.width = `${Math.round(d / t * 100)}%`;
              if (label) label.textContent = `Загрузка цен: ${d} / ${t}`;
            });

            filterApplyPending = false;
            // Fully update view to filter/hide games that don't match the threshold
            updateView();
          }

          regionPanelOpen = false;
          updateView();
        });

        // Reset button
        panel.querySelector('#rp-reset').addEventListener('click', () => {
          selectedRegions = [];
          diffThreshold = '';
          storage.set('wishlistRegions', []);
          storage.set('wishlistDiffPct', '');
          regionPanelOpen = false;
          updateView();
        });

        // Bind card events
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

      // Load exchange rates for USD conversions
      await getUSDRates();

      // Initial render, then if we have saved regions — load their prices
      updateView();

      if (selectedRegions.length > 0) {
        const toLoad = selectedRegions.filter(cc =>
          games.some(g => regionPrices[g.appid]?.[cc] === undefined)
        );
        if (toLoad.length > 0) {
          await loadRegionPrices(toLoad, () => {});
          updateView();
        }
      }

    } catch (err) {
      const status = err.message.match(/(\d{3})/)?.[1];

      if (status === '401' || status === '403') {
        container.innerHTML = `
          <div class="error" style="text-align:center; padding: 2rem;">
            <h3 style="margin-bottom: 1rem;">${icons.lock} Authorization Error (${status})</h3>
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
            <h3 style="margin-bottom: 1rem;">${icons.lock} Profile is Private</h3>
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
  })();

  return container;
}
