import { BrowserWindow, session } from 'electron';
import {
  isAccessTokenExpired,
  getRefreshToken,
  isRefreshTokenExpired,
  saveRefreshToken,
  decodeJWT
} from './tokenStore.js';

// Главная функция — вызывается при старте и по таймеру
export async function ensureSteamSession(mainSession) {
  // 1. Проверяем текущий steamLoginSecure
  const cookies = await mainSession.cookies.get({
    domain: 'steamcommunity.com',
    name: 'steamLoginSecure'
  });
  const currentCookie = cookies[0]?.value;

  if (currentCookie && !isAccessTokenExpired(currentCookie)) {
    console.log('[Auth] Access token valid, no refresh needed');
    return true;
  }

  console.log('[Auth] Access token expired or missing, trying silent refresh...');

  // 2. Пробуем refresh через hidden browser (самый надёжный способ)
  return await silentBrowserRefresh(mainSession);
}

async function silentBrowserRefresh(mainSession) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,          // ПОЛНОСТЬЮ скрыт
      width: 1,
      height: 1,
      skipTaskbar: true,
      webPreferences: {
        session: mainSession, // используем ту же сессию что и основное приложение
        contextIsolation: true,
      }
    });

    const timeout = setTimeout(() => {
      console.warn('[Auth] Silent refresh timeout');
      win.destroy();
      resolve(false);
    }, 30000);

    win.webContents.on('did-finish-load', async () => {
      try {
        // Проверяем залогинен ли пользователь
        const url = win.webContents.getURL();
        const isLoggedIn = await win.webContents.executeJavaScript(`
          !!(document.querySelector('.user_avatar') || 
             document.querySelector('[data-miniprofile]') ||
             window?.g_steamID)
        `);

        if (isLoggedIn) {
          console.log('[Auth] Silent refresh: user is logged in');
          clearTimeout(timeout);
          win.destroy();
          resolve(true);
        }
        // Если не залогинен — ждём редиректа обратно (Steam автоматически
        // восстановит сессию если есть валидная steamRememberLogin cookie)
      } catch (e) {
        // Страница ещё грузится — продолжаем ждать
      }
    });

    // Проверяем cookies каждые 2 секунды после загрузки
    let checkCount = 0;
    const cookieCheck = setInterval(async () => {
      checkCount++;
      if (checkCount > 15) {
        clearInterval(cookieCheck);
        clearTimeout(timeout);
        win.destroy();
        resolve(false);
        return;
      }

      const cookies = await mainSession.cookies.get({
        domain: 'steamcommunity.com',
        name: 'steamLoginSecure'
      });

      if (cookies[0]?.value && !isAccessTokenExpired(cookies[0].value, 0)) {
        console.log('[Auth] Silent refresh: new steamLoginSecure obtained');
        clearInterval(cookieCheck);
        clearTimeout(timeout);
        win.destroy();
        resolve(true);
      }
    }, 2000);

    // Загружаем минимальную Steam страницу
    win.loadURL('https://store.steampowered.com/login/?redir=&redir_ssl=1', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
  });
}

// Настраиваем периодический авторефреш
export function setupAutoRefresh(mainSession, intervalHours = 1) {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  setInterval(async () => {
    const cookies = await mainSession.cookies.get({
      domain: 'steamcommunity.com',
      name: 'steamLoginSecure'
    });
    const current = cookies[0]?.value;

    // Рефрешим за 30 минут до истечения
    if (!current || isAccessTokenExpired(current, 30 * 60 * 1000)) {
      console.log('[Auth] Proactive refresh triggered');
      await ensureSteamSession(mainSession);
    }
  }, intervalMs);

  console.log(`[Auth] Auto-refresh scheduled every ${intervalHours}h`);
}
