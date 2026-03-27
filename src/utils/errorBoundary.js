import router from '../router/index.js';

/**
 * Global Error Boundary for the renderer process.
 * Catches uncaught exceptions and unhandled rejections,
 * shows a glassmorphism overlay with error details and recovery options.
 */

let overlayEl = null;
let errorCount = 0;
const MAX_AUTO_RETRY = 3;

// ─── Overlay UI ───────────────────────────────────────────────────

function createOverlay(error, source) {
  if (overlayEl) overlayEl.remove();

  overlayEl = document.createElement('div');
  overlayEl.id = 'error-boundary-overlay';
  overlayEl.innerHTML = `
    <div class="eb-backdrop"></div>
    <div class="eb-card">
      <div class="eb-icon">⚠️</div>
      <h2 class="eb-title">Что-то пошло не так</h2>
      <p class="eb-source">${escapeHtml(source)}</p>
      <pre class="eb-message">${escapeHtml(error?.message || String(error))}</pre>
      <div class="eb-actions">
        <button class="eb-btn eb-btn-primary" id="eb-retry">↻ Повторить</button>
        <button class="eb-btn eb-btn-secondary" id="eb-home">⌂ На главную</button>
        <button class="eb-btn eb-btn-ghost" id="eb-dismiss">✕ Закрыть</button>
      </div>
      <p class="eb-hint">Ошибка #${errorCount} · ${new Date().toLocaleTimeString()}</p>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #error-boundary-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: eb-fade-in 0.25s ease;
    }
    .eb-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .eb-card {
      position: relative;
      background: rgba(20, 20, 25, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 32px 40px;
      max-width: 480px;
      width: 90%;
      text-align: center;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
    }
    .eb-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    .eb-title {
      font-size: 20px;
      font-weight: 700;
      color: #f5f5f5;
      margin: 0 0 8px;
    }
    .eb-source {
      font-size: 12px;
      color: #888;
      margin: 0 0 16px;
    }
    .eb-message {
      background: rgba(255, 60, 60, 0.08);
      border: 1px solid rgba(255, 60, 60, 0.15);
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 12px;
      font-family: 'Cascadia Code', 'Fira Code', monospace;
      color: #ff6b6b;
      text-align: left;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 120px;
      overflow-y: auto;
      margin: 0 0 24px;
    }
    .eb-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    .eb-btn {
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .eb-btn-primary {
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #a5b4fc;
    }
    .eb-btn-primary:hover {
      background: rgba(99, 102, 241, 0.3);
    }
    .eb-btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #ccc;
    }
    .eb-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .eb-btn-ghost {
      background: none;
      color: #666;
    }
    .eb-btn-ghost:hover {
      color: #aaa;
    }
    .eb-hint {
      font-size: 11px;
      color: #555;
      margin: 16px 0 0;
    }
    @keyframes eb-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;

  overlayEl.appendChild(style);
  document.body.appendChild(overlayEl);

  // Wire buttons
  overlayEl.querySelector('#eb-retry').addEventListener('click', () => {
    dismiss();
    if (router && typeof router.reload === 'function') {
      router.reload();
    } else {
      window.location.reload();
    }
  });

  overlayEl.querySelector('#eb-home').addEventListener('click', () => {
    dismiss();
    if (router && typeof router.navigate === 'function') {
      router.navigate('/');
    } else {
      window.location.hash = '#/';
      window.location.reload();
    }
  });

  overlayEl.querySelector('#eb-dismiss').addEventListener('click', dismiss);
}

function dismiss() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Handler ──────────────────────────────────────────────────────

function handleError(error, source = 'Unknown') {
  errorCount++;
  console.error(`[ErrorBoundary] #${errorCount} (${source}):`, error);
  createOverlay(error, source);
}

// ─── Init ─────────────────────────────────────────────────────────

export function initErrorBoundary() {
  window.addEventListener('error', (event) => {
    // Ignore resource loading errors (images, scripts, etc.)
    if (event.target && event.target !== window) return;
    
    handleError(event.error || event.message, `Uncaught Error @ ${event.filename}:${event.lineno}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason);
    
    // Ignore benign rejections
    if (message.includes('ResizeObserver') || message.includes('navigation')) return;
    
    handleError(reason, 'Unhandled Promise Rejection');
  });

  console.log('[ErrorBoundary] Initialized');
}
