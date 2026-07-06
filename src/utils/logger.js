/**
 * A persistent logger that writes to both console and localStorage.
 * Useful for debugging issues where the renderer process reloads or crashes.
 */
class PersistentLogger {
  constructor() {
    this.storageKey = 'app_logs';
    this.maxLogs = 200; // Keep the last 200 logs to avoid localStorage bloat
  }

  log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      args: args.map(arg => {
        try {
          return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        } catch (e) {
          return '[Unserializable object]';
        }
      })
    };

    // Console output
    const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[consoleMethod](`[${level}] ${message}`, ...args);

    // Persistent storage (localStorage)
    try {
      let logs = [];
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) logs = JSON.parse(stored);
      } catch (e) {
        // Safe reset if corrupted
      }

      logs.push(logEntry);
      if (logs.length > this.maxLogs) {
        logs = logs.slice(-this.maxLogs);
      }
      localStorage.setItem(this.storageKey, JSON.stringify(logs));
    } catch (e) {
      // Silently fail if localStorage is broken
    }
  }

  info(message, ...args)  { this.log('INFO',  message, ...args); }
  warn(message, ...args)  { this.log('WARN',  message, ...args); }
  error(message, ...args) { this.log('ERROR', message, ...args); }

  getLogs() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch (e) {
      return [];
    }
  }

  clear() {
    localStorage.removeItem(this.storageKey);
  }
}

const logger = new PersistentLogger();
export default logger;
