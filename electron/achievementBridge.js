import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function timer(label) {
  const start = Date.now()
  return {
    end: (extra = '') => {
      const ms = Date.now() - start
      const icon = ms < 500 ? '✅' : ms < 2000 ? '⚠️' : '🐢'
      console.log(`${icon} [TIMER] ${label}: ${ms}ms ${extra}`)
      return ms
    }
  }
}


class AchievementBridge {
  constructor() {
    this._process        = null;
    this._pending        = new Map();
    this._reqId          = 0;
    this._currentAppId   = null;
    this._ready          = false;
    this._pendingAppId   = null;   // Следующий запрошенный AppID
    this._loadTimer      = null;   // Debounce таймер
  }

  _getExePath() {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'SAMBackend.exe')
      : path.join(__dirname, '..', 'resources', 'SAMBackend.exe');
  }

  _getExeDir() {
    return path.dirname(this._getExePath());
  }

  // Записать steam_appid.txt рядом с exe — SAM.API читает его при старте
  _writeAppId(appId) {
    const appIdFile = path.join(this._getExeDir(), 'steam_appid.txt');
    fs.writeFileSync(appIdFile, String(appId), 'utf-8');
  }

  // Загрузить достижения с debounce 400ms
  loadAchievements(appId) {
    const t = timer(`SAM loadAchievements appId=${appId}`)
    const numericAppId = parseInt(appId, 10);

    // Отклонить предыдущий ожидающий промис
    if (this._pendingReject) {
      this._pendingReject(Object.assign(new Error('Cancelled'), { cancelled: true }));
      this._pendingReject = null;
    }

    // Отменить предыдущий отложенный запуск
    if (this._loadTimer) {
      clearTimeout(this._loadTimer);
      this._loadTimer = null;
    }

    this._pendingAppId = numericAppId;

    return new Promise((resolve, reject) => {
      this._pendingReject = reject;

      this._loadTimer = setTimeout(async () => {
        // Проверить что это всё ещё актуальный запрос
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
      }, 400); // 400ms debounce
    });
  }

  async _doLoad(numericAppId) {
    // Убить процесс если он для другой игры
    if (this._process && this._currentAppId !== numericAppId) {
      console.log(`[SAMBridge] Switching from ${this._currentAppId} to ${numericAppId}`);
      await this._stopProcess();
      await new Promise(r => setTimeout(r, 300));
    }

    // Запустить процесс и дождаться первого ответа (обычно load)
    if (!this._process) {
      return await this._startAndLoad(numericAppId);
    }

    return this.send('load', { appId: numericAppId });
  }

  async _startAndLoad(appId) {
    return new Promise((resolve, reject) => {
      const exePath = this._getExePath();
      const exeDir  = this._getExeDir();

      if (!fs.existsSync(exePath)) {
        reject(new Error(`SAMBackend.exe not found: ${exePath}`));
        return;
      }

      this._writeAppId(appId);

      console.log('[SAMBridge] Starting process for appId:', appId);

      const proc = spawn(exePath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: exeDir
      });

      this._process      = proc;
      this._currentAppId = appId;
      this._ready        = false;

      let buffer   = '';
      let resolved = false;

      proc.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            
            // Первый ответ — ответ на load
            if (!resolved) {
              resolved    = true;
              this._ready = true;
              resolve(response.result || response);
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
      });

      proc.stderr.on('data', (data) => {
        console.error('[SAMBackend]', data.toString().trim());
      });

      proc.on('exit', (code, signal) => {
        console.log('[SAMBackend] Exited — code:', code, 'signal:', signal);
        this._process      = null;
        this._currentAppId = null;
        this._ready        = false;

        for (const [, cb] of this._pending) {
          cb({ error: 'Process exited unexpectedly' });
        }
        this._pending.clear();

        if (!resolved) {
          resolved = true;
          reject(new Error(`Process exited before responding (${signal || code})`));
        }
      });

      // Отправить load команду после небольшой задержки (300ms)
      setTimeout(() => {
        if (proc && proc.stdin && proc.stdin.writable) {
          const reqId = ++this._reqId;
          const cmd   = JSON.stringify({ reqId, action: 'load', appId });
          proc.stdin.write(cmd + '\n');
        }
      }, 300);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('SAMBackend start timeout'));
          proc.kill('SIGKILL');
        }
      }, 15000);
    });
  }

  // Остановить текущий процесс
  async _stopProcess() {
    if (!this._process) return;

    try {
      if (this._ready) {
        // Отправить close — процесс завершится сам через Environment.Exit(0)
        await this.send('close', {});
      }
    } catch (err) {
      // Процесс уже мог завершиться — это нормально
      console.log('[SAMBridge] Close request skipped or process already exited');
    }

    this._process      = null;
    this._currentAppId = null;
    this._ready        = false;
  }

  async closeGame() {
    return this._stopProcess();
  }

  // Отправить команду в запущенный процесс
  send(action, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this._process) {
        reject(new Error('SAMBackend process not running'));
        return;
      }

      const reqId = ++this._reqId;
      const cmd   = JSON.stringify({ reqId, action, ...params });

      this._pending.set(reqId, resolve);

      try {
        if (!this._process || this._process.exitCode !== null || !this._process.stdin?.writable) {
          this._pending.delete(reqId);
          return reject(new Error('SAMBackend process is not running'));
        }
        this._process.stdin.write(cmd + '\n');
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

  stop() {
    this.closeGame();
  }
}


export default new AchievementBridge();
