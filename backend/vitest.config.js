import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Tests share one MongoDB test database — run files sequentially in one
    // process so they don't race on collections.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000, // first run may download the in-memory MongoDB binary
    include: ['tests/**/*.test.js'],
    // Boots an in-memory replica-set MongoDB when TEST_MONGODB_URI isn't set,
    // so the suite runs with no local database installed.
    globalSetup: ['tests/globalSetup.js'],
  },
});
