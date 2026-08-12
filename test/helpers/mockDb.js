/**
 * mockDb.js — a scriptable stand-in for the mysql2/promise pool.
 *
 * server.js creates its pool at module load and there is no local MySQL in this
 * project (initDB() fails with ECONNREFUSED by design — it's fire-and-forget).
 * Rather than requiring a live database to run the suite, tests mock
 * 'mysql2/promise' with this: every pool.execute/query call is matched against
 * registered SQL patterns and answered with scripted rows.
 *
 * This deliberately tests OUR logic — auth gating, lockout arithmetic, field
 * scoping, validation, rollback ordering — not MySQL's. Queries are recorded so
 * a test can assert on the exact SQL and bound parameters, which is where the
 * interesting bugs in this codebase actually live (e.g. whether the sliding
 * expiry is one statement or two).
 */

import { vi } from 'vitest'

export function createMockDb() {
  const handlers = []          // { pattern, respond }
  const calls    = []          // { sql, params }
  const state    = { transactions: [] }

  // Registers a responder. `pattern` is a RegExp or substring matched against the
  // SQL; `respond` is a value or (params, sql) => value. Later registrations win,
  // so a test can override a default set up in beforeEach.
  function on(pattern, respond) {
    handlers.unshift({ pattern, respond })
  }

  function match(sql) {
    const flat = String(sql).replace(/\s+/g, ' ').trim()
    return handlers.find(h =>
      h.pattern instanceof RegExp ? h.pattern.test(flat) : flat.includes(h.pattern))
  }

  async function execute(sql, params = []) {
    calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params })
    const h = match(sql)
    if (!h) {
      // Default: an empty result set. Shaped as [rows, fields] like mysql2.
      return [[], []]
    }
    const value = typeof h.respond === 'function' ? await h.respond(params, sql) : h.respond
    return [value, []]
  }

  const connection = {
    execute,
    query: execute,
    beginTransaction: vi.fn(async () => { state.transactions.push('begin') }),
    commit:           vi.fn(async () => { state.transactions.push('commit') }),
    rollback:         vi.fn(async () => { state.transactions.push('rollback') }),
    release:          vi.fn(() => { state.transactions.push('release') }),
  }

  const pool = {
    execute,
    query: execute,
    getConnection: vi.fn(async () => connection),
  }

  return {
    pool,
    connection,
    on,
    calls,
    state,
    // Every recorded statement, normalised to single spaces.
    sql: () => calls.map(c => c.sql),
    find: (needle) => calls.filter(c =>
      needle instanceof RegExp ? needle.test(c.sql) : c.sql.includes(needle)),
    reset: () => { calls.length = 0; state.transactions.length = 0 },
  }
}

// MySQL DATETIME-ish string for a moment `secondsAgo` in the past.
export function ago(secondsAgo) {
  return new Date(Date.now() - secondsAgo * 1000)
}
