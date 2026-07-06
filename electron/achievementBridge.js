import fs from 'fs';
import path from 'path';
import { NativeBackendBridge, measureTimer } from './utils/NativeBackendBridge.js';

class AchievementBridge extends NativeBackendBridge {
  constructor() {
    super('SAMBackend.exe');
    this._currentAppId   = null;
    this._ready          = false;
    this._pendingAppId   = null;
  }

  _writeAppId(appId) {
    const appIdFile = path.join(this._exeDir, 'steam_appid.txt');
    fs.writeFileSync(appIdFile, String(appId), 'utf-8');
  }

  loadAchievements(appId) {
    const t = measureTimer(`SAM loadAchievements appId=${appId}`);
    const numericAppId = parseInt(appId, 10);

    if (this._pendingReject) {
      this._pendingReject(Object.assign(new Error('Cancelled'), { cancelled: true }));
      this._pendingReject = null;
    }

    this._pendingAppId = numericAppId;

    return new Promise((resolve, reject) => {
      this._pendingReject = reject;

      this._timer('load', async () => {
        if (this._pendingAppId !== numericAppId) {
          reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
          return;
        }

        this._pendingReject = null;

        try {
          const result = await this._doLoad(numericAppId);
          const count = Array.isArray(result) ? result.length : (result.achievements?.length || 0);
          t.end(`(${count} achievements)`);
          resolve(result);
        } catch (err) {
          t.end(`(error: ${err.message})`);
          reject(err);
        }
      }, 400); 
    });
  }

  async _doLoad(numericAppId) {
    if (this._proc && this._currentAppId !== numericAppId) {
      console.log(`[SAMBridge] Switching from ${this._currentAppId} to ${numericAppId}`);
      await this._stopProcess();
      await new Promise(r => setTimeout(r, 300));
    }

    if (!this._proc) {
      return await this._startAndLoad(numericAppId);
    }

    return this.send('load', { appId: numericAppId });
  }

  async _startAndLoad(appId) {
    return new Promise((resolve, reject) => {
      const exePath = this._exePath;

      if (!fs.existsSync(exePath)) {
        reject(new Error(`SAMBackend.exe not found: ${exePath}`));
        return;
      }

      this._writeAppId(appId);

      console.log('[SAMBridge] Starting process for appId:', appId);

      this._spawn([]);
      this._currentAppId = appId;
      this._ready        = false;

      let resolved = false;

      this._onFirstLoadResolve = (response) => {
        if (!resolved) {
          resolved = true;
          this._ready = true;
          resolve(response.result || response);
        }
      };

      this._onFirstLoadReject = (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      };

      setTimeout(() => {
        if (this._proc && this._proc.stdin && this._proc.stdin.writable) {
          const reqId = ++this._reqId;
          const cmd = { reqId, action: 'load', appId };
          this._send(cmd);
        }
      }, 300);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('SAMBackend start timeout'));
          this._kill();
        }
      }, 15000);
    });
  }

  async _stopProcess() {
    if (!this._proc) return;

    try {
      if (this._ready) {
        await this.send('close', {});
      }
    } catch (err) {
      console.log('[SAMBridge] Close request skipped or process already exited');
    }

    this._kill();
    this._currentAppId = null;
    this._ready        = false;
  }

  async closeGame() {
    return this._stopProcess();
  }

  send(action, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this._proc) {
        reject(new Error('SAMBackend process not running'));
        return;
      }

      const reqId = ++this._reqId;
      this._pending.set(reqId, resolve);

      try {
        if (!this._proc || this._proc.exitCode !== null || !this._proc.stdin?.writable) {
          this._pending.delete(reqId);
          return reject(new Error('SAMBackend process is not running'));
        }
        this._send({ reqId, action, ...params });
      } catch (e) {
        this._pending.delete(reqId);
        if (e.code === 'EPIPE' || e.code === 'ERR_STREAM_DESTROYED') {
          console.log('[SAMBridge] Process already closed, ignoring write error');
          return resolve(null);
        }
        return reject(e);
      }

      setTimeout(() => {
        if (this._pending.has(reqId)) {
          this._pending.delete(reqId);
          reject(new Error(`Timeout: ${action}`));
        }
      }, 15000);
    });
  }

  _onLine(line) {
    try {
      const response = JSON.parse(line);
      
      if (this._onFirstLoadResolve && !this._ready) {
        this._onFirstLoadResolve(response);
        return;
      }

      const reqId = response.reqId;
      if (reqId) {
        const cb = this._pending.get(reqId);
        if (cb) {
          this._pending.delete(reqId);
          cb(response.result || response);
        }
      } else {
        console.log('[SAMBridge] Backend Message:', response);
      }
    } catch (e) {
      console.error('[SAMBridge] Parse error:', e.message, '| Line:', line);
    }
  }

  _onClose(code, signal) {
    super._onClose(code, signal);
    this._currentAppId = null;
    this._ready        = false;

    for (const [, cb] of this._pending) {
      cb({ error: 'Process exited unexpectedly' });
    }
    this._pending.clear();

    if (this._onFirstLoadReject) {
      this._onFirstLoadReject(new Error(`Process exited before responding (${signal || code})`));
      this._onFirstLoadReject = null;
    }
  }

  stop() {
    this.closeGame();
  }
}

export default new AchievementBridge();
