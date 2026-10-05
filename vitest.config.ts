import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Local migration archives may contain older tests; only test the current source tree.
  test: { include: ['src/**/*.test.ts'] },
});
