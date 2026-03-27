import store from '../store/index.js';

export function renderLogin() {
  const container = document.createElement('div');
  container.className = 'login-page fade-in';

  const isElectron = !!window.electronAuth;

  const style = document.createElement('style');
  style.textContent = `
    .login-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--color-bg-base);
      position: relative;
      overflow: hidden;
    }

    .login-page::before {
      content: '';
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: radial-gradient(ellipse at 30% 20%, var(--color-dropdown-hover) 0%, transparent 50%),
                  radial-gradient(ellipse at 70% 80%, var(--color-dropdown-hover) 0%, transparent 50%);
      animation: bgFloat 20s ease-in-out infinite;
      pointer-events: none;
    }

    @keyframes bgFloat {
      0%, 100% { transform: translate(0, 0) rotate(0deg); }
      33% { transform: translate(30px, -20px) rotate(1deg); }
      66% { transform: translate(-20px, 20px) rotate(-1deg); }
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .login-card {
      position: relative;
      background: var(--color-bg-card);
      border-radius: var(--radius-md);
      padding: 3rem 2.5rem;
      width: 100%;
      max-width: 460px;
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-md);
      animation: fadeInUp 0.6s ease-out;
    }

    .login-logo {
      text-align: center;
      margin-bottom: 2rem;
    }

    .login-logo-icon {
      font-size: 3rem;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    .login-logo h1 {
      font-size: 1.6rem;
      font-weight: 700;
      margin: 0;
      color: var(--color-text-primary);
      letter-spacing: -0.02em;
    }

    .login-logo p {
      color: var(--color-text-secondary);
      font-size: 0.875rem;
      margin: 0.5rem 0 0;
    }

    .login-divider {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin: 1.5rem 0;
      color: var(--color-text-secondary);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .login-divider::before,
    .login-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border);
    }

    /* ─── Auth Buttons ─── */

    .auth-buttons {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }

    .auth-btn {
      position: relative;
      display: flex;
      align-items: center;
      gap: 1rem;
      width: 100%;
      padding: 1rem 1.25rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      background: var(--color-bg-surface);
      color: var(--color-text-primary);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.3s, border-color 0.3s, box-shadow 0.3s, transform 0.2s;
      text-align: left;
      font-family: inherit;
      outline: none;
      overflow: hidden;
    }

    .auth-btn::before {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--color-dropdown-hover);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .auth-btn:hover {
      border-color: var(--color-text-accent);
      background: var(--color-bg-surface-light);
      color: var(--color-text-primary);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md), var(--hover-ring);
    }

    .auth-btn:hover .auth-btn-title {
      color: var(--color-text-primary);
    }

    .auth-btn:hover::before {
      opacity: 1;
    }

    .auth-btn:active {
      transform: translateY(0);
    }

    .auth-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }

    .auth-btn-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
      width: 36px;
      text-align: center;
    }

    .auth-btn-text {
      display: flex;
      flex-direction: column;
      position: relative;
      z-index: 1;
    }

    .auth-btn-title {
      font-weight: 600;
      font-size: 0.95rem;
    }

    .auth-btn-subtitle {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      margin-top: 2px;
    }

    .auth-btn--primary {
      border-color: var(--color-text-accent);
    }

    .auth-btn--primary:hover {
      background: var(--color-text-accent) !important;
      color: var(--color-bg-base) !important;
    }
    
    .auth-btn--primary:hover * {
      color: var(--color-bg-base) !important;
    }

    /* ─── Manual Login (Collapsible) ─── */

    .manual-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.75rem;
      background: transparent;
      border: none;
      color: var(--color-text-secondary);
      font-size: 0.8rem;
      cursor: pointer;
      transition: color 0.2s;
      font-family: inherit;
    }

    .manual-toggle:hover {
      color: var(--color-text-primary);
      background: transparent;
    }

    .manual-toggle-arrow {
      transition: transform 0.3s ease;
      font-size: 0.6rem;
    }

    .manual-toggle-arrow.open {
      transform: rotate(180deg);
    }

    .manual-form-wrap {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s ease, opacity 0.3s ease;
      opacity: 0;
    }

    .manual-form-wrap.open {
      max-height: 400px;
      opacity: 1;
    }

    .manual-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding-top: 0.75rem;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .input-group label {
      font-size: 0.8rem;
      color: var(--color-text-secondary);
      font-weight: 500;
    }

    .input-group input {
      padding: 0.7rem 0.9rem;
      background: var(--color-bg-base);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      color: var(--color-text-primary);
      font-size: 0.9rem;
      font-family: inherit;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .input-group input:focus {
      outline: none;
      border-color: var(--color-text-accent);
      box-shadow: var(--hover-ring);
    }

    .input-group input::placeholder {
      color: var(--color-text-secondary);
      opacity: 0.5;
    }

    .manual-submit-btn {
      padding: 0.75rem;
      background: var(--color-bg-base);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.3s, color 0.3s, border-color 0.3s;
      font-family: inherit;
      margin-top: 0.25rem;
    }

    .manual-submit-btn:hover {
      background: var(--color-action-hover);
      color: var(--color-bg-base);
      border-color: var(--color-action-hover);
    }

    /* ─── Status Messages ─── */

    .login-status {
      text-align: center;
      padding: 0.75rem;
      border-radius: 8px;
      font-size: 0.85rem;
      margin-top: 0.5rem;
      display: none;
      animation: fadeInUp 0.3s ease-out;
    }

    .login-status.error {
      display: block;
      background: rgba(var(--color-danger-rgb, 239, 68, 68), 0.1);
      border: 1px solid rgba(var(--color-danger-rgb, 239, 68, 68), 0.2);
      color: var(--color-danger);
    }

    .login-status.loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: var(--color-dropdown-bg);
      border: 1px solid var(--color-dropdown-border);
      color: var(--color-text-primary);
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--color-border);
      border-top-color: var(--color-text-accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  `;
  container.appendChild(style);

  const card = document.createElement('div');
  card.className = 'login-card';

  card.innerHTML = `
    <div class="login-logo">
      <span class="login-logo-icon">
        <div style="width:14px;height:14px;border-radius:50%;background-color:var(--color-text-accent); display:inline-block; margin-right:4px;"></div>
        🎮
      </span>
      <h1>GameController</h1>
      <p>Подключите аккаунт Steam</p>
    </div>

    <div id="login-status" class="login-status"></div>

    ${isElectron ? `
      <div class="auth-buttons">
        <button class="auth-btn auth-btn--primary" id="btn-steam-direct">
          <span class="auth-btn-icon">🔑</span>
          <span class="auth-btn-text">
            <span class="auth-btn-title">Войти через Steam</span>
            <span class="auth-btn-subtitle">Логин / пароль / QR-код</span>
          </span>
        </button>

        <button class="auth-btn" id="btn-openid">
          <span class="auth-btn-icon">🌐</span>
          <span class="auth-btn-text">
            <span class="auth-btn-title">Войти через браузер</span>
            <span class="auth-btn-subtitle">Steam OpenID — быстро и безопасно</span>
          </span>
        </button>
      </div>

      <div class="login-divider">или</div>
    ` : ''}

    <button class="manual-toggle" id="manual-toggle">
      <span>⚙️ Ручной ввод</span>
      <span class="manual-toggle-arrow" id="toggle-arrow">▼</span>
    </button>

    <div class="manual-form-wrap ${!isElectron ? 'open' : ''}" id="manual-form-wrap">
      <form class="manual-form" id="manual-login-form">
        <div class="input-group">
          <label for="steamId">SteamID64 *</label>
          <input type="text" id="steamId" placeholder="76561198000000000" required />
        </div>
        <div class="input-group">
          <label for="accessToken">Access Token (JWT)</label>
          <input type="text" id="accessToken" placeholder="eyAid..." />
        </div>
        <button type="submit" class="manual-submit-btn">Подключить</button>
      </form>
    </div>
  `;

  container.appendChild(card);

  // ─── Event Handlers ───

  const statusEl = container.querySelector('#login-status');

  function showLoading(msg) {
    statusEl.className = 'login-status loading';
    statusEl.innerHTML = `<span class="spinner"></span> ${msg}`;
    setButtonsDisabled(true);
  }

  function showError(msg) {
    statusEl.className = 'login-status error';
    statusEl.textContent = msg;
    setButtonsDisabled(false);
  }

  function clearStatus() {
    statusEl.className = 'login-status';
    statusEl.innerHTML = '';
  }

  function setButtonsDisabled(disabled) {
    container.querySelectorAll('.auth-btn, .manual-submit-btn').forEach(b => {
      b.disabled = disabled;
    });
  }

  async function handleLoginSuccess() {
    clearStatus();
    window.location.reload();
  }

  // Steam Direct Login
  const btnSteamDirect = container.querySelector('#btn-steam-direct');
  if (btnSteamDirect) {
    btnSteamDirect.addEventListener('click', async () => {
      showLoading('Открываем Steam...');
      try {
        await store.loginSteamDirect();
        await handleLoginSuccess();
      } catch (err) {
        showError(err.message || 'Ошибка входа через Steam');
      }
    });
  }

  // OpenID Login
  const btnOpenId = container.querySelector('#btn-openid');
  if (btnOpenId) {
    btnOpenId.addEventListener('click', async () => {
      showLoading('Ожидаем авторизацию в браузере...');
      try {
        await store.loginOpenId();
        await handleLoginSuccess();
      } catch (err) {
        showError(err.message || 'Ошибка OpenID авторизации');
      }
    });
  }

  // Manual form toggle
  const manualToggle = container.querySelector('#manual-toggle');
  const manualWrap = container.querySelector('#manual-form-wrap');
  const toggleArrow = container.querySelector('#toggle-arrow');

  if (manualToggle && isElectron) {
    manualToggle.addEventListener('click', () => {
      const isOpen = manualWrap.classList.toggle('open');
      toggleArrow.classList.toggle('open', isOpen);
    });
  }

  // Manual form submit
  const form = container.querySelector('#manual-login-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearStatus();

    const steamId = form.querySelector('#steamId').value.trim();
    const accessToken = form.querySelector('#accessToken').value.trim();

    try {
      store.loginManual({ steamId, accessToken });
      handleLoginSuccess();
    } catch (err) {
      showError(err.message || 'Ошибка ручного входа');
    }
  });

  return container;
}
