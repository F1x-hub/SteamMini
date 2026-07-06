// electron/ipc/report.js
import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { getLogDump } from '../logger.js';

// ─── НАСТРОЙКИ — поменяй под себя ───────────────────────────
const SMTP_CONFIG = {
  service: 'gmail',
  auth: {
    user: 'iraklilagvilava975@gmail.com',      // отправитель (нужен App Password)
    pass: 'lzvr gkcm sjhu gswf',        // Google App Password (не обычный пароль)
  },
};
const REPORT_TO = 'iraklilagvilava975@gmail.com'; // куда слать
// ────────────────────────────────────────────────────────────

export function registerReportIpc() {
  ipcMain.handle('report:send', async () => {
    try {
      const nodemailer = (await import('nodemailer')).default;
      const transporter = nodemailer.createTransport(SMTP_CONFIG);

      const logs = getLogDump();
      const tmpPath = path.join(app.getPath('temp'), 'steamMini-report.txt');

      const header = [
        `SteamMini Bug Report`,
        `Date: ${new Date().toLocaleString()}`,
        `App version: ${app.getVersion()}`,
        `Platform: ${process.platform} ${process.arch}`,
        `─`.repeat(60),
        '',
      ].join('\n');

      fs.writeFileSync(tmpPath, header + logs, 'utf8');

      await transporter.sendMail({
        from: `"SteamMini" <${SMTP_CONFIG.auth.user}>`,
        to: REPORT_TO,
        subject: `[SteamMini] Bug Report — ${new Date().toLocaleDateString()}`,
        text: 'Лог-файл во вложении.',
        attachments: [{ filename: 'steamMini-report.txt', path: tmpPath }],
      });

      fs.unlinkSync(tmpPath);
      return { ok: true };
    } catch (err) {
      console.error('[report:send]', err);
      return { ok: false, error: err.message };
    }
  });
}
