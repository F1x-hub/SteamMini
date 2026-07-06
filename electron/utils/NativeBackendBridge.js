import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export function measureTimer(label) {
  const start = Date.now();
  return {
    end: (extra = '') => {
      const ms = Date.now() - start;
      const icon = ms < 500 ? '[OK]' : ms < 2000 ? '[WARN]' : '[SLOW]';
      console.log(`${icon} [TIMER] ${label}: ${ms}ms ${extra}`);
      return ms;
    }
  };
}

export class NativeBackendBridge {
  constructor(exeName) {
    this._exeName = exeName;
    this._proc = null;
    this._buffer = '';
    this._timers = {};
    this._pending = new Map();
    this._reqId = 0;
  }

  get _exePath() {
    return app.isPackaged
      ? path.join(process.resourcesPath, this._exeName)
      : path.join(app.getAppPath(), 'resources', this._exeName);
  }

  get _exeDir() {
    return path.dirname(this._exePath);
  }

  _timer(key, fn, delay) {
    if (this._timers[key]) clearTimeout(this._timers[key]);
    this._timers[key] = setTimeout(() => {
      delete this._timers[key];
      fn();
    }, delay);
  }

  _spawn(args = []) {
    this._kill();
    this._buffer = '';
    
    const exePath = this._exePath;
    if (!fs.existsSync(exePath)) {
      throw new Error(`${this._exeName} not found: ${exePath}`);
    }

    this._proc = spawn(exePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this._exeDir
    });

    this._proc.stdout.on('data', (data) => {
      this._buffer += data.toString();
      const lines = this._buffer.split('\n');
      this._buffer = lines.pop(); 
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) this._onLine(trimmed);
      }
    });

    this._proc.stderr.on('data', (data) => {
      this._onError(data.toString());
    });

    this._proc.on('exit', (code, signal) => {
      this._onClose(code, signal);
    });

    return this._proc;
  }

  _kill() {
    if (this._proc) {
      this._proc.kill();
      this._proc = null;
    }
    this._buffer = '';
  }

  _send(payload) {
    if (this._proc?.stdin?.writable) {
      this._proc.stdin.write(JSON.stringify(payload) + '\n');
    }
  }

  _onLine(line) {}

  _onError(msg) {
    console.error(`[${this._exeName}] stderr:`, msg.trim());
  }

  _onClose(code, signal) {
    console.log(`[${this._exeName}] Exited — code:`, code, 'signal:', signal);
    this._proc = null;
  }

  destroy() {
    Object.values(this._timers).forEach(clearTimeout);
    this._timers = {};
    this._kill();
  }
}
