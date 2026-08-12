/**
 * Priority 2 — POST /api/submit: magic-byte validation and transaction rollback.
 *
 * This is the only unauthenticated write endpoint, it accepts file uploads, and
 * what it stores are real client identity documents. Two properties matter most:
 * a file whose contents don't match its declared MIME type never reaches disk,
 * and a failure part-way through leaves neither a half-written order nor an
 * orphaned file.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import { loadApp } from './helpers/app.js'

// Minimal buffers carrying the right leading bytes for each accepted type.
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.alloc(64, 1)])
const PNG  = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47]), Buffer.alloc(64, 1)])
const PDF  = Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(64, 1)])
// Declares image/jpeg but is actually a script — the attack this check exists for.
const FAKE_JPEG = Buffer.from('<?php system($_GET["c"]); ?>')

const VALID = {
  fullName: 'محمد أحمد',
  idNumber: '401234567',
  location: 'رام الله',
  whatsapp: '+970592112294',
  services: ['استخراج شهادة ميلاد'],
}

describe('POST /api/submit', () => {
  let app, db, writes

  beforeEach(async () => {
    ;({ app, db } = await loadApp())
    db.on(/^INSERT INTO form_requests/, { insertId: 77, affectedRows: 1 })
    db.on(/^INSERT INTO request_/, { insertId: 1, affectedRows: 1 })

    // Intercept disk writes so tests can assert on them without touching the real
    // uploads directory.
    writes = []
    vi.spyOn(fs, 'writeFileSync').mockImplementation((p, buf) => { writes.push({ path: String(p), buf }) })
    vi.spyOn(fs, 'unlinkSync').mockImplementation((p) => {
      const i = writes.findIndex(w => w.path === String(p))
      if (i >= 0) writes.splice(i, 1)
    })
  })

  function post() {
    return request(app).post('/api/submit').field('data', JSON.stringify(VALID))
  }

  it('accepts a valid submission and commits once', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ requestId: 77, success: true })
    expect(db.state.transactions).toEqual(['begin', 'commit', 'release'])
  })

  it('requires the mandatory fields', async () => {
    const res = await request(app)
      .post('/api/submit')
      .field('data', JSON.stringify({ ...VALID, fullName: '' }))
    expect(res.status).toBe(400)
    expect(db.find(/^INSERT INTO form_requests/)).toHaveLength(0)
  })

  it('rejects malformed JSON in the data field', async () => {
    const res = await request(app).post('/api/submit').field('data', 'not json{')
    expect(res.status).toBe(400)
  })

  it('enforces per-field length caps', async () => {
    const res = await request(app)
      .post('/api/submit')
      .field('data', JSON.stringify({ ...VALID, fullName: 'ا'.repeat(300) }))
    expect(res.status).toBe(400)
    expect(db.find(/^INSERT INTO form_requests/)).toHaveLength(0)
  })

  it('stores files whose magic bytes match their declared type', async () => {
    const res = await post()
      .attach('files', JPEG, { filename: 'id.jpg', contentType: 'image/jpeg' })
      .attach('files', PDF,  { filename: 'doc.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(200)
    expect(writes).toHaveLength(2)
    expect(db.find(/^INSERT INTO request_files/)).toHaveLength(2)
  })

  it('never writes a file whose contents contradict its MIME type', async () => {
    const res = await post()
      .attach('files', FAKE_JPEG, { filename: 'evil.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(200)          // the order itself still succeeds
    expect(writes).toHaveLength(0)         // but nothing reached disk
    expect(db.find(/^INSERT INTO request_files/)).toHaveLength(0)
  })

  it('reports rejected files back to the caller instead of dropping them silently', async () => {
    const res = await post()
      .attach('files', PNG,       { filename: 'good.png', contentType: 'image/png' })
      .attach('files', FAKE_JPEG, { filename: 'evil.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(200)
    // The customer must be able to tell that one attachment didn't make it.
    expect(res.body.rejectedFiles).toEqual(['evil.jpg'])
    expect(writes).toHaveLength(1)
  })

  it('gives stored files unguessable names', async () => {
    await post().attach('files', JPEG, { filename: 'id.jpg', contentType: 'image/jpeg' })
    // Uploads are served from a permanent, unauthenticated URL, so the filename is
    // the only thing protecting them: 16 random bytes, and never the original name.
    expect(writes[0].path).toMatch(/77_\d+_[a-f0-9]{32}\.jpg$/)
    expect(writes[0].path).not.toContain('id.jpg')
  })

  it('stores Arabic filenames as readable UTF-8, not latin1 mojibake', async () => {
    // multer decodes the multipart Content-Disposition filename as latin1, so
    // without the re-decode "هوية.jpg" is stored as "ÙÙÙØ©.jpg" and shown that
    // way to the admin. Almost every file this office receives is named in Arabic.
    await post().attach('files', JPEG, { filename: 'هوية.jpg', contentType: 'image/jpeg' })
    const [insert] = db.find(/^INSERT INTO request_files/)
    expect(insert.params[2]).toBe('هوية.jpg')
    expect(insert.params[2]).not.toContain('Ù')
  })

  it('reports a rejected Arabic filename readably too', async () => {
    const res = await post().attach('files', FAKE_JPEG, { filename: 'مزور.jpg', contentType: 'image/jpeg' })
    expect(res.body.rejectedFiles).toEqual(['مزور.jpg'])
  })

  it('leaves plain ASCII filenames untouched', async () => {
    await post().attach('files', PNG, { filename: 'passport-scan.png', contentType: 'image/png' })
    const [insert] = db.find(/^INSERT INTO request_files/)
    expect(insert.params[2]).toBe('passport-scan.png')
  })

  it('rejects a file type that is not on the whitelist', async () => {
    const res = await post()
      .attach('files', Buffer.from('MZ...'), { filename: 'x.exe', contentType: 'application/x-msdownload' })
    expect(res.status).toBe(400)
  })

  it('rolls back and leaves no order behind when a write fails mid-transaction', async () => {
    db.on(/^INSERT INTO request_services/, () => { throw new Error('deadlock') })
    const res = await post()
    expect(res.status).toBe(500)
    expect(db.state.transactions).toEqual(['begin', 'rollback', 'release'])
  })

  it('deletes files already written to disk when the transaction rolls back', async () => {
    // The failure lands after at least one file has been written — fs writes are
    // not covered by the DB rollback, so without explicit cleanup the document
    // would be stranded on disk with no row referencing it.
    db.on(/^INSERT INTO request_files/, () => { throw new Error('constraint violation') })
    const res = await post()
      .attach('files', JPEG, { filename: 'id.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(500)
    expect(db.state.transactions).toContain('rollback')
    expect(writes).toHaveLength(0) // written, then cleaned up
    expect(fs.unlinkSync).toHaveBeenCalled()
  })

  it('always releases the pooled connection, including on failure', async () => {
    db.on(/^INSERT INTO form_requests/, () => { throw new Error('boom') })
    await post()
    expect(db.connection.release).toHaveBeenCalled()
  })

  it('does not block the response on the notification email', async () => {
    // sendEmail() is fire-and-forget after commit: the order is already durable,
    // so a slow or unreachable SMTP host must not delay the customer's response.
    const res = await post()
    expect(res.status).toBe(200)
    expect(db.state.transactions).toEqual(['begin', 'commit', 'release'])
  })
})
