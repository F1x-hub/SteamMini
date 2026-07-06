import store from '../store/index.js';

let intervalId = null;

export function startBackgroundPriceFetcher() {
  if (intervalId) return;

  // Run the check every 5 minutes
  intervalId = setInterval(checkAndPrefetch, 5 * 60 * 1000);
  
  // First run after 10 seconds of app start
  setTimeout(checkAndPrefetch, 10000);
}

export function stopBackgroundPriceFetcher() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function checkAndPrefetch() {
  const auth = store.get('auth');
  if (!auth || !auth.steamId) return;

  try {
    // Fetch inventory. Passing 'false' for forceRefresh will rely on internal cache
    // unless it's expired.
    const res = await window.electronAuth.inventoryGetCards(auth.steamId, false);
    
    if (res && res.success && res.data) {
      const allCards = res.data;
      const allHashNames = [...new Set(allCards.map(c => c.marketHashName).filter(Boolean))];
      
      if (allHashNames.length > 0) {
        await window.electronAuth.prefetchPrices(allHashNames);
        console.log(`[Background Prices] Triggered prefetch for ${allHashNames.length} items.`);
      }
    }
  } catch (err) {
    console.error('[Background Prices] Failed to run check:', err);
  }
}
