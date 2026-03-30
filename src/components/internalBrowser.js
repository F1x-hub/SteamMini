import store from '../store/index.js';

/**
 * Internal Browser Overlay
 * Intercepts open-internal-browser IPC events and shows a full-screen
 * browser overlay with navigation controls.
 */
export function initInternalBrowser() {
  // ── Build the overlay DOM ──────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'internal-browser-overlay';
  overlay.style.cssText = `
    display: none;
    position: fixed;
    top: 82px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9998;
    background: var(--color-bg-base);
    flex-direction: column;
    height: calc(100vh - 82px);
  `;
  overlay.innerHTML = `
    <div id="ib-toolbar" style="
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--color-bg-surface-light);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    ">
      <button id="ib-back"    title="Назад"    style="${btnStyle()}">&#8592;</button>
      <button id="ib-forward" title="Вперёд"   style="${btnStyle()}">&#8594;</button>
      <button id="ib-reload"  title="Обновить" style="${btnStyle()}">↻</button>
      <div style="flex: 1; position: relative;">
        <input id="ib-url" type="text" spellcheck="false" style="
          width: 100%;
          box-sizing: border-box;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--color-border);
          background: var(--color-bg-base);
          color: var(--color-text-secondary);
          font-size: 12px;
          font-family: inherit;
          outline: none;
        " />
      </div>
      <button id="ib-open-external" title="Открыть в браузере" style="${btnStyle()}">🔗</button>
      <button id="ib-close" title="Закрыть" style="${btnStyle('danger')}">✕</button>
    </div>
    <div id="ib-placeholder" style="
      display: none;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at center, #111 0%, #050505 100%);
      color: var(--color-text-secondary);
      text-align: center;
      padding: 40px;
      user-select: none;
    ">
      <div style="
        font-size: 64px;
        margin-bottom: 24px;
        opacity: 0.15;
        filter: grayscale(1);
      ">🌐</div>
      <h2 style="margin: 0 0 8px 0; color: var(--color-text-primary); font-size: 1.2rem; font-weight: 600;">Браузер в режиме ожидания</h2>
      <p style="margin: 0; font-size: 0.9rem; opacity: 0.6;">Закройте профиль или настройки, чтобы вернуться к просмотру</p>
      <div style="
        margin-top: 32px;
        width: 120px;
        height: 2px;
        background: linear-gradient(90deg, transparent, var(--color-border), transparent);
      "></div>
    </div>
    <webview
      id="ib-webview"
      src="about:blank"
      partition="persist:steam"
      style="flex: 1; width: 100%; border: none;"
      allowpopups
    ></webview>
  `;

  document.body.appendChild(overlay);

  // ── References ────────────────────────────────────────────────────
  let wv = overlay.querySelector('#ib-webview');
  const urlInput = overlay.querySelector('#ib-url');
  const btnBack  = overlay.querySelector('#ib-back');
  const btnFwd   = overlay.querySelector('#ib-forward');
  const btnRld   = overlay.querySelector('#ib-reload');
  const btnExt   = overlay.querySelector('#ib-open-external');
  const btnClose = overlay.querySelector('#ib-close');
  const placeholder = overlay.querySelector('#ib-placeholder');

  let currentUrl = '';
  let isLoading = false;
  let historyStack = [];
  let historyIndex = -1;

  function updateLayout() {
    const isAuth = store.get('isAuthenticated');
    if (isAuth) {
      overlay.style.top = '82px';
      overlay.style.height = 'calc(100vh - 82px)';
    } else {
      overlay.style.top = '0';
      overlay.style.height = '100vh';
    }
  }

  store.subscribe('isAuthenticated', updateLayout);
  updateLayout(); // Initial call

  function updateNavButtons() {
    const canBack = historyIndex > 0;
    const canFwd = historyIndex < historyStack.length - 1;

    btnBack.style.opacity = canBack ? '1' : '0.25';
    btnBack.style.pointerEvents = canBack ? 'auto' : 'none';
    btnBack.style.cursor = canBack ? 'pointer' : 'default';

    btnFwd.style.opacity = canFwd ? '1' : '0.25';
    btnFwd.style.pointerEvents = canFwd ? 'auto' : 'none';
    btnFwd.style.cursor = canFwd ? 'pointer' : 'default';
  }

  function updateLoadingState(loading) {
    isLoading = loading;
    btnRld.innerHTML = isLoading ? '✕' : '↻';
    btnRld.title = isLoading ? 'Остановить' : 'Обновить';
  }

  // ── Webview Lifecycle & Events ────────────────────────────────────
  function attachWebviewEvents(webview) {
    webview.addEventListener('did-navigate', (e) => {
      const url = e.url;
      if (url === 'about:blank') return;
      if (historyIndex >= 0 && url === historyStack[historyIndex - 1]) {
        historyIndex--;
      } else if (historyIndex >= 0 && url === historyStack[historyIndex + 1]) {
        historyIndex++;
      } else if (url !== historyStack[historyIndex]) {
        historyStack = historyStack.slice(0, historyIndex + 1);
        historyStack.push(url);
        historyIndex = historyStack.length - 1;
      }
      currentUrl = url;
      urlInput.value = url;
      updateNavButtons();
    });
    webview.addEventListener('did-navigate-in-page', (e) => {
      const url = e.url;
      if (url === 'about:blank') return;
      if (historyIndex >= 0 && url === historyStack[historyIndex - 1]) {
        historyIndex--;
      } else if (historyIndex >= 0 && url === historyStack[historyIndex + 1]) {
        historyIndex++;
      } else if (url !== historyStack[historyIndex]) {
        historyStack = historyStack.slice(0, historyIndex + 1);
        historyStack.push(url);
        historyIndex = historyStack.length - 1;
      }
      currentUrl = url;
      urlInput.value = url;
      updateNavButtons();
    });
    webview.addEventListener('did-start-loading', () => updateLoadingState(true));
    webview.addEventListener('did-stop-loading',  () => {
      updateLoadingState(false);
      updateNavButtons();
    });
    webview.addEventListener('did-finish-load',   () => updateNavButtons());

    // Suppress benign about:blank load failures
    webview.addEventListener('did-fail-load', (e) => {
      if (e.validatedURL === 'about:blank' || e.errorCode === -3) return;
      console.error('[Browser] Load failed:', e.errorCode, e.errorDescription, e.validatedURL);
    });
  }

  attachWebviewEvents(wv);

  // ── State Subscriptions ───────────────────────────────────────────
  store.subscribe('isBrowserOpen', (isOpen) => {
    overlay.style.display = isOpen ? 'flex' : 'none';
    if (!isOpen) {
      if (wv) wv.src = 'about:blank';
      historyStack = [];
      historyIndex = -1;
      currentUrl = '';
      urlInput.value = '';
    }
  });

  function updateWebviewVisibility() {
    if (!wv) return;
    const isPopupOpen = store.get('profilePopupOpen');
    const isSettingsOpen = store.get('settingsOpen');
    const isHidden = isPopupOpen || isSettingsOpen;

    wv.style.visibility = isHidden ? 'hidden' : 'visible';
    placeholder.style.display = isHidden ? 'flex' : 'none';
  }

  store.subscribe('profilePopupOpen', updateWebviewVisibility);
  store.subscribe('settingsOpen', updateWebviewVisibility);

  // ── Build/Rebuild Webview Based on Domain ─────────────────────────
  function ensureCorrectPartition(url, forcedPartition = null) {
    const isEpi = url.includes('epicgames.com');
    // If forcedPartition is 'default', we want no partition attribute to use default session
    const targetPartition = forcedPartition === 'default' ? '' : (forcedPartition || (isEpi ? 'persist:egs' : 'persist:steam'));
    const currentPartition = wv.getAttribute('partition') || '';

    if (currentPartition !== targetPartition) {
      const newWv = document.createElement('webview');
      newWv.id = 'ib-webview';
      if (targetPartition) {
        newWv.setAttribute('partition', targetPartition);
      }
      newWv.style.cssText = 'flex: 1; width: 100%; border: none;';
      newWv.setAttribute('allowpopups', '');
      
      wv.replaceWith(newWv);
      wv = newWv;
      attachWebviewEvents(wv);
      updateWebviewVisibility();
      console.log(`[InternalBrowser] Rebuilt webview with partition: ${targetPartition || 'default'}`);
    }
  }

  // ── Open / Close ──────────────────────────────────────────────────
  function open(url, partition = null) {
    store.set('profilePopupOpen', false);
    store.set('settingsOpen', false);

    ensureCorrectPartition(url, partition);

    historyStack = [];
    historyIndex = -1;
    currentUrl = url;
    urlInput.value = url;
    
    // 1. First make the overlay visible so webview can calculate its size
    store.set('isBrowserOpen', true);
    
    // 2. Load URL in next tick to avoid black screen / initialization issues
    setTimeout(() => {
        if (wv) {
            wv.src = url;
            updateNavButtons();
        }
    }, 50);
  }

  function close() {
    store.set('isBrowserOpen', false);
  }

  // ── Navigation ────────────────────────────────────────────────────
  btnBack.addEventListener('click', () => { if (wv && historyIndex > 0) wv.goBack(); });
  btnFwd.addEventListener('click', () => { if (wv && historyIndex < historyStack.length - 1) wv.goForward(); });
  btnRld.addEventListener('click', () => { if (wv) isLoading ? wv.stop() : wv.reload(); });
  btnClose.addEventListener('click', close);

  btnExt.addEventListener('click', () => {
    if (currentUrl && window.electronAuth && window.electronAuth.openExternal) {
      window.electronAuth.openExternal(currentUrl);
    }
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let url = urlInput.value.trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      open(url);
    }
  });

  // ── Listen for IPC event ──────────────────────────────────────────
  if (window.electronAuth && window.electronAuth.onOpenBrowser) {
    window.electronAuth.onOpenBrowser((data) => {
      if (typeof data === 'string') {
        open(data);
      } else if (data && data.url) {
        open(data.url, data.partition);
      }
    });

    // Listen for close event
    if (window.electronAuth.onCloseBrowser) {
        window.electronAuth.onCloseBrowser(() => {
            close();
        });
    }
  }
}

// ── Helper ────────────────────────────────────────────────────────────
function btnStyle(variant = '') {
  const danger = variant === 'danger';
  return `
    width: 32px; height: 32px;
    border-radius: var(--radius-sm);
    border: 1px solid ${danger ? 'rgba(239,68,68,0.2)' : 'var(--color-border)'};
    background: transparent;
    color: ${danger ? 'var(--color-danger)' : 'var(--color-text-secondary)'};
    cursor: pointer;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background var(--transition-fast);
  `;
}
