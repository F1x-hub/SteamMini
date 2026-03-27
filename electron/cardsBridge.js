import { spawn } from 'child_process';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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


class CardsBridge {
  constructor() {
    this._process  = null
    this._pending  = new Map()
    this._reqId    = 0
  }

  _getExePath() {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'CardDropsBackend.exe')
      : path.join(__dirname, '..', 'resources', 'CardDropsBackend.exe')
  }

  start() {
    const exePath = this._getExePath()
    const exeDir  = path.dirname(exePath)

    this._process = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd:   exeDir,
    })

    let buffer = ''
    this._process.stdout.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const res = JSON.parse(line)
          const cb  = this._pending.get(res.reqId)
          if (cb) {
            this._pending.delete(res.reqId)
            cb(res)
          }
        } catch (e) {
          console.error('[CardsBridge] Parse error:', e.message)
        }
      }
    })

    this._process.stderr.on('data', d =>
      console.error('[CardsBackend]', d.toString().trim()))

    this._process.on('exit', (code, signal) => {
      console.log('[CardsBackend] Exited — code:', code, 'signal:', signal)
      this._process = null
      for (const cb of this._pending.values())
        cb({ error: 'Process exited' })
      this._pending.clear()
    })
  }

  send(action, params = {}) {
    const label = action === 'get_all_drops' ? 'CardDropsBackend full parse' : `CardDropsBackend ${action}`
    const t = timer(label)

    return new Promise((resolve, reject) => {
      if (!this._process) this.start()

      const reqId = ++this._reqId
      this._pending.set(reqId, (result) => {
        const count = Array.isArray(result) ? result.length : (result.games?.length || Array.isArray(result.drops) ? result.drops?.length : 0);
        t.end(`(${count} games/items found)`)
        resolve(result)
      })
      try {
        if (!this._process || this._process.exitCode !== null || !this._process.stdin?.writable) {
          this._pending.delete(reqId)
          t.end('(process not running)')
          return reject(new Error('CardDropsBackend process is not running'))
        }
        this._process.stdin.write(
          JSON.stringify({ reqId, action, ...params }) + '\n')
      } catch (e) {
        this._pending.delete(reqId)
        if (e.code === 'EPIPE' || e.code === 'ERR_STREAM_DESTROYED') {
          console.log('[CardsBridge] Process already closed, ignoring write error')
          t.end('(EPIPE)')
          return resolve(null)
        }
        t.end(`(error: ${e.message})`)
        return reject(e)
      }

      setTimeout(() => {
        if (this._pending.has(reqId)) {
          this._pending.delete(reqId)
          t.end('(Timeout)')
          reject(new Error(`Timeout: ${action}`))
        }
      }, 60000) // 60 сек — парсинг многостраничного badges может занять время
    })
  }

  stop() {
    if (this._process) {
      this._process.kill()
      this._process = null
    }
  }
}

export default new CardsBridge();
