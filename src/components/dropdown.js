export function createDropdown({ id, options, selectedValue, onChange }) {
  const container = document.createElement('div');
  container.className = 'custom-dropdown';
  if (id) container.id = id;

  const currentOption = options.find(o => o.value === selectedValue) || options[0];

  container.innerHTML = `
    <div class="dropdown-header">
      <span class="dropdown-label">${currentOption.label}</span>
      <svg class="dropdown-arrow" viewBox="0 0 10 6"><path d="M1 1L5 5L9 1" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="dropdown-menu">
      <div class="dropdown-scroll-area">
        ${options.map(opt => `
          <div class="dropdown-item ${opt.value === selectedValue ? 'selected' : ''}" data-value="${opt.value}">
            ${opt.label}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Inject styles globally just once to avoid duplication,
  // but for simplicity of this component we can use a static ID check
  if (!document.getElementById('custom-dropdown-styles')) {
    const style = document.createElement('style');
    style.id = 'custom-dropdown-styles';
    style.textContent = `
      .custom-dropdown {
        position: relative;
        font-family: var(--font-family-base);
        font-size: 0.85rem;
        user-select: none;
        width: 100%;
        min-width: 180px;
      }
      .dropdown-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--color-bg-base);
        border: 1px solid var(--color-border);
        padding: 8px 12px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        color: var(--color-text-primary);
        transition: border-color 0.2s, background-color 0.3s;
      }
      .dropdown-header:hover {
        border-color: var(--color-text-secondary);
      }
      .custom-dropdown.open .dropdown-header {
        border-color: var(--color-action-primary);
      }
      .dropdown-arrow {
        width: 10px;
        height: 6px;
        transition: transform 0.2s ease;
      }
      .custom-dropdown.open .dropdown-arrow {
        transform: rotate(180deg);
      }
      .dropdown-menu {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: var(--color-dropdown-bg);
        border: 1px solid var(--color-dropdown-border);
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-md);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px);
        transition: opacity 150ms ease, transform 150ms ease, visibility 150ms;
        z-index: 1000;
        overflow: hidden;
      }
      .custom-dropdown.open .dropdown-menu {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
      .dropdown-scroll-area {
        max-height: 200px;
        overflow-y: auto;
        padding: 4px 0;
      }
      /* Custom Thin Scrollbar for dropdown */
      .dropdown-scroll-area::-webkit-scrollbar {
        width: 4px;
      }
      .dropdown-scroll-area::-webkit-scrollbar-track {
        background: transparent;
      }
      .dropdown-scroll-area::-webkit-scrollbar-thumb {
        background: var(--color-text-secondary);
        border-radius: 4px;
      }
      .dropdown-item {
        padding: 8px 12px 8px 14px;
        cursor: pointer;
        color: var(--color-text-primary);
        transition: background-color 0.15s ease;
        position: relative;
      }
      .dropdown-item:hover {
        background: var(--color-dropdown-hover);
      }
      .dropdown-item.selected {
        background: var(--color-dropdown-active);
        color: var(--color-text-primary);
      }
      .dropdown-item.selected::before {
        content: '';
        position: absolute;
        left: 0;
        top: 4px;
        bottom: 4px;
        width: 2px;
        background: var(--color-dropdown-active-border);
        border-radius: 0 2px 2px 0;
      }
    `;
    document.head.appendChild(style);
  }

  const header = container.querySelector('.dropdown-header');
  const menu = container.querySelector('.dropdown-menu');
  const label = container.querySelector('.dropdown-label');
  let isOpen = false;
  let activeValue = selectedValue;

  const toggleOpen = (e) => {
    if (isOpen) {
      close();
    } else {
      isOpen = true;
      container.classList.add('open');
      
      setTimeout(() => {
        document.addEventListener('click', closeMenu);
        document.addEventListener('keydown', handleKey);
      }, 0);
      
      // Auto-scroll to selected
      const selectedEl = menu.querySelector('.selected');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    container.classList.remove('open');
    document.removeEventListener('click', closeMenu);
    document.removeEventListener('keydown', handleKey);
  };

  const closeMenu = (e) => {
    if (!container.contains(e.target)) {
      close();
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') close();
  };

  header.addEventListener('click', toggleOpen);

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (item) {
      const val = item.getAttribute('data-value');
      const text = item.textContent.trim();
      label.textContent = text;
      
      menu.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');

      close();
      if (val !== activeValue) {
        activeValue = val;
        if (onChange) onChange(val);
      }
    }
  });

  // Provide an API to update programmatically if needed
  container.__updateValue = (val) => {
    const opt = options.find(o => o.value === val);
    if (opt) {
      activeValue = val;
      label.textContent = opt.label;
      menu.querySelectorAll('.dropdown-item').forEach(el => {
        el.classList.toggle('selected', el.getAttribute('data-value') === val);
      });
    }
  };
  
  // Provide getter
  container.__getValue = () => activeValue;

  return container;
}
