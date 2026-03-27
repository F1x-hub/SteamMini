import { BrowserWindow, session } from 'electron';

// Все известные тексты кнопки "Place Order" по языкам Epic Games
const PLACE_ORDER_TEXTS = [
  'place order',      // EN
  'оформить заказ',  // RU
  'купить сейчас',   // RU alt
  'order now',        // EN alt
  'bestellen',        // DE
  'commander',        // FR
  'realizar pedido',  // ES
  'acquista',         // IT
  '購入する',         // JA
  'confirmar pedido', // PT
];

// Тексты, указывающие на успешное завершение покупки
const SUCCESS_TEXTS = [
  'thank you for buying', 'congratulations', 'поздравляем',
  'order confirmed', 'заказ подтверждён',
  'you now own', 'added to your library'
];

/**
 * Claims a free game on Epic Games Store headlessly.
 *
 * @param {string} gameUrl  Must start with https://store.epicgames.com/
 * @returns {Promise<{success: boolean, msg: string, alreadyOwned?: boolean}>}
 */
export async function claimEgsGame(gameUrl) {
  if (!gameUrl || !gameUrl.startsWith('https://store.epicgames.com/')) {
    console.log(`[EGS Claim] Skipping non-EGS URL: ${gameUrl}`);
    return { success: false, msg: 'Not an Epic Games Store URL — skipped' };
  }

  // IMPORTANT: must match the partition used in egsLogin.js ('persist:egs')
  const egsSession = session.fromPartition('persist:egs');

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    skipTaskbar: true,
    frame: false,
    webPreferences: {
      session: egsSession,
      offscreen: false,
      contextIsolation: true,
      webviewTag: false,
    }
  });

  // Log console messages from the hidden window for debugging
  win.webContents.on('console-message', (_, level, msg) => {
    if (msg.startsWith('[EGS-JS]')) {
      console.log('[EGS BrowserWindow]', msg);
    }
  });

  try {
    console.log(`[EGS Claim] Navigating to ${gameUrl}`);
    await win.loadURL(gameUrl);

    // Wait for page load + React hydration
    await new Promise(r => setTimeout(r, 5000));

    // ── Dump page state for debugging ──────────────────────────────────────
    const pageState = await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText?.trim()).filter(Boolean);
        const url = location.href;
        return { url, buttons };
      })()
    `).catch(() => ({}));
    
    // ── Check if not logged in ─────────────────────────────────────────────
    const isLoginPage = (pageState.url ?? '').includes('epicgames.com/id/login') ||
      (pageState.buttons ?? []).some(t => t.toLowerCase().includes('sign in') || t.toLowerCase().includes('log in'));
    if (isLoginPage) {
      console.log('[EGS Claim] Not authenticated — redirected to login page');
      return { success: false, msg: 'EGS session expired — please re-login' };
    }

    // ── Check if already owned ─────────────────────────────────────────────
    const alreadyOwned = (pageState.buttons ?? []).some(t => {
      const tl = t.toLowerCase();
      return tl.includes('in library') || tl.includes('в библиотеке') || tl === 'owned';
    });
    if (alreadyOwned) {
      console.log('[EGS Claim] Game already in library');
      return { success: false, alreadyOwned: true, msg: 'Game already in library' };
    }

    // ── Click "GET" button ─────────────────────────────────────────────────
    const getButtonClicked = await win.webContents.executeJavaScript(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => {
          const text = (b.innerText || '').toLowerCase().trim();
          return text === 'get' ||
                 text === 'получить' ||
                 text === 'free' ||
                 text === 'бесплатно' ||
                 b.getAttribute('data-testid') === 'purchase-cta-button';
        });
        if (btn) {
          console.log('[EGS-JS] Clicking GET button: "' + btn.innerText?.trim() + '"');
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return true;
        }
        return false;
      })()
    `);

    if (!getButtonClicked) {
      return { success: false, msg: 'Could not find "GET" button' };
    }

    // ── Poll for "Place Order" and verify success (up to 40s) ──────────────
    console.log(`[EGS Claim] Polling for checkout + Place Order...`);
    const result = await pollUntilOrdered(win, { intervalMs: 2000, timeoutMs: 40000 });
    return result;

  } catch (err) {
    console.error('[EGS Claim] Error:', err);
    return { success: false, msg: err.message };
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}

/**
 * Checks if the checkout iframe has navigated away from the payment-methods step.
 * Epic's URL hash changes from #/purchase/payment-methods to #/purchase/confirm or similar.
 */
async function checkIframeNavigated(win) {
  const frames = collectFrames(win.webContents.mainFrame);
  for (const frame of frames) {
    try {
      const url = frame.url ?? '';
      // Checkout iframe URL contains /purchase path
      if (url.includes('/purchase') && !url.includes('payment-methods') && !url.includes('payment-methods-embedded')) {
        return true;
      }
    } catch (e) { /* ignore */ }
  }
  return false;
}

