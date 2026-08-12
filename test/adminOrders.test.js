/**
 * Priority 4 — PATCH /api/admin/orders/:id field scoping, plus the surrounding
 * orders API: status validation, bulk-operation input bounds, pagination, and
 * the /api/* 404 contract.
 *
 * The PATCH handler builds its SET clause from whichever keys are present in the
 * body. That pattern silently starts writing `undefined` — or drops a field
 * entirely — after one careless edit, and nothing else in the app would notice.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { loadApp, bearer } from './helpers/app.js'

const TOKEN = 'b'.repeat(64)

describe('admin orders API', () => {
  let app, db

  beforeEach(async () => {
    ;({ app, db } = await loadApp())
    db.on(/^UPDATE admin_sessions SET last_seen_at/, { affectedRows: 1 }) // authenticated
    db.on(/^UPDATE form_requests SET/, { affectedRows: 1 })
    db.on(/^DELETE FROM form_requests/, { affectedRows: 1 })
  })

  const auth = (r) => r.set(bearer(TOKEN))

  describe('PATCH /api/admin/orders/:id — field scoping', () => {
    it('updates only the fields actually provided', async () => {
      const res = await auth(request(app).patch('/api/admin/orders/5')).send({ price: '150' })
      expect(res.status).toBe(200)

      const [q] = db.find(/^UPDATE form_requests SET/)
      expect(q.sql).toMatch(/SET price=\? WHERE id=\?/)
      expect(q.params).toEqual(['150', '5'])
      // Fields absent from the body must not appear in the statement at all.
      expect(q.sql).not.toMatch(/status=/)
      expect(q.sql).not.toMatch(/notes=/)
      expect(q.sql).not.toMatch(/full_name=/)
    })

    it('updates several fields together while still omitting the rest', async () => {
      await auth(request(app).patch('/api/admin/orders/5'))
        .send({ full_name: 'سارة', location: 'نابلس', has_shipping: true })
      const [q] = db.find(/^UPDATE form_requests SET/)
      expect(q.sql).toMatch(/has_shipping=\?/)
      expect(q.sql).toMatch(/full_name=\?/)
      expect(q.sql).toMatch(/location=\?/)
      expect(q.sql).not.toMatch(/price=/)
      // Params follow the handler's fixed column order (has_shipping precedes
      // full_name and location), with the row id bound last.
      expect(q.params).toEqual([1, 'سارة', 'نابلس', '5'])
    })

    it('coerces has_shipping to a TINYINT rather than passing a raw boolean', async () => {
      await auth(request(app).patch('/api/admin/orders/5')).send({ has_shipping: true })
      const [q] = db.find(/^UPDATE form_requests SET/)
      expect(q.params[0]).toBe(1)

      db.reset()
      await auth(request(app).patch('/api/admin/orders/5')).send({ has_shipping: false })
      const [q2] = db.find(/^UPDATE form_requests SET/)
      expect(q2.params[0]).toBe(0)
    })

    it('preserves an explicitly empty string (clearing a field is a real edit)', async () => {
      await auth(request(app).patch('/api/admin/orders/5')).send({ notes: '' })
      const [q] = db.find(/^UPDATE form_requests SET/)
      expect(q.sql).toMatch(/notes=\?/)
      expect(q.params[0]).toBe('')
    })

    it('rejects an empty body with 400 and issues no UPDATE', async () => {
      const res = await auth(request(app).patch('/api/admin/orders/5')).send({})
      expect(res.status).toBe(400)
      expect(db.find(/^UPDATE form_requests SET/)).toHaveLength(0)
    })

    it('rejects an invalid status with 400, not 500', async () => {
      // Previously this fell through to the ENUM column and surfaced as a 500.
      const res = await auth(request(app).patch('/api/admin/orders/5')).send({ status: 'garbage' })
      expect(res.status).toBe(400)
      expect(db.find(/^UPDATE form_requests SET/)).toHaveLength(0)
    })

    it('accepts each valid status', async () => {
      for (const status of ['new', 'in_progress', 'done']) {
        db.reset()
        const res = await auth(request(app).patch('/api/admin/orders/5')).send({ status })
        expect(res.status, status).toBe(200)
      }
    })
  })

  describe('bulk operations', () => {
    it('rejects a non-array or empty ids list', async () => {
      for (const ids of [undefined, [], 'nope', 5]) {
        const res = await auth(request(app).post('/api/admin/orders/bulk-delete')).send({ ids })
        expect(res.status).toBe(400)
      }
    })

    it('rejects non-integer ids instead of interpolating them', async () => {
      const res = await auth(request(app).post('/api/admin/orders/bulk-delete'))
        .send({ ids: [1, 'DROP TABLE', 3] })
      expect(res.status).toBe(400)
      expect(db.find(/^DELETE FROM form_requests/)).toHaveLength(0)
    })

    it('caps the batch size so a huge array cannot build a huge statement', async () => {
      const res = await auth(request(app).post('/api/admin/orders/bulk-delete'))
        .send({ ids: Array.from({ length: 5000 }, (_, i) => i + 1) })
      expect(res.status).toBe(400)
      expect(db.find(/^DELETE FROM form_requests/)).toHaveLength(0)
    })

    it('deletes a valid batch using one placeholder per id', async () => {
      db.on(/^DELETE FROM form_requests/, { affectedRows: 3 })
      const res = await auth(request(app).post('/api/admin/orders/bulk-delete')).send({ ids: [1, 2, 3] })
      expect(res.status).toBe(200)
      const [q] = db.find(/^DELETE FROM form_requests/)
      expect(q.sql).toMatch(/WHERE id IN \(\?,\?,\?\)/)
      expect(q.params).toEqual([1, 2, 3])
    })

    it('validates status on bulk-status too', async () => {
      const res = await auth(request(app).post('/api/admin/orders/bulk-status'))
        .send({ ids: [1], status: 'nope' })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/admin/orders — pagination', () => {
    beforeEach(() => {
      db.on(/^SELECT COUNT\(\*\) AS total FROM form_requests/, [{ total: 120 }])
      db.on(/GROUP_CONCAT/, [{ id: 1, full_name: 'x', status: 'new' }])
      db.on(/SELECT status, COUNT\(\*\) AS n/, [{ status: 'new', n: 100 }, { status: 'done', n: 20 }])
    })

    it('returns a bounded page plus the totals the UI needs', async () => {
      const res = await auth(request(app).get('/api/admin/orders'))
      expect(res.status).toBe(200)
      expect(res.body.total).toBe(120)
      expect(res.body.limit).toBe(50)
      expect(res.body.counts).toEqual({ new: 100, done: 20 })
      expect(db.find(/GROUP_CONCAT/)[0].sql).toMatch(/LIMIT 50 OFFSET 0/)
    })

    it('clamps limit to the maximum page size', async () => {
      await auth(request(app).get('/api/admin/orders?limit=99999'))
      expect(db.find(/GROUP_CONCAT/)[0].sql).toMatch(/LIMIT 200/)
    })

    it('ignores a negative offset rather than emitting invalid SQL', async () => {
      await auth(request(app).get('/api/admin/orders?offset=-40'))
      expect(db.find(/GROUP_CONCAT/)[0].sql).toMatch(/OFFSET 0/)
    })

    it('refuses to interpolate a non-numeric limit', async () => {
      // LIMIT/OFFSET are interpolated, not bound, so this is the injection surface.
      await auth(request(app).get('/api/admin/orders?limit=10;DROP TABLE form_requests'))
      const sql = db.find(/GROUP_CONCAT/)[0].sql
      expect(sql).not.toMatch(/DROP/)
      expect(sql).toMatch(/LIMIT 50/) // falls back to the default
    })

    it('filters by status server-side, ignoring an unknown value', async () => {
      await auth(request(app).get('/api/admin/orders?status=done'))
      expect(db.find(/GROUP_CONCAT/)[0].params).toContain('done')

      db.reset()
      await auth(request(app).get('/api/admin/orders?status=bogus'))
      expect(db.find(/GROUP_CONCAT/)[0].sql).not.toMatch(/fr\.status = \?/)
    })

    it('searches order fields and joined service names', async () => {
      await auth(request(app).get('/api/admin/orders?q=محمد'))
      const [q] = db.find(/GROUP_CONCAT/)
      expect(q.sql).toMatch(/full_name LIKE \?/)
      // An EXISTS subquery, not a filter on the JOIN — filtering the join would
      // truncate the GROUP_CONCAT of the order's other services.
      expect(q.sql).toMatch(/EXISTS \(SELECT 1 FROM request_services/)
      expect(q.params).toContain('%محمد%')
    })
  })

  describe('API 404 contract', () => {
    it('returns JSON 404 for an unknown /api path, not the SPA shell', async () => {
      const res = await request(app).get('/api/definitely-not-a-route')
      expect(res.status).toBe(404)
      expect(res.type).toMatch(/json/)
      expect(res.body.error).toBeTruthy()
    })

    it('applies to unknown admin paths as well', async () => {
      const res = await auth(request(app).get('/api/admin/nope'))
      expect(res.status).toBe(404)
      expect(res.type).toMatch(/json/)
    })
  })
})
