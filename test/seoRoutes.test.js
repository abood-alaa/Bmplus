/**
 * sitemap.xml — generated rather than shipped as a static file, because blog
 * articles live in MySQL and are published from the admin panel. A checked-in
 * sitemap would go stale the moment an article is added.
 *
 * The important property is that it degrades rather than 500s: if the database
 * is unreachable the static routes must still be served, since a broken sitemap
 * is worse than a partial one.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { loadApp } from './helpers/app.js'

describe('GET /sitemap.xml', () => {
  let app, db

  beforeEach(async () => {
    ;({ app, db } = await loadApp())
  })

  it('serves valid XML with the correct content type', async () => {
    db.on(/FROM blog_articles WHERE is_published=1/, [])
    const res = await request(app).get('/sitemap.xml')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/xml/)
    expect(res.text).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    expect(res.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  })

  it('always includes the static routes', async () => {
    db.on(/FROM blog_articles WHERE is_published=1/, [])
    const res = await request(app).get('/sitemap.xml')
    expect(res.text).toContain('<loc>https://gs.bmexpress.co/</loc>')
    expect(res.text).toContain('<loc>https://gs.bmexpress.co/blog</loc>')
  })

  it('includes every published article with a lastmod date', async () => {
    db.on(/FROM blog_articles WHERE is_published=1/, [
      { slug: 'how-to-get-birth-certificate', updated_at: new Date('2026-03-05T10:00:00Z'), created_at: new Date('2026-01-01') },
      { slug: 'passport-guide', updated_at: null, created_at: new Date('2026-02-10T08:00:00Z') },
    ])
    const res = await request(app).get('/sitemap.xml')
    expect(res.text).toContain('<loc>https://gs.bmexpress.co/blog/how-to-get-birth-certificate</loc>')
    expect(res.text).toContain('<lastmod>2026-03-05</lastmod>')
    // Falls back to created_at when the article has never been edited.
    expect(res.text).toContain('<lastmod>2026-02-10</lastmod>')
  })

  it('percent-encodes slugs so Arabic ones stay valid URLs', async () => {
    db.on(/FROM blog_articles WHERE is_published=1/, [
      { slug: 'شهادة-ميلاد', updated_at: null, created_at: new Date('2026-01-01') },
    ])
    const res = await request(app).get('/sitemap.xml')
    expect(res.text).toContain('%D8%B4%D9%87%D8%A7%D8%AF%D8%A9')
  })

  it('still serves the static routes when the database is down', async () => {
    db.on(/FROM blog_articles WHERE is_published=1/, () => { throw new Error('ECONNREFUSED') })
    const res = await request(app).get('/sitemap.xml')
    // A degraded sitemap beats a 500 — crawlers back off on repeated errors.
    expect(res.status).toBe(200)
    expect(res.text).toContain('<loc>https://gs.bmexpress.co/</loc>')
  })

  it('escapes XML-significant characters in generated URLs', async () => {
    db.on(/FROM blog_articles WHERE is_published=1/, [
      { slug: 'a&b', updated_at: null, created_at: new Date('2026-01-01') },
    ])
    const res = await request(app).get('/sitemap.xml')
    expect(res.text).not.toMatch(/<loc>[^<]*[^;]&[^a]/)
  })
})

describe('public API cache headers', () => {
  let app, db
  beforeEach(async () => { ({ app, db } = await loadApp()) })

  it('marks the near-static public endpoints as cacheable', async () => {
    db.on(/FROM services_config WHERE is_enabled=1/, [])
    db.on(/FROM blog_articles WHERE is_published=1 ORDER BY/, [])
    for (const path of ['/api/services', '/api/blogs']) {
      const res = await request(app).get(path)
      expect(res.status, path).toBe(200)
      expect(res.headers['cache-control'], path).toMatch(/max-age=300/)
    }
  })

  it('does not cache admin responses', async () => {
    db.on(/^UPDATE admin_sessions SET last_seen_at/, { affectedRows: 1 })
    db.on(/^SELECT COUNT\(\*\) AS total FROM form_requests/, [{ total: 0 }])
    db.on(/SELECT status, COUNT\(\*\) AS n/, [])
    const res = await request(app).get('/api/admin/orders').set('Authorization', 'Bearer x')
    expect(res.headers['cache-control']).toBeUndefined()
  })
})
