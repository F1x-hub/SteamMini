/**
 * HTML fixtures mimicking Steam /badges/ page structure
 */

// Single badge row with remaining drops (English)
export const badgeRowWithDropsEN = `
<div class="badge_row">
  <div class="badge_title">
    Super Fantasy Kingdom
    <span class="badge_view_details">View details</span>
  </div>
  <div class="progress_info_bold">4 card drops remaining</div>
</div>`;

// Single badge row with remaining drops (Russian — Ещё)
export const badgeRowWithDropsRU = `
<div class="badge_row">
  <div class="badge_title">
    Космическая Одиссея
    <span class="badge_view_details">Подробнее</span>
  </div>
  <div class="progress_info_bold">Ещё выпадет карточек: 3</div>
</div>`;

// Single badge row with remaining drops (Russian — Еще, without ё)
export const badgeRowWithDropsRU2 = `
<div class="badge_row">
  <div class="badge_title">
    Игра Без Ё
    <span class="badge_view_details">Подробнее</span>
  </div>
  <div class="progress_info_bold">Еще выпадет карточек: 7</div>
</div>`;

// Badge row with no drops remaining (English)
export const badgeRowNoDropsEN = `
<div class="badge_row">
  <div class="badge_title">
    Half-Life 2
    <span class="badge_view_details">View details</span>
  </div>
  <div class="progress_info_bold">No card drops remaining</div>
</div>`;

// Badge row with no drops remaining (Russian)
export const badgeRowNoDropsRU = `
<div class="badge_row">
  <div class="badge_title">
    Портал 2
    <span class="badge_view_details">Подробнее</span>
  </div>
  <span>Карточки больше не выпадут</span>
</div>`;

// Badge row without any drops info (e.g., community badge)
export const badgeRowNoDrpsInfo = `
<div class="badge_row">
  <div class="badge_title">
    Community Leader
    <span class="badge_view_details">View details</span>
  </div>
  <div class="progress_info_bold">Level 1</div>
</div>`;

// Full page with multiple badge rows and pagination
export const fullBadgesPage = `
<html><body>
  ${badgeRowWithDropsEN}
  ${badgeRowNoDropsEN}
  ${badgeRowWithDropsRU}
  ${badgeRowNoDrpsInfo}
  <div class="pageLinks">
    <a class="pagebtn" href="?p=1">&lt;</a>
    <a class="pagelink" href="?p=1">1</a>
    <a class="pagelink" href="?p=2">2</a>
    <a class="pagebtn" href="?p=2">&gt;</a>
  </div>
</body></html>`;

// Page 2 — last page (pagebtn disabled)
export const fullBadgesPageLast = `
<html><body>
  ${badgeRowWithDropsRU2}
  <div class="pageLinks">
    <a class="pagebtn" href="?p=1">&lt;</a>
    <a class="pagelink" href="?p=1">1</a>
    <a class="pagelink" href="?p=2">2</a>
    <a class="pagebtn disabled" href="?p=2">&gt;</a>
  </div>
</body></html>`;

// Empty page (no badge rows)
export const emptyBadgesPage = `<html><body><div class="badges_content"></div></body></html>`;
