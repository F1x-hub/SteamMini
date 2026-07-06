import { icons } from '../utils/icons.js';
import { getGGDealsKeyshops } from '../api/ggdeals.js';
import store from '../store/index.js';

const GG_REGION = 'us';

export async function renderPriceWidget(container, appId) {
  const user = store.get('user');
  const userRegion = user?.country || 'GE';
  container.innerHTML = `
    <div class="pw">
      <div class="pw__header" style="display:flex;align-items:center;gap:6px;">${icons.wallet} Где купить</div>
      <div class="pw__loading">Загрузка цен…</div>
    </div>`;

  let ggData = null;
  try {
    ggData = await getGGDealsKeyshops(appId);
  } catch (e) {
    console.error('Failed to load GG.deals prices:', e);
  }

  if (!ggData) {
    container.innerHTML = `
      <div class="pw">
        <div class="pw__header" style="display:flex;align-items:center;gap:6px;">${icons.wallet} Где купить</div>
        <div class="pw__empty">Предложения не найдены</div>
      </div>`;
    return;
  }

  // --- Кейшопы (GG.deals) ---
  let keyshopHtml = '';
  if (ggData?.prices) {
    const p = ggData.prices;

    let baseUrl = ggData.url ?? '';
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://gg.deals${baseUrl}`;
    }
    const ggUrl = `${baseUrl.replace(/\/$/, '')}/?tab=keyshops&region=${GG_REGION}`;

    const currentRow = p.currentKeyshops !== null ? `
      <a class="pw-deal pw-deal--keyshop" href="${ggUrl}" target="_blank" rel="noopener noreferrer">
        <span class="pw-deal__shop">Лучший кейшоп</span>
        <span class="pw-deal__right">
          <span class="pw-deal__price pw-deal__price--ks">${p.currentKeyshops} ${p.currency}</span>
          <span class="pw-deal__hist">Мин: ${p.historicalKeyshops} ${p.currency}</span>
        </span>
      </a>` : '<div class="pw-empty-row">Нет предложений в кейшопах</div>';

    keyshopHtml = `
      <div class="pw-section pw-section--keyshop">
        <div class="pw-section__head">
          <span class="pw-section__title" style="display:flex;align-items:center;gap:6px;">${icons.key} Кейшопы</span>
          <span class="pw-badge pw-badge--warn">${icons.warning} Регион US · Global ключи</span>
        </div>
        <div class="pw-ks-warning">
          Перед покупкой проверяй совместимость ключа с регионом ${userRegion}
        </div>
        ${currentRow}
        <div class="pw-section__footer">
          Данные: <a href="https://gg.deals" target="_blank" rel="noopener">GG.deals ↗</a>
        </div>
      </div>`;
  }

  container.innerHTML = `
    <div class="pw">
      <div class="pw__header" style="display:flex;align-items:center;gap:6px;">${icons.wallet} Где купить</div>
      ${keyshopHtml}
    </div>`;
}
