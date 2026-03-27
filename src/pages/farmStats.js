export function renderFarmStats() {
  const container = document.createElement('div');
  container.className = 'farm-stats-page';
  container.style.padding = '24px';
  container.style.color = 'var(--color-text-primary)';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '24px';
  container.style.maxWidth = '800px';
  container.style.margin = '0 auto';

  container.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div class="spinner"></div>
      <div style="margin-top: 16px; color: var(--color-text-secondary);">Загрузка статистики...</div>
    </div>
  `;

  async function loadData() {
    try {
      const stats = await window.electronAuth.statsGet();
      render(stats);
    } catch (err) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--color-danger); padding: 40px;">
          Ошибка загрузки статистики: ${err.message}
        </div>
      `;
    }
  }

  function render(stats) {
    if (!stats) return;

    let historyHtml = '';
    if (stats.history && stats.history.length > 0) {
      historyHtml = stats.history.map(({ date, count }) => `
        <div style="display: flex; justify-content: space-between; padding: 12px 16px; background: var(--color-bg-surface); border-radius: 8px; border: 1px solid var(--color-border); margin-bottom: 8px;">
          <span style="color: var(--color-text-secondary); font-weight: 500;">${new Date(date).toLocaleDateString()}</span>
          <span style="color: var(--color-success); font-weight: 600;">🃏 ${count}</span>
        </div>
      `).join('');
    } else {
      historyHtml = `<div style="color: var(--color-text-secondary); font-style: italic;">История пуста</div>`;
    }

    const currentSessionDrops = stats.currentSession?.drops || 0;
    const avgDropTime = stats.currentSession?.avgDropTime ? `${stats.currentSession.avgDropTime} мин` : '—';
    const todayDrops = stats.today || 0;

    container.innerHTML = `
      <h2 style="margin: 0 0 8px 0; font-size: 1.5rem;">Статистика фарма</h2>
      <p style="color: var(--color-text-secondary); margin-bottom: 24px;">Ваша история выпадения карточек.</p>

      <!-- Текущая сессия -->
      <section style="margin-bottom: 24px;">
        <h3 style="color: var(--color-text-secondary); font-size: 12px; letter-spacing: 1px; margin-bottom: 12px; text-transform: uppercase;">
          Текущая сессия / Сегодня
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          ${renderStatCard('Получено (сессия)', currentSessionDrops)}
          ${renderStatCard('Среднее время дропа', avgDropTime)}
          ${renderStatCard('Выпало сегодня', todayDrops)}
        </div>
      </section>

      <!-- История по дням -->
      <section>
        <h3 style="color: var(--color-text-secondary); font-size: 12px; letter-spacing: 1px; margin-bottom: 12px; text-transform: uppercase;">
          История
        </h3>
        <div style="display: flex; flex-direction: column;">
          ${historyHtml}
        </div>
      </section>
    `;
  }

  function renderStatCard(label, value) {
    return `
      <div style="background: var(--color-bg-surface); padding: 20px; border-radius: var(--radius-lg, 12px); border: 1px solid var(--color-border); text-align: center; box-shadow: var(--shadow-sm);">
        <div style="font-size: 28px; font-weight: 700; color: var(--color-text-primary); margin-bottom: 8px;">${value}</div>
        <div style="font-size: 13px; color: var(--color-text-secondary);">${label}</div>
      </div>
    `;
  }

  loadData();

  return container;
}
