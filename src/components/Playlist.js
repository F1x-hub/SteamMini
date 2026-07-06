import { icons } from '../utils/icons.js';

export function renderPlaylist(playlist, onGameClick) {
  const section = document.createElement('section');
  section.className = 'playlist-section';
  section.dataset.id = playlist.id;

  section.innerHTML = `
    <div class="playlist-header">
      <div class="playlist-title-group">
        <h2 class="playlist-title">${playlist.title}</h2>
        <p class="playlist-subtitle">${playlist.subtitle}</p>
      </div>
      <span class="playlist-count">${playlist.games.length} игр</span>
    </div>
    <div class="playlist-track"></div>
  `;

  const track = section.querySelector('.playlist-track');

  playlist.games.forEach((game) => {
    const card = buildCard(game, playlist.id);
    card.addEventListener('click', () => onGameClick(game));
    track.appendChild(card);
  });

  track.addEventListener(
    'wheel',
    (event) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      track.scrollLeft += event.deltaY * 2;
    },
    { passive: false }
  );

  return section;
}

function buildCard(game, playlistId) {
  const card = document.createElement('div');
  card.className = 'bl-card';
  card.dataset.appid = game.appid;

  const imgUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`;
  const fallbackUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
  const safeName = escapeHtml(game.name);

  card.innerHTML = `
    <div class="bl-card-art">
      <img src="${imgUrl}"
           alt="${safeName}"
           loading="lazy">
      ${buildBadge(game, playlistId)}
    </div>
    <div class="bl-card-info">
      <span class="bl-card-name" title="${safeName}">${safeName}</span>
      ${buildMeta(game)}
    </div>
  `;

  const img = card.querySelector('img');
  img.onerror = () => {
    if (img.src !== fallbackUrl) {
      img.src = fallbackUrl;          // первый fallback: header.jpg
    } else {
      img.onerror = null;             // оба варианта 404 — останавливаем
      img.src = '';
      img.closest('.bl-card-art')?.classList.add('bl-card-no-cover');
    }
  };

  return card;
}

function buildBadge(game, playlistId) {
  if (playlistId === 'platinum_close') {
    const left = (game.achievements_total || 0) - (game.achievements_unlocked || 0);
    return `<span class="bl-badge badge-trophy" style="display:inline-flex;align-items:center;gap:4px;">${icons.trophy} осталось ${left}</span>`;
  }

  if (game.hltb?.main) {
    return `<span class="bl-badge badge-time" style="display:inline-flex;align-items:center;gap:4px;">${icons.clock} ${game.hltb.main}ч</span>`;
  }

  return '';
}

function buildMeta(game) {
  const parts = [];
  if (game.hltb?.main) parts.push(`<span>Сюжет: ${game.hltb.main}ч</span>`);
  if (game.hltb?.complete) parts.push(`<span>100%: ${game.hltb.complete}ч</span>`);

  const hours = Math.floor((game.playtime_forever || 0) / 60);
  if (hours > 0) parts.push(`<span>Сыграно: ${hours}ч</span>`);

  return parts.length ? `<div class="bl-card-meta">${parts.join('')}</div>` : '';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
