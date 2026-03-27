import https from 'https';
import zlib from 'zlib';
import crypto from 'crypto';
import { BrowserWindow, session } from 'electron';

// ──────────────── Timer ────────────────

export function timer(label) {
  const start = Date.now();
  return {
    end: (extra = '') => {
      const ms = Date.now() - start;
      const icon = ms < 500 ? '✅' : ms < 2000 ? '⚠️' : '🐢';
      console.log(`${icon} [TIMER] ${label}: ${ms}ms ${extra}`);
      return ms;
    }
  };
}

// ──────────────── Dedupe ────────────────

const inFlightRequests = new Map();

export function dedupe(key, promiseFn) {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }
  const promise = promiseFn().finally(() => inFlightRequests.delete(key));
  inFlightRequests.set(key, promise);
  return promise;
}

// ──────────────── HTTPS Get ────────────────

export function httpsGet(options, body = null, maxRedirects = 3) {
  const label = `httpsGet ${options.hostname}${options.path?.substring(0, 50)}`;
  const t     = timer(label);
  return new Promise((resolve, reject) => {
    options.headers = options.headers ?? {};
    options.headers['Accept-Encoding'] = 'gzip, deflate';

    const req = https.request(options, res => {
      console.log(`[httpsGet] ${options.hostname}${options.path} - Status: ${res.statusCode}`);

      // Follow redirects (301/302)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && maxRedirects > 0) {
        const location = res.headers.location;
        console.log(`[httpsGet] Redirecting to: ${location}`);

        const newUrl = new URL(location, `https://${options.hostname}`);
        const newOptions = {
          hostname: newUrl.hostname,
          path:     newUrl.pathname + newUrl.search,
          method:   options.method || 'GET',
          headers:  options.headers
        };

        res.resume();
        resolve(httpsGet(newOptions, body, maxRedirects - 1));
        return;
      }

      console.log(`[httpsGet] ${options.hostname}${options.path} - Final encoding: ${res.headers['content-encoding'] || 'none'}`);
      
      const encoding = res.headers['content-encoding'];
      let stream = res;
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const resBody = buffer.toString('utf8');
        t.end(`(${resBody.length} bytes, status=${res.statusCode})`);
        resolve({
          status:  res.statusCode,
          headers: res.headers,
          body:    resBody,
        });
      });
      stream.on('error', reject);
    });
    
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ──────────────── Steam Cookie Refresh ────────────────

export async function refreshSteamCookies() {
  const t = timer('refreshSteamCookies');
  return new Promise((resolve) => {
    console.log('[Cookies] Opening hidden window to refresh Steam cookies...');

    const win = new BrowserWindow({
      show:            false,
      width:           1,
      height:          1,
      webPreferences: {
        nodeIntegration:  false,
        contextIsolation: true,
        session:          session.defaultSession,
      }
    });

    let resolved = false;

    const done = () => {
      if (resolved) return;
      resolved = true;
      try { win.destroy(); } catch {}
      t.end();
      resolve();
    };

    win.webContents.on('did-finish-load', async () => {
      console.log('[Cookies] Steam page loaded, waiting for cookies...');
      await new Promise(r => setTimeout(r, 1000));
      done();
    });

    setTimeout(done, 15000);

    win.loadURL('https://steamcommunity.com/', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                 'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                 'Chrome/120.0.0.0 Safari/537.36'
    });
  });
}

// ──────────────── Steam Cookies ────────────────

export async function getSteamCookies() {
  const ses = session.defaultSession;

  const allCookies = await ses.cookies.get({ domain: 'steamcommunity.com' });
  console.log('[Cookies] All steamcommunity.com cookies:',
    allCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`));

  const loginSecure = allCookies.find(c => c.name === 'steamLoginSecure')?.value ?? '';
  let   sessionId   = allCookies.find(c => c.name === 'sessionid')?.value        ?? '';

  if (!loginSecure) {
    console.log('[Cookies] No steamLoginSecure, refreshing...');
    await refreshSteamCookies();
    const fresh = await ses.cookies.get({ domain: 'steamcommunity.com' });
    const ls = fresh.find(c => c.name === 'steamLoginSecure')?.value ?? '';
    if (ls) return getSteamCookies();
  }

  if (!sessionId && loginSecure) {
    sessionId = crypto.randomBytes(12).toString('hex');
    await ses.cookies.set({
      url: 'https://steamcommunity.com', name: 'sessionid',
      value: sessionId, domain: 'steamcommunity.com', path: '/', secure: true,
    });
    console.log('[Cookies] Generated sessionid:', sessionId);
  }

  console.log('[Cookies] loginSecure (first 30):', loginSecure.substring(0, 30));
  return { sessionId, loginSecure };
}

// ──────────────── Seller Price Calculator ────────────────

/**
 * Calculates the seller's proceeds from a given buyer price in cents.
 * Steam takes a 5% fee and the publisher takes a 10% fee (both minimum 1 cent).
 */
export function sellerPriceFromBuyerPrice(desiredBuyerCents) {
  for (let seller = desiredBuyerCents; seller >= 1; seller--) {
    const steamFee     = Math.max(Math.floor(seller * 0.05), 1);
    const publisherFee = Math.max(Math.floor(seller * 0.10), 1);
    if (seller + steamFee + publisherFee <= desiredBuyerCents) {
      return seller;
    }
  }
  return 1;
}
