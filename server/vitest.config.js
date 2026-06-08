import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // mongodb-memory-server's first-run binary download can be slow.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
