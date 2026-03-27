/**
 * Native DOM Toast Notification System
 */
class ToastManager {
  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    
    const style = document.createElement('style');
    style.textContent = `
      .toast-container {
        position: fixed;
        bottom: var(--spacing-lg);
        right: var(--spacing-lg);
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
        z-index: 9999;
        pointer-events: none;
      }
      .toast-notification {
        background: var(--color-bg-surface-light);
        color: var(--color-text-primary);
        padding: var(--spacing-md) var(--spacing-lg);
        border-radius: var(--radius-sm);
        border-left: 4px solid var(--color-action-primary);
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: auto;
      }
      .toast-notification.show {
        opacity: 1;
        transform: translateX(0);
      }
      .toast-notification.hide {
        opacity: 0;
        transform: translateX(100%);
      }
      .toast-success { border-color: #4CAF50; }
      .toast-error { border-color: #F44336; }
      .toast-warning { border-color: #FF9800; }
    `;
    
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(this.container);
      document.body.appendChild(style);
    });
  }

  /**
   * Display a toast message
   * @param {string} message 
   * @param {'info'|'success'|'error'|'warning'} type 
   * @param {number} durationMs 
   */
  show(message, type = 'info', durationMs = 3000) {
    if (!this.container.isConnected) {
      document.body.appendChild(this.container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;

    this.container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Auto remove
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
    }, durationMs);
  }
}

const toast = new ToastManager();
export default toast;
