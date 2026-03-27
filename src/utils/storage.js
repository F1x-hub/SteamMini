import CryptoJS from 'crypto-js';

// We derive a static app key meant to lightly obfuscate localStorage.
// Note: true security requires server-side logic; this prevents casual local snooping.
const SECRET_KEY = 'GameController_Secret_Vault_2026';

class StorageManager {
  /**
   * Encrypts and saves data to localStorage
   * @param {string} key 
   * @param {any} data 
   */
  setEncrypted(key, data) {
    try {
      const jsonStr = JSON.stringify(data);
      const encrypted = CryptoJS.AES.encrypt(jsonStr, SECRET_KEY).toString();
      localStorage.setItem(key, encrypted);
    } catch (e) {
      console.error('Failed to encrypt data', e);
    }
  }

  /**
   * Retrieves and decrypts data from localStorage
   * @param {string} key 
   * @returns {any|null}
   */
  getDecrypted(key) {
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      
      const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(decrypted);
    } catch (e) {
      console.error('Failed to decrypt data', e);
      return null;
    }
  }

  set(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return localStorage.getItem(key);
    }
  }

  remove(key) {
    localStorage.removeItem(key);
  }
}

const storage = new StorageManager();
export default storage;