/**
 * Polls every intervalMs for up to timeoutMs:
 * 1. Tries to find + click "Place Order" button in all frames
 * 2. After clicking, waits to confirm success (URL changes or success text appears)
 *
 * @returns {Promise<{success: boolean, msg: string}>}
 */
async function pollUntilOrdered(win, { intervalMs = 2000, timeoutMs = 40000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let clickedAt = null;

  while (Date.now() < deadline) {
    attempt++;

    // Try to find and click Place Order in all frames.
    const clicked = await tryClickPlaceOrder(win);
    if (clicked) {
      if (!clickedAt) {
        clickedAt = Date.now();
        console.log('[EGS Claim] Place Order clicked, waiting for confirmation...');
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    // Check for success confirmation regardless of if we just clicked
    if (clickedAt) {
      const elapsed = Date.now() - clickedAt;
      const matchText = await checkOrderSuccess(win);
      if (matchText) {
        console.log(`[EGS Claim] ✅ Order confirmed after ${elapsed}ms`);
        return { success: true, msg: 'Order placed and confirmed' };
      }
      const iframeNavigated = await checkIframeNavigated(win);
      if (iframeNavigated) {
        console.log(`[EGS Claim] ✅ Checkout iframe navigated (order likely completed) after ${elapsed}ms`);
        return { success: true, msg: 'Order placed (iframe navigated)' };
      }
      if (elapsed > 20000 && !clicked) {
        return { success: false, msg: 'Place Order clicked, button disappeared, but no success text found' };
      }
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }

  if (clickedAt) {
    return { success: false, msg: 'Place Order clicked but confirmation timed out' };
  }
  return { success: false, msg: 'Could not find "Place Order" button' };
}

/**
 * Checks if the page (main frame or any child frame) shows a success/confirmation state.
 * Returns the matched string if found, otherwise null.
 */
async function checkOrderSuccess(win) {
  const successTextsJson = JSON.stringify(SUCCESS_TEXTS);
  const checkScript = `
    (() => {
      const TEXTS = ${successTextsJson};
      const body = (document.body?.innerText || '').toLowerCase();
      const match = TEXTS.find(t => body.includes(t));
      return match || null;
    })()
  `;

  // Check main frame
  try {
    const result = await win.webContents.executeJavaScript(checkScript);
    if (result) return result;
  } catch (e) { /* ignore */ }

  // Check child frames
  const frames = collectFrames(win.webContents.mainFrame);
  for (const frame of frames) {
    try {
      const result = await frame.executeJavaScript(checkScript);
      if (result) return result;
    } catch (e) { /* ignore */ }
  }

  return null;
}

/**
 * Iterates over all frames and clicks the "Place Order" button.
 * Uses MouseEvent dispatch (works with React synthetic events).
 */
async function tryClickPlaceOrder(win) {
  const clickScript = buildClickScript();

  // 1. Main frame
  try {
    const result = await win.webContents.executeJavaScript(clickScript);
    if (result) {
      console.log('[EGS Claim] Found "Place Order" in main frame');
      return true;
    }
  } catch (e) { /* ignore */ }

  // 2. Child frames
  const mainFrame = win.webContents.mainFrame;
  if (!mainFrame) return false;

  const frames = collectFrames(mainFrame);
  if (frames.length > 0) {
    console.log(`[EGS Claim] Searching ${frames.length} child frame(s)...`);
  }

  for (const frame of frames) {
    try {
      const result = await frame.executeJavaScript(clickScript);
      if (result) {
        console.log('[EGS Claim] Found "Place Order" in child frame:', frame.url);
        return true;
      }
    } catch (e) { /* cross-origin or error — skip */ }
  }

  return false;
}

function collectFrames(root) {
  const result = [];
  for (const child of (root.frames ?? [])) {
    result.push(child);
    result.push(...collectFrames(child));
  }
  return result;
}

function buildClickScript() {
  const textsJson = JSON.stringify(PLACE_ORDER_TEXTS);
  return `
    (() => {
      const TEXTS = ${textsJson};
      const selectors = [
        'button.payment-btn',
        'button.payment-order-confirm__btn',
        'button[data-testid="purchase-cta-button"]',
        'button[class*="primary"]',
        'button',
      ];

      for (const selector of selectors) {
        const btns = Array.from(document.querySelectorAll(selector));
        const btn = btns.find(b => {
          if (b.disabled || b.getAttribute('aria-disabled') === 'true' || b.getAttribute('aria-busy') === 'true') return false;
          // Ignore invisible buttons
          if (b.offsetWidth === 0 && b.offsetHeight === 0) return false;
          const text = (b.innerText || b.textContent || '').toLowerCase().trim();
          return TEXTS.some(t => text.includes(t) || text === t);
        });

        if (btn) {
          const txt = btn.innerText?.trim();
          console.log('[EGS-JS] Clicking "Place Order" | selector:', selector, '| text:', txt);
          
          // Native click is often the most reliable for non-React synthetic trusted event checks
          btn.click();
          
          // Fallback MouseEvents for React
          ['mousedown', 'mouseup', 'click'].forEach(type => {
            btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          });
          return true;
        }
      }
      return false;
    })()
  `;
}
