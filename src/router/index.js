class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this.rootElement = null;

    // Handle back/forward navigation
    window.addEventListener('popstate', () => {
      this.handleRoute(window.location.pathname);
    });
  }

  /**
   * Initialize router with a root container
   * @param {HTMLElement} rootElement 
   */
  async init(rootElement, initialPath) {
    this.rootElement = rootElement;
    
    // Intercept global link clicks for SPA routing
    document.body.addEventListener('click', (e) => {
      const link = e.target.closest('[data-link]');
      if (link) {
        e.preventDefault();
        this.navigate(link.getAttribute('href'));
      }
    });

    // Handle initial route
    return this.handleRoute(initialPath || window.location.pathname);
  }

  /**
   * Register a route
   * @param {string|RegExp} path 
   * @param {Function} renderFn Function returning an HTMLElement or string
   */
  add(path, renderFn) {
    this.routes.push({ path, renderFn });
  }

  /**
   * Navigate programmatically
   * @param {string} path 
   */
  navigate(path) {
    if (this.currentRoute === path) return Promise.resolve();
    window.history.pushState(null, '', path);
    return this.handleRoute(path);
  }

  /**
   * Internal route handler
   * @param {string} path 
   */
  async handleRoute(path) {
    this.currentRoute = path;
    
    let renderFn = null;
    let matchArgs = [];

    // Find matching route
    for (const route of this.routes) {
      if (typeof route.path === 'string' && route.path === path) {
        renderFn = route.renderFn;
        break;
      } else if (route.path instanceof RegExp) {
        const match = path.match(route.path);
        if (match) {
          renderFn = route.renderFn;
          matchArgs = match.slice(1);
          break;
        }
      }
    }

    if (!renderFn) {
      renderFn = () => {
        const el = document.createElement('div');
        el.textContent = '404 - Not Found';
        return el;
      };
    }

    if (this.rootElement) {
      // Call cleanup if previous view provided one
      if (this._currentCleanup) {
        try { this._currentCleanup(); } catch (e) { console.error('Router cleanup error:', e); }
        this._currentCleanup = null;
      }

      this.rootElement.innerHTML = '';
      const view = await renderFn(...matchArgs);
      
      let element = view;
      if (view && typeof view === 'object' && view.element) {
        element = view.element;
        this._currentCleanup = view.cleanup;
      }

      if (typeof element === 'string') {
        this.rootElement.innerHTML = element;
      } else if (element instanceof HTMLElement) {
        this.rootElement.appendChild(element);
      }
    }
  }
}

const router = new Router();
export default router;
