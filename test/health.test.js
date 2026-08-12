/**
 * /api/health — deploy verification endpoint.
 *
 * This used to return a hardcoded `{status:'ok'}` regardless of database state,
 * which made it actively misleading: during a real boot failure it reported "ok"
 * while every other endpoint 500'd with ER_NO_SUCH_TABLE. Since it's the thing
 * you curl to confirm a deploy worked, it has to actually probe the database.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { loadApp } from './helpers/app.js'

describe('GET /api/health', () => {
  let app, db
  beforeEach(async () => { ({ app, db } = await loadApp()) })

  it('reports ok and probes the database when it is reachable', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.db).toBe('up')
    // The probe must be a real query, not an assumption.
    expect(db.find(/SELECT 1/)).toHaveLength(1)
  })

  it('reports 503 degraded when the database is unreachable', async () => {
    db.on(/SELECT 1/, () => { throw new Error('ECONNREFUSED') })
    const res = await request(app).get('/api/health')
    // 503 rather than 200 so uptime monitoring actually notices.
    expect(res.status).toBe(503)
    expect(res.body.status).toBe('degraded')
    expect(res.body.db).toBe('down')
  })

  it('does not leak database error details to the caller', async () => {
    db.on(/SELECT 1/, () => { throw new Error("Access denied for user 'root'@'localhost'") })
    const res = await request(app).get('/api/health')
    const body = JSON.stringify(res.body)
    expect(body).not.toMatch(/Access denied/)
    expect(body).not.toMatch(/root/)
  })

  it('is never cached — a stale "ok" would defeat the point', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['cache-control']).toMatch(/no-store/)
  })

  it('reports schema readiness separately from connectivity', async () => {
    // The database can be reachable while the schema has not finished initialising;
    // conflating the two is what made the old endpoint useless during boot.
    const res = await request(app).get('/api/health')
    expect(res.body).toHaveProperty('schema')
    expect(['ready', 'initialising']).toContain(res.body.schema)
  })
})
