import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // server.js is a CommonJS singleton that reads env and builds its pool at
    // module load. Each file gets its own process so one file's mocked pool and
    // env cannot leak into another's.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    restoreMocks: true,
  },
})
