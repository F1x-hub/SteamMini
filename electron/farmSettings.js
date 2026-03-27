import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const SETTINGS_FILE = path.join(app.getPath('userData'), 'farm-settings.json');

export const DEFAULTS = {
  phase1DurationMin: 5,      // минут одновременно
  phase2DurationSec: 5,      // секунд на игру в фазе 2
  maxConcurrent: 30,     // макс игр одновременно
  whitelist: [],     // appId[] — только эти игры (пусто = все)
  blacklist: [],     // appId[] — пропускать эти игры
  notifications: {
    onCardDrop: true,
    onAllReceived: true,
    onFarmComplete: true,
  }
};

export function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) };
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(settings) {
  const merged = { ...DEFAULTS, ...settings };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}
