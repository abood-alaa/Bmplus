/**
 * Priority 3 — login lockout: 3 consecutive failures per IP within 15 minutes.
 *
 * The subtle requirement, and the one most likely to be broken by a well-meaning
 * refactor, is what "consecutive" means: failures are counted only since *this
 * IP's* most recent success. A success from a different IP must not reset another
 * IP's streak. That semantic lives entirely in a WHERE clause, so it's asserted
 * against the actual SQL as well as the response.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { loadApp, TEST_ADMIN_PASSWORD } from './helpers/app.js'

describe('POST /api/admin/login — lockout', () => {
  let app, db

  beforeEach(async () => {
    ;({ app, db } = await loadApp())
    // Defaults: no prior success, no recent failures, inserts succeed.
    db.on(/MAX\(attempted_at\) AS lastSuccess/, [{ lastSuccess: null }])
    db.on(/SELECT attempted_at FROM admin_login_attempts/, [])
    db.on(/^INSERT INTO admin_login_attempts/, { insertId: 1, affectedRows: 1 })
    db.on(/^INSERT INTO admin_sessions/, { insertId: 1, affectedRows: 1 })
    db.on(/^DELETE FROM admin_/, { affectedRows: 0 })
  })

  it('issues a random token on a correct password', async () => {
    const res = await request(app).post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.token).toMatch(/^[a-f0-9]{64}$/) // 32 random bytes, hex
  })

  it('stores only the hash of the token, never the token itself', async () => {
    const res = await request(app).post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD })
    const [insert] = db.find(/^INSERT INTO admin_sessions/)
    expect(insert.params[0]).not.toBe(res.body.token)
    expect(insert.params[0]).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects a wrong password with 401 and records the failure', async () => {
    const res = await request(app).post('/api/admin/login').send({ password: 'wrong' })
    expect(res.status).toBe(401)
    const [attempt] = db.find(/^INSERT INTO admin_login_attempts/)
    expect(attempt.params[1]).toBe(0) // success = 0
  })

  it('records successes too — the reset-on-success query depends on those rows', async () => {
    await request(app).post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD })
    const [attempt] = db.find(/^INSERT INTO admin_login_attempts/)
    expect(attempt.params[1]).toBe(1)
  })

  it('locks out after 3 failures inside the window, with a correct retryAfterSeconds', async () => {
    // Three failures, the oldest 5 minutes ago → 15 - 5 = 10 minutes remaining.
    db.on(/SELECT attempted_at FROM admin_login_attempts/, [
      { attempted_at: new Date(Date.now() - 1 * 60_000) },
      { attempted_at: new Date(Date.now() - 3 * 60_000) },
      { attempted_at: new Date(Date.now() - 5 * 60_000) },
    ])
    db.on(/TIMESTAMPDIFF\(SECOND, NOW\(\)/, [{ retryAfterSeconds: 600 }])

    const res = await request(app).post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD })
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('LOCKED_OUT')
    expect(res.body.retryAfterSeconds).toBe(600)
    expect(res.headers['retry-after']).toBe('600')
  })

  it('rejects a locked-out request even when the password is correct', async () => {
    db.on(/SELECT attempted_at FROM admin_login_attempts/, [
      { attempted_at: new Date() }, { attempted_at: new Date() }, { attempted_at: new Date() },
    ])
    db.on(/TIMESTAMPDIFF\(SECOND, NOW\(\)/, [{ retryAfterSeconds: 900 }])

    const res = await request(app).post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD })
    expect(res.status).toBe(429)
    // No session may be created while locked out.
    expect(db.find(/^INSERT INTO admin_sessions/)).toHaveLength(0)
  })

  it('lets the attempt through once the window has aged out', async () => {
    // Three failures are on record, but the oldest is older than 15 minutes, so
    // MySQL returns 0 seconds remaining and the login must proceed.
    db.on(/SELECT attempted_at FROM admin_login_attempts/, [
      { attempted_at: new Date(Date.now() - 16 * 60_000) },
      { attempted_at: new Date(Date.now() - 17 * 60_000) },
      { attempted_at: new Date(Date.now() - 18 * 60_000) },
    ])
    db.on(/TIMESTAMPDIFF\(SECOND, NOW\(\)/, [{ retryAfterSeconds: 0 }])

    const res = await request(app).post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD })
    expect(res.status).toBe(200)
  })

  it('two failures is not enough to lock out', async () => {
    db.on(/SELECT attempted_at FROM admin_login_attempts/, [
      { attempted_at: new Date() }, { attempted_at: new Date() },
    ])
    const res = await request(app).post('/api/admin/login').send({ password: 'wrong' })
    expect(res.status).toBe(401) // rejected, but not locked
    expect(res.body.code).toBeUndefined()
  })

  it('scopes the "last success" lookup to the requesting IP', async () => {
    await request(app).post('/api/admin/login').send({ password: 'wrong' })
    const [q] = db.find(/MAX\(attempted_at\) AS lastSuccess/)
    // The whole point: without `ip=?` here, one IP's successful login would clear
    // every other IP's failure streak, defeating the lockout entirely.
    expect(q.sql).toMatch(/WHERE ip=\?/)
    expect(q.sql).toMatch(/success=1/)
    expect(q.params).toHaveLength(1)
  })

  it('counts only failures newer than this IP\'s last success', async () => {
    const lastSuccess = new Date(Date.now() - 10 * 60_000)
    db.on(/MAX\(attempted_at\) AS lastSuccess/, [{ lastSuccess }])
    await request(app).post('/api/admin/login').send({ password: 'wrong' })

    const [q] = db.find(/SELECT attempted_at FROM admin_login_attempts/)
    expect(q.sql).toMatch(/success=0/)
    expect(q.sql).toMatch(/attempted_at > \?/)
    expect(q.params[1]).toBe(lastSuccess) // bound to the success timestamp, not a constant
  })

  it('computes the countdown in MySQL rather than mixing in JS Date.now()', async () => {
    db.on(/SELECT attempted_at FROM admin_login_attempts/, [
      { attempted_at: new Date() }, { attempted_at: new Date() }, { attempted_at: new Date() },
    ])
    db.on(/TIMESTAMPDIFF\(SECOND, NOW\(\)/, [{ retryAfterSeconds: 42 }])
    await request(app).post('/api/admin/login').send({ password: 'wrong' })

    // Guards against reintroducing Node/MySQL clock-skew bugs.
    const [q] = db.find(/TIMESTAMPDIFF/)
    expect(q.sql).toMatch(/GREATEST\(0, TIMESTAMPDIFF\(SECOND, NOW\(\), \? \+ INTERVAL 15 MINUTE\)\)/)
  })

  it('runs opportunistic cleanup on login (there is no cron on this host)', async () => {
    await request(app).post('/api/admin/login').send({ password: TEST_ADMIN_PASSWORD })
    expect(db.find(/DELETE FROM admin_sessions WHERE expires_at < NOW\(\)/)).toHaveLength(1)
    expect(db.find(/DELETE FROM admin_login_attempts WHERE attempted_at </)).toHaveLength(1)
  })
})
