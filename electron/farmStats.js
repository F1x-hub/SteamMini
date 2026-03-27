import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const STATS_FILE = path.join(app.getPath('userData'), 'farm-stats.json');

export function loadStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) return { sessions: [], history: {} };
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
  } catch { return { sessions: [], history: {} }; }
}

export function saveStats(data) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
}

// Записать факт получения карточки
export function recordCardDrop(appId, gameName) {
  const stats = loadStats();
  const today = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
  const now = Date.now();

  if (!stats.history[today]) stats.history[today] = [];

  stats.history[today].push({
    appId,
    gameName,
    timestamp: now,
  });

  // Текущая сессия
  if (!stats.currentSession) {
    stats.currentSession = { startedAt: now, drops: [] };
  }
  stats.currentSession.drops.push({ appId, gameName, timestamp: now });

  saveStats(stats);
  return stats;
}

// Завершить сессию
export function endSession() {
  const stats = loadStats();
  if (!stats.currentSession) return;

  const session = {
    ...stats.currentSession,
    endedAt: Date.now(),
    totalDrops: stats.currentSession.drops.length,
    duration: Date.now() - stats.currentSession.startedAt,
  };

  stats.sessions.unshift(session);   // новые сессии первыми
  stats.sessions = stats.sessions.slice(0, 30);  // хранить последние 30
  delete stats.currentSession;

  saveStats(stats);
}

// Получить статистику для UI
export function getStatsForUI() {
  const stats = loadStats();
  const today = new Date().toISOString().split('T')[0];
  const session = stats.currentSession;

  // Среднее время между дропами в текущей сессии
  let avgDropTime = null;
  if (session && session.drops.length >= 2) {
    const drops = session.drops;
    const intervals = [];
    for (let i = 1; i < drops.length; i++) {
        intervals.push(drops[i].timestamp - drops[i-1].timestamp);
    }
      
    avgDropTime = Math.round(
      intervals.reduce((a, b) => a + b, 0) / intervals.length / 1000 / 60
    );  // минуты
  }

  return {
    currentSession: {
      drops: session?.drops?.length ?? 0,
      startedAt: session?.startedAt ?? null,
      avgDropTime,  // минут между дропами
    },
    today: (stats.history[today] ?? []).length,
    history: Object.entries(stats.history)
                .sort(([a], [b]) => b.localeCompare(a))
                .slice(0, 30)
                .map(([date, drops]) => ({ date, count: drops.length })),
    sessions: stats.sessions.slice(0, 10),
  };
}
