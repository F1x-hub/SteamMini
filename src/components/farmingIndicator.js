// src/components/farmingIndicator.js
// Floating panel showing which games are currently being farmed.
// Receives updates via `farming:update` IPC event from idleManager.
// Import and call initFarmingIndicator(container) from main layout.

import store from '../store/index.js';
import { icons } from '../utils/icons.js';

const STYLES = `
  .farming-panel {
    display: none;
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
    width: 100%;
    margin-top: 8px;
    max-height: 400px; /* Increased to allow expansion */
    transition: max-height 0.3s ease-out;
    overflow: hidden;
  }
   .farming-panel.collapsed {
    max-height: 40px; /* Adjusted for larger header */
    gap: 0;
  }
  .farming-items-scroll {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 360px;
    overflow-y: auto;
    scrollbar-width: thin;
    padding-right: 4px;
    margin-top: 4px;
  }
  .farming-items-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .farming-items-scroll::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
  .farming-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    margin: 0 -4px;
    cursor: pointer;
    user-select: none;
    border-radius: 8px;
    transition: background 0.2s, transform 0.1s;
  }
  .farming-panel-header:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .farming-panel-header:active {
    transform: scale(0.995);
  }
  .farming-panel-title {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-primary);
    font-weight: 700;
    margin: 0;
  }
  .farming-collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    color: var(--color-text-secondary);
    transition: transform 0.3s ease;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .collapsed .farming-collapse-btn {
    transform: rotate(-90deg);
  }
  .farming-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 6px;
    background: rgba(255,255,255,0.03);
    font-size: 13px;
    overflow: hidden;
    transition: background 0.2s, opacity 0.2s, transform 0.2s;
  }
  .collapsed .farming-item {
    opacity: 0;
    transform: translateY(-10px);
    pointer-events: none;
  }
  .farming-item:hover {
    background: rgba(255,255,255,0.06);
  }
  .farming-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    animation: farmDotPulse 1.5s ease-in-out infinite;
  }
  .farming-dot.phase-1 {
    background: var(--color-warning, #f59e0b);
    animation-duration: 1.5s;
  }
  .farming-dot.phase-2 {
    background: var(--color-accent-green, #10b981);
    animation-duration: 1s;
  }
  @keyframes farmDotPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.35; transform: scale(0.75); }
  }
  .farming-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-primary);
    font-size: 12px;
  }
  .farming-phase-tag {
    font-size: 10px;
    color: var(--color-text-secondary);
    flex-shrink: 0;
    white-space: nowrap;
  }
`;

function injectStyles() {
  if (document.getElementById('farming-indicator-styles')) return;
  const el = document.createElement('style');
  el.id = 'farming-indicator-styles';
  el.textContent = STYLES;
  document.head.appendChild(el);
}

const iconChevron = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s ease;"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

/**
 * Initialize the farming games panel inside the given `container` element.
 * The container is shown/hidden automatically based on farm state changes.
 * @param {HTMLElement} container
 */
export function initFarmingIndicator(container) {
  injectStyles();
  container.classList.add('farming-panel');

  let isCollapsed = localStorage.getItem('farming_panel_collapsed') === 'true';
  if (isCollapsed) container.classList.add('collapsed');

  const render = (farmingGames) => {
    container.innerHTML = '';

    if (!farmingGames || farmingGames.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';

    const header = document.createElement('div');
    header.className = 'farming-panel-header';
    header.onclick = () => {
      isCollapsed = !isCollapsed;
      container.classList.toggle('collapsed', isCollapsed);
      localStorage.setItem('farming_panel_collapsed', isCollapsed);
    };

    const title = document.createElement('div');
    title.className = 'farming-panel-title';
    title.textContent = `Фармится (${farmingGames.length})`;
    header.appendChild(title);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'farming-collapse-btn';
    toggleBtn.innerHTML = iconChevron;
    header.appendChild(toggleBtn);

    container.appendChild(header);

    const itemsCont = document.createElement('div');
    itemsCont.className = 'farming-items-scroll';

    farmingGames.forEach(({ appId, name, phase }) => {
      const item = document.createElement('div');
      item.className = 'farming-item';

      const dot = document.createElement('span');
      dot.className = `farming-dot phase-${phase}`;

      const nameEl = document.createElement('span');
      nameEl.className = 'farming-name';
      nameEl.title = name;
      nameEl.textContent = name;

      const phaseTag = document.createElement('span');
      phaseTag.className = 'farming-phase-tag';
      phaseTag.textContent = phase === 1 ? 'прогрев' : 'фарм';

      item.appendChild(dot);
      item.appendChild(nameEl);
      item.appendChild(phaseTag);
      itemsCont.appendChild(item);
    });

    container.appendChild(itemsCont);
  };

  // Listen for store updates (driven by autoFarm.js → store.set('farmingGames', [...]))
  const unsub = store.subscribe('farmingGames', (farmingGames) => {
    render(farmingGames || []);
  });

  // Listen for electron IPC event as well (driven by idleManager via webContents.send)
  if (window.electronAuth?.onFarmingUpdate) {
    window.electronAuth.onFarmingUpdate((farmingGames) => {
      store.set('farmingGames', farmingGames);
      render(farmingGames || []);
    });
  }

  // Initial render from current store state
  render(store.get('farmingGames') || []);

  return () => unsub();
}
