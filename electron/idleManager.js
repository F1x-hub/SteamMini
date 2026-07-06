import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Max concurrent simulated games limit by Steam
const MAX_IDLE_GAMES = 32;

// Map: appId (string or number) -> ChildProcess
const activeIdles = new Map();

export async function startGame(appId) {
  const appIdStr = appId.toString();

  if (activeIdles.has(appIdStr)) {
    return { success: true, message: 'Already running' };
  }

  if (activeIdles.size >= MAX_IDLE_GAMES) {
    return { success: false, error: `Maximum limit reached: Only ${MAX_IDLE_GAMES} games can be idled simultaneously.` };
  }

  try {
    const workerPath = path.join(__dirname, 'idleWorker.js');
    const child = fork(workerPath, [], {
      env: { ...process.env, APP_ID: appIdStr },
      stdio: 'ignore' // We don't strictly need to pipe output unless for debugging
    });

    child.on('error', (err) => {
      console.error(`Idle Worker error (AppID: ${appIdStr}):`, err);
      activeIdles.delete(appIdStr);
    });

    child.on('exit', (code) => {
      activeIdles.delete(appIdStr);
    });

    activeIdles.set(appIdStr, child);
    return { success: true };
  } catch (error) {
    console.error(`Failed to start idle for AppID ${appIdStr}:`, error);
    return { success: false, error: error.message };
  }
}

export async function stopGame(appId) {
  const appIdStr = appId.toString();
  const child = activeIdles.get(appIdStr);

  if (child) {
    try {
      // Сначала пробуем мягко через IPC — воркер сам вызовет process.exit()
      child.send({ cmd: 'stop' });
    } catch (e) {
      // Если IPC недоступен — force kill
    }

    // Даём 1 секунду на мягкое завершение, потом принудительно
    await new Promise(resolve => {
      const forceKillTimer = setTimeout(() => {
        if (activeIdles.has(appIdStr)) {
          child.kill(); // TerminateProcess на Windows
        }
        resolve();
      }, 1000);

      child.once('exit', () => {
        clearTimeout(forceKillTimer);
        resolve();
      });
    });

    activeIdles.delete(appIdStr);
  }

  return { success: true };
}

export async function getActiveIdles() {
  return { success: true, data: Array.from(activeIdles.keys()) };
}

export function stopAll() {
  for (const [appId, child] of activeIdles.entries()) {
    try { child.send({ cmd: 'stop' }); } catch (e) {}
    child.kill();
  }
  activeIdles.clear();
}
