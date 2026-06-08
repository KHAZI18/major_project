import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.js', './src/test/setupDom.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
});
