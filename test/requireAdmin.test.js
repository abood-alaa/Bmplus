/**
 * Priority 1 — the requireAdmin middleware.
 *
 * This is the single gate in front of every admin route. It collapses five
 * distinct failure modes (no header, wrong scheme, malformed token, unknown
 * token, expired session) into one `affectedRows !== 1` check, which is exactly
 * the kind of condition that keeps working while quietly meaning something else
 * after a refactor. These tests pin both the behaviour and the shape of the
 * query that produces it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { loadApp, bearer } from './helpers/app.js'

const VALID_TOKEN = 'a'.repeat(64)

describe('requireAdmin', () => {
  let app, db

  beforeEach(async () => {
    ;({ app, db } = await loadApp())
  })
  afterEach(() => { vi.restoreAllMocks() })

  // The session UPDATE is the only statement that decides auth. Making it match
  // (or not) is how these tests simulate a valid vs. invalid session.
  function sessionUpdateReturns(affectedRows) {
    db.on(/^UPDATE admin_sessions SET last_seen_at/, { affectedRows })
  }

  it('rejects a request with no Authorization header', async () => {
    sessionUpdateReturns(1) // even with a "valid" session, no header must fail
    const res = await request(app).get('/api/admin/orders')
    expect(res.status).toBe(401)
    expect(res.body.error).toBeTruthy()
    // Must short-circuit before touching the database at all.
    expect(db.find(/admin_sessions/)).toHaveLength(0)
  })

  it('rejects a non-Bearer scheme without querying the database', async () => {
    sessionUpdateReturns(1)
    const res = await request(app)
      .get('/api/admin/orders')
      .set('Authorization', `Basic ${VALID_TOKEN}`)
    expect(res.status).toBe(401)
    expect(db.find(/admin_sessions/)).toHaveLength(0)
  })

  it('rejects an unknown or malformed token', async () => {
    sessionUpdateReturns(0) // no row matched
    const res = await request(app)
      .get('/api/admin/orders')
      .set(bearer('not-a-real-token'))
    expect(res.status).toBe(401)
  })

  it('rejects an expired session', async () => {
    // An expired session is indistinguishable from an unknown one at the SQL
    // level — the `expires_at > NOW()` predicate simply doesn't match.
    sessionUpdateReturns(0)
    const res = await request(app).get('/api/admin/orders').set(bearer(VALID_TOKEN))
    expect(res.status).toBe(401)
  })

  it('returns the same error body for expired and unknown tokens', async () => {
    sessionUpdateReturns(0)
    const unknown = await request(app).get('/api/admin/orders').set(bearer('unknown'))
    const expired = await request(app).get('/api/admin/orders').set(bearer(VALID_TOKEN))
    // No oracle telling an attacker which of the two it was.
    expect(unknown.body).toEqual(expired.body)
  })

  it('admits a valid session and slides its expiry in ONE atomic statement', async () => {
    sessionUpdateReturns(1)
    db.on(/^SELECT COUNT\(\*\) AS total FROM form_requests/, [{ total: 0 }])
    db.on(/GROUP_CONCAT/, [])
    db.on(/SELECT status, COUNT\(\*\) AS n/, [])

    const res = await request(app).get('/api/admin/orders').set(bearer(VALID_TOKEN))
    expect(res.status).toBe(200)

    const authQueries = db.find(/admin_sessions/)
    // The regression this guards: reintroducing a SELECT-then-UPDATE pair, which
    // is both slower and racy. Exactly one statement must touch admin_sessions.
    expect(authQueries).toHaveLength(1)
    expect(authQueries[0].sql).toMatch(/^UPDATE admin_sessions/)
    expect(authQueries[0].sql).toMatch(/last_seen_at=NOW\(\)/)
    expect(authQueries[0].sql).toMatch(/expires_at=NOW\(\)\+INTERVAL 30 MINUTE/)
    expect(authQueries[0].sql).toMatch(/expires_at>NOW\(\)/)
  })

  it('looks the session up by token hash, never by the raw token', async () => {
    sessionUpdateReturns(1)
    db.on(/^SELECT COUNT\(\*\) AS total FROM form_requests/, [{ total: 0 }])
    db.on(/SELECT status, COUNT\(\*\) AS n/, [])

    await request(app).get('/api/admin/orders').set(bearer(VALID_TOKEN))

    const [{ params }] = db.find(/admin_sessions/)
    expect(params[0]).not.toBe(VALID_TOKEN)
    expect(params[0]).toMatch(/^[a-f0-9]{64}$/) // sha256 hex
  })

  it('returns 503, not 401, when ADMIN_PASSWORD is unconfigured', async () => {
    const saved = process.env.ADMIN_PASSWORD
    process.env.ADMIN_PASSWORD = ''
    const { app: unconfigured } = await loadApp()
    process.env.ADMIN_PASSWORD = saved

    const res = await request(unconfigured).get('/api/admin/orders').set(bearer(VALID_TOKEN))
    // A misconfigured server must say so rather than masquerading as bad credentials.
    expect(res.status).toBe(503)
  })

  it('gates every admin route, not just the ones with obvious side effects', async () => {
    sessionUpdateReturns(0)
    const routes = [
      ['get',    '/api/admin/orders'],
      ['get',    '/api/admin/orders/1'],
      ['patch',  '/api/admin/orders/1'],
      ['delete', '/api/admin/orders/1'],
      ['post',   '/api/admin/orders'],
      ['post',   '/api/admin/orders/bulk-delete'],
      ['post',   '/api/admin/orders/bulk-status'],
      ['get',    '/api/admin/stats'],
      ['get',    '/api/admin/blogs'],
      ['post',   '/api/admin/blogs'],
      ['put',    '/api/admin/blogs/1'],
      ['delete', '/api/admin/blogs/1'],
      ['get',    '/api/admin/services'],
      ['post',   '/api/admin/services'],
      ['patch',  '/api/admin/services/1'],
      ['delete', '/api/admin/services/1'],
      ['post',   '/api/admin/invoice/pdf'],
    ]
    for (const [method, path] of routes) {
      const res = await request(app)[method](path).set(bearer('bad')).send({})
      expect(res.status, `${method.toUpperCase()} ${path} should be gated`).toBe(401)
    }
  })
})
