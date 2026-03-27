import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: './src/tests/setup.ts',
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/utils/autoFarm.js',
        'src/api/steam.js',
        'electron/idleManager.js',
        'src/components/topNav.js',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
