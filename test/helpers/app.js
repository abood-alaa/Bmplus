/**
 * app.js — boots server.js against a stub pool and hands back the Express app.
 *
 * server.js is CommonJS and pulls in mysql2 with a plain `require()`, which
 * module mocking cannot intercept (verified — a mocked 'mysql2/promise' still
 * yields the real PromisePool). So the pool is injected instead, through the
 * documented `globalThis.__BM_PLUS_TEST_POOL__` seam in server.js.
 *
 * Config is read from env at module load and the pool is built immediately, so
 * both must be in place *before* the require. Each test file calls loadApp() in
 * beforeEach with a fresh stub so state cannot leak between tests.
 */

import { createRequire } from 'module'
import { createMockDb } from './mockDb.js'

const require = createRequire(import.meta.url)
const SERVER_PATH = require.resolve('../../server.js')

export const TEST_ADMIN_PASSWORD = 'test-admin-password'

export async function loadApp(configure) {
  const db = createMockDb()

  // NODE_ENV=test keeps server.js from calling app.listen() (see the guard at the
  // bottom of that file), which would otherwise leave a bound port behind.
  process.env.NODE_ENV       = 'test'
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD === '' ? '' : TEST_ADMIN_PASSWORD
  process.env.DB_USER        = 'test'
  process.env.DB_PASS        = 'test'
  process.env.DB_NAME        = 'test'
  process.env.BASE_URL       = 'https://gs.bmexpress.co'
  // Unset so sendEmail() short-circuits instead of dialling a real SMTP host.
  delete process.env.SMTP_PASS

  // Defaults that keep initDB() quiet. Individual tests override these via db.on;
  // later registrations win, so nothing here constrains a test.
  db.on(/SELECT COUNT\(\*\) as cnt FROM services_config/, [{ cnt: 1 }]) // already seeded
  db.on(/information_schema\.statistics/, [{ n: 1 }])                   // index present

  if (configure) configure(db)

  globalThis.__BM_PLUS_TEST_POOL__ = db.pool
  // server.js caches in require.cache; drop it so each test gets a fresh module
  // instance bound to this test's stub pool.
  delete require.cache[SERVER_PATH]
  const app = require(SERVER_PATH)

  // initDB() is fired without await at module load. Yield once so its queries
  // land before a test inspects db.calls, and don't interleave with the request
  // under test.
  await new Promise((r) => setImmediate(r))
  db.reset()

  return { app, db }
}

export function bearer(token) {
  return { Authorization: `Bearer ${token}` }
}
