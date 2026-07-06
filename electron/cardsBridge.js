import { NativeBackendBridge, measureTimer } from './utils/NativeBackendBridge.js';

class CardsBridge extends NativeBackendBridge {
  constructor() {
    super('CardDropsBackend.exe');
  }

  start() {
    this._spawn();
  }

  send(action, params = {}) {
    const label = action === 'get_all_drops' ? 'CardDropsBackend full parse' : `CardDropsBackend ${action}`;
    const t = measureTimer(label);

    return new Promise((resolve, reject) => {
      if (!this._proc) this.start();

      const reqId = ++this._reqId;
      this._pending.set(reqId, (result) => {
        const count = Array.isArray(result) ? result.length : (result.games?.length || Array.isArray(result.drops) ? result.drops?.length : 0);
        t.end(`(${count} games/items found)`);
        resolve(result);
      });
      
      try {
        if (!this._proc || this._proc.exitCode !== null || !this._proc.stdin?.writable) {
          this._pending.delete(reqId);
          t.end('(process not running)');
          return reject(new Error('CardDropsBackend process is not running'));
        }
        this._send({ reqId, action, ...params });
      } catch (e) {
        this._pending.delete(reqId);
        if (e.code === 'EPIPE' || e.code === 'ERR_STREAM_DESTROYED') {
          console.log('[CardsBridge] Process already closed, ignoring write error');
          t.end('(EPIPE)');
          return resolve(null);
        }
        t.end(`(error: ${e.message})`);
        return reject(e);
      }

      setTimeout(() => {
        if (this._pending.has(reqId)) {
          this._pending.delete(reqId);
          t.end('(Timeout)');
          reject(new Error(`Timeout: ${action}`));
        }
      }, 60000);
    });
  }

  _onLine(line) {
    try {
      const res = JSON.parse(line);
      const cb  = this._pending.get(res.reqId);
      if (cb) {
        this._pending.delete(res.reqId);
        cb(res);
      }
    } catch (e) {
      console.error('[CardsBridge] Parse error:', e.message);
    }
  }

  _onClose(code, signal) {
    super._onClose(code, signal);
    for (const cb of this._pending.values()) {
      cb({ error: 'Process exited' });
    }
    this._pending.clear();
  }

  stop() {
    this.destroy();
  }
}

export default new CardsBridge();
