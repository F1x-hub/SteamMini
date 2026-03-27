import en from './en.json';
import ru from './ru.json';
import store from '../store/index.js';
import storage from '../utils/storage.js';

const dictionaries = { en, ru };

class I18nManager {
  constructor() {
    this.currentLang = 'en';
    
    // Auto-initialize from preferences
    const prefs = storage.get('preferences');
    if (prefs && prefs.lang) {
      this.currentLang = prefs.lang;
    }

    // Subscribe to store changes to live-update
    store.subscribe('lang', (newLang) => {
      this.currentLang = newLang;
      this.translateDOM();
    });
  }

  /**
   * Get translation for a specific key
   * Supports basic dot notation "nav.home"
   * @param {string} key 
   */
  t(key) {
    const keys = key.split('.');
    let value = dictionaries[this.currentLang];
    
    for (let k of keys) {
      if (value === undefined) return key;
      value = value[k];
    }
    
    return value || key;
  }

  /**
   * Translates elements in the DOM with data-i18n attribute
   * Requires robust structural handling to avoid destroying innerHTML structures.
   */
  translateDOM() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        // If it's a placeholder attribute
        if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
          el.setAttribute('placeholder', this.t(key));
        } else {
          el.textContent = this.t(key);
        }
      }
    });
  }
}

const i18n = new I18nManager();
export default i18n;
