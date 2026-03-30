const CDN = 'https://community.akamai.steamstatic.com/economy/image/';

/**
 * Creates a single card element with 3D tilt hover effect.
 * @param {object} card - { name, icon, owned }
 * @returns {HTMLElement}
 */
function createCard3D(card) {
  const wrap = document.createElement('div');
  wrap.className = card.owned ? 'card-item' : 'card-item card-item--uncollected';
  wrap.title = card.name;
  wrap.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 64px;
    position: relative;
    z-index: 1;
    cursor: default;
  `;

  const img = document.createElement('img');
  img.src = `${CDN}${card.icon}/96fx96f`;
  img.alt = card.name;
  img.style.cssText = `
    width: 64px;
    height: 64px;
    border-radius: 4px;
    object-fit: cover;
    background: #1a1a2e;
    display: block;
    transition: transform 0.35s ease-out, filter 0.35s ease-out, box-shadow 0.35s ease-out;
    will-change: transform;
    cursor: pointer;
  `;
  img.addEventListener('error', () => { img.style.opacity = '0.1'; });

  // Full-size preview on click
  img.onclick = (e) => {
    e.stopPropagation();
    if (window.openCardModal) {
      // Use 512x512 for high-res preview
      window.openCardModal(`${CDN}${card.icon}/512fx512f`);
    }
  };

  // 3D tilt on mouse move
  wrap.addEventListener('mousemove', (e) => {
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const rotY = ((x - cx) / cx) * 20;
    const rotX = -((y - cy) / cy) * 20;
    const brightness = 0.85 + ((cy - y) / cy) * 0.35;

    img.style.transform = `perspective(300px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(2,2,2)`;
    img.style.filter = `brightness(${brightness})`;
    img.style.boxShadow = `${-rotY * 0.5}px ${rotX * 0.5}px 18px rgba(0,0,0,0.6)`;
    img.style.transition = 'none';
    wrap.style.zIndex = '50';
  });

  // Reset on mouse leave
  wrap.addEventListener('mouseleave', () => {
    img.style.transition = 'transform 0.45s cubic-bezier(0.23,1,0.32,1), filter 0.45s ease-out, box-shadow 0.45s ease-out';
    img.style.transform = 'perspective(300px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    img.style.filter = 'none';
    img.style.boxShadow = 'none';
    wrap.style.zIndex = '1';
  });

  const label = document.createElement('div');
  label.textContent = card.name;
  label.style.cssText = `
    margin-top: 4px;
    font-size: 9px;
    color: ${card.owned ? '#c6d4df' : '#5f6b72'};
    text-align: center;
    line-height: 1.2;
    max-width: 64px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;

  wrap.appendChild(img);
  wrap.appendChild(label);
  return wrap;
}

/**
 * Creates and returns a DOM element showing the collectible trading cards
 * for the given appId, with color/grayscale based on user inventory ownership
 * and a 3D tilt hover effect.
 *
 * @param {string|number} appId - Steam application ID
 * @returns {HTMLElement}
 */
export function createGameCardsBlock(appId) {
  const block = document.createElement('div');
  block.className = 'game-cards-block';
  block.style.cssText = `
    margin-top: 16px;
    background: rgba(255,255,255,0.04);
    border-radius: 8px;
    padding: 12px 14px;
    overflow: visible;
  `;

  // Header row
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  `;

  const titleText = document.createElement('span');
  titleText.textContent = 'КОЛЛЕКЦИОННЫЕ КАРТОЧКИ';
  titleText.style.cssText = `
    font-size: 11px;
    font-weight: 700;
    color: #8f98a0;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  `;

  const totalBadge = document.createElement('span');
  totalBadge.style.cssText = `
    font-size: 11px;
    font-weight: 700;
    color: #67c1f5;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `;

  header.appendChild(titleText);
  header.appendChild(totalBadge);
  block.appendChild(header);

  const badgeContainer = document.createElement('div');
  badgeContainer.className = 'game-badge-container';
  block.appendChild(badgeContainer);

  const body = document.createElement('div');
  body.style.cssText = 'font-size: 12px; color: #5f6b72;';
  body.textContent = 'Загрузка...';
  block.appendChild(body);

  if (!appId || !window.electronAuth?.getGameCards) {
    body.textContent = 'Нет карточек';
    return block;
  }

  window.electronAuth.getGameCards(appId).then(res => {
    body.innerHTML = '';

    if (!res?.hasCards) {
      body.style.cssText = 'font-size: 12px; color: #5f6b72;';
      body.textContent = 'Нет карточек';
      return;
    }

    totalBadge.textContent = `${res.totalCount} В НАБОРЕ`;

    // Remaining / complete row
    const remainingRow = document.createElement('div');
    remainingRow.style.cssText = 'font-size: 12px; margin-bottom: 10px;';
    if (res.remaining > 0) {
      remainingRow.style.color = '#8f98a0';
      remainingRow.innerHTML = `Несобранных карточек: <strong style="color:#c6d4df">${res.remaining}</strong> <span style="color:#5f6b72">из ${res.totalCount}</span>`;
    } else {
      remainingRow.style.color = '#57cbde';
      remainingRow.textContent = '✓ Набор собран';
    }
    body.appendChild(remainingRow);

    // Card grid — overflow: visible for 3D effect
    const grid = document.createElement('div');
    grid.className = 'cards-grid';
    grid.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      overflow: visible;
    `;

    (res.cards || []).forEach(card => {
      grid.appendChild(createCard3D(card));
    });

    body.appendChild(grid);
  }).catch(() => {
    body.style.cssText = 'font-size: 12px; color: #5f6b72;';
    body.textContent = 'Нет карточек';
  });

  return block;
}
