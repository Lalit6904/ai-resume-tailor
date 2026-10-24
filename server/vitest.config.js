import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 45000,
    hookTimeout: 45000,
    teardownTimeout: 20000,
  },
});
