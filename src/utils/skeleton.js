// src/utils/skeleton.js

/**
 * Рендерит N скелетон-карточек в контейнер
 * @param {HTMLElement} container
 * @param {number} count
 */
export function showSkeleton(container, count = 6) {
  const grid = document.createElement('div');
  grid.className = 'skeleton-grid';

  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'skeleton skeleton-card';
    grid.appendChild(card);
  }

  container.innerHTML = '';
  container.appendChild(grid);
}

/**
 * Убирает скелетон (контейнер очищается перед реальным рендером)
 * @param {HTMLElement} container
 */
export function hideSkeleton(container) {
  container.innerHTML = '';
}
