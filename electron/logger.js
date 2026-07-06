import { ipcMain } from 'electron';

const MAX_ENTRIES = 2000;
const logBuffer = [];

function formatEntry(level, args) {
  const time = new Date().toISOString();
  const msg = args.map(a =>
    typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
  ).join(' ');
  return `[${time}] [${level.toUpperCase()}] ${msg}`;
}

export function logEntry(level, ...args) {
  const entry = formatEntry(level, args);
  logBuffer.push(entry);
  if (logBuffer.length > MAX_ENTRIES) logBuffer.shift();
}

export function initLogger() {
  for (const level of ['log', 'warn', 'error', 'info']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      logEntry(level, ...args);
    };
  }

  ipcMain.on('logger:add', (event, { level, args }) => {
    logEntry(level, ...args);
  });
}

export function getLogDump() {
  return logBuffer.join('\n');
}
