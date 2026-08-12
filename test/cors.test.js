/**
 * CORS origin allowlist.
 *
 * Both https://gs.bmexpress.co and https://www.gs.bmexpress.co serve this site,
 * and browsers treat them as distinct origins. Matching is an exact string
 * compare, so an incomplete or slightly-wrong list returns 403 on every form
 * submission and admin login — a total public outage that looks like a bug in
 * the form rather than a config error. These tests pin the exact strings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { loadApp } from './helpers/app.js'

const APEX = 'https://gs.bmexpress.co'
const WWW  = 'https://www.gs.bmexpress.co'

describe('CORS allowlist', () => {
  let app, db, savedOrigins, savedBase

  beforeEach(async () => {
    savedOrigins = process.env.ALLOWED_ORIGINS
    savedBase    = process.env.BASE_URL
    process.env.ALLOWED_ORIGINS = `${APEX},${WWW}`
    ;({ app, db } = await loadApp())
    db.on(/FROM services_config WHERE is_enabled=1/, [])
  })

  afterEach(() => {
    if (savedOrigins === undefined) delete process.env.ALLOWED_ORIGINS
    else process.env.ALLOWED_ORIGINS = savedOrigins
    if (savedBase === undefined) delete process.env.BASE_URL
    else process.env.BASE_URL = savedBase
  })

  it('accepts the apex origin', async () => {
    const res = await request(app).get('/api/services').set('Origin', APEX)
    expect(res.status).toBe(200)
  })

  it('accepts the www origin', async () => {
    // The regression this exists for: dropping www from the list silently breaks
    // every visitor who reached the site via www.
    const res = await request(app).get('/api/services').set('Origin', WWW)
    expect(res.status).toBe(200)
  })

  it('rejects an unrelated origin', async () => {
    const res = await request(app).get('/api/services').set('Origin', 'https://evil.example')
    expect(res.status).toBe(403)
  })

  it('rejects the right host over the wrong scheme', async () => {
    const res = await request(app).get('/api/services').set('Origin', 'http://gs.bmexpress.co')
    expect(res.status).toBe(403)
  })

  it('rejects a trailing slash — a real and easy misconfiguration', async () => {
    const res = await request(app).get('/api/services').set('Origin', `${APEX}/`)
    expect(res.status).toBe(403)
  })

  it('allows requests with no Origin header (same-origin GETs, curl, monitoring)', async () => {
    const res = await request(app).get('/api/services')
    expect(res.status).toBe(200)
  })

  it('falls back to BASE_URL when ALLOWED_ORIGINS is unset', async () => {
    // Assigned empty rather than deleted: server.js calls dotenv.config(), which
    // repopulates any key MISSING from process.env out of the local .env file — so
    // `delete` would silently reload a real value and this would test nothing.
    // dotenv never overwrites a key that is already present, even when it's ''.
    process.env.ALLOWED_ORIGINS = ''
    process.env.BASE_URL = APEX
    const { app: fallbackApp, db: fdb } = await loadApp()
    fdb.on(/FROM services_config WHERE is_enabled=1/, [])
    const ok = await request(fallbackApp).get('/api/services').set('Origin', APEX)
    expect(ok.status).toBe(200)
    // ...and www is NOT implied by the apex, which is exactly why both are listed
    // explicitly in .env.example rather than relying on this fallback.
    const no = await request(fallbackApp).get('/api/services').set('Origin', WWW)
    expect(no.status).toBe(403)
  })
})
