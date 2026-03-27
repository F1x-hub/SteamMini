import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/api/steam': {
        target: 'https://api.steampowered.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/steam/, ''),
        secure: true
      },
      '/api/community': {
        target: 'https://steamcommunity.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/community/, ''),
        secure: true,
        followRedirects: true,
        configure: (proxy, options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // If steamcommunity redirects to another steamcommunity URL (like /profiles/ id -> /id/ custom),
            // rewrite the location header to go through our proxy again instead of giving the client a cross-origin URL
            if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers['location']) {
              const loc = proxyRes.headers['location'];
              if (loc.startsWith('https://steamcommunity.com')) {
                proxyRes.headers['location'] = loc.replace('https://steamcommunity.com', '/api/community');
              }
            }
          });
        }
      },
      '/api/store': {
        target: 'https://store.steampowered.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/api\/store/, '/api'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept-Language', 'ru-RU,ru;q=0.9');
          });
        }
      },
      '/api/rates': {
        target: 'https://open.er-api.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rates/, '')
      }
    }
  }
});
