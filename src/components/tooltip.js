export function initTooltips() {
  const tooltipElement = document.createElement('div');
  tooltipElement.className = 'custom-tooltip';
  document.body.appendChild(tooltipElement);

  // Add styles matching Yin-Yang
  const style = document.createElement('style');
  style.textContent = `
    .custom-tooltip {
      position: fixed;
      background: var(--color-dropdown-bg);
      color: var(--color-text-primary);
      border: 1px solid var(--color-dropdown-border);
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      font-size: 0.8rem;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transform: translateY(4px);
      transition: opacity 150ms ease, transform 150ms ease, visibility 150ms;
      z-index: 99999;
      white-space: nowrap;
      box-shadow: var(--shadow-md);
    }
    .custom-tooltip.visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);

  let currentTarget = null;

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
      currentTarget = target;
      tooltipElement.textContent = target.getAttribute('data-tooltip');
      const rect = target.getBoundingClientRect();
      
      // default: above the element
      requestAnimationFrame(() => {
        let top = rect.top - tooltipElement.offsetHeight - 8;
        let left = rect.left + (rect.width / 2) - (tooltipElement.offsetWidth / 2);

        // boundaries check
        if (top < 0) top = rect.bottom + 8; 
        if (left < 4) left = 4;
        if (left + tooltipElement.offsetWidth > window.innerWidth) {
          left = window.innerWidth - tooltipElement.offsetWidth - 4;
        }

        tooltipElement.style.top = top + 'px';
        tooltipElement.style.left = left + 'px';
        tooltipElement.classList.add('visible');
      });
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (currentTarget && !currentTarget.contains(e.relatedTarget)) {
      tooltipElement.classList.remove('visible');
      currentTarget = null;
    }
  });
}
