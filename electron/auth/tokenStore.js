import Store from 'electron-store';

const store = new Store({ name: 'steam-auth' });

// Декодируем JWT без верификации — просто читаем payload
export function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload;
  } catch {
    return null;
  }
}

// Извлекаем access token из steamLoginSecure (формат: steamid||JWT)
export function extractAccessToken(steamLoginSecure) {
  const decoded = decodeURIComponent(steamLoginSecure);
  const idx = decoded.indexOf('||');
  if (idx === -1) return null;
  return decoded.slice(idx + 2);
}

// Проверяем истёк ли access token (с запасом 30 минут)
export function isAccessTokenExpired(steamLoginSecure, marginMs = 30 * 60 * 1000) {
  const token = extractAccessToken(steamLoginSecure);
  if (!token) return true;
  const payload = decodeJWT(token);
  if (!payload?.exp) return true;
  return (payload.exp * 1000) - Date.now() < marginMs;
}

// Сохраняем refresh token
export function saveRefreshToken(steamId, refreshToken) {
  store.set(`refreshToken.${steamId}`, refreshToken);
  console.log(`[TokenStore] Saved refresh token for ${steamId}`);
}

// Получаем refresh token
export function getRefreshToken(steamId) {
  return store.get(`refreshToken.${steamId}`, null);
}

// Когда истекает refresh token
export function isRefreshTokenExpired(refreshToken, marginMs = 24 * 60 * 60 * 1000) {
  const payload = decodeJWT(refreshToken);
  if (!payload?.exp) return true;
  return (payload.exp * 1000) - Date.now() < marginMs;
}
