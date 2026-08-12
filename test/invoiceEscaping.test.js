/**
 * Priority 5 — escHtml() and generateInvoiceHTML().
 *
 * This guards the previously-Critical stored-XSS chain: every field on an
 * invoice (name, ID number, location, WhatsApp number, service names) arrives
 * from the public, unauthenticated POST /api/submit, which validates presence
 * and length but nothing about HTML safety. The invoice is then rendered into a
 * same-origin tab via document.write() — where injected script could read
 * localStorage['adminToken'] — and posted to the server for Puppeteer rendering.
 *
 * Pure functions, no DB or network: the cheapest test in the suite and the one
 * covering the highest-severity historical bug.
 */

import { describe, it, expect } from 'vitest'
import { escHtml, calcTotal, generateInvoiceHTML, buildWhatsAppText }
  from '../bmplus-react/src/pages/admin/invoiceHelpers.js'

const XSS = '<img src=x onerror="alert(document.cookie)">'

const ORDER = {
  id: 42,
  full_name: 'محمد أحمد',
  id_number: '401234567',
  location: 'رام الله',
  whatsapp_number: '+970592112294',
  status: 'new',
  services: [{ id: 1, service_name: 'استخراج شهادة ميلاد' }],
}

describe('escHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escHtml('<')).toBe('&lt;')
    expect(escHtml('>')).toBe('&gt;')
    expect(escHtml('"')).toBe('&quot;')
    expect(escHtml("'")).toBe('&#39;')
    expect(escHtml('&')).toBe('&amp;')
  })

  it('escapes the ampersand without double-escaping the entities it produces', () => {
    expect(escHtml('a & b')).toBe('a &amp; b')
    expect(escHtml('<&>')).toBe('&lt;&amp;&gt;')
  })

  it('neutralizes a script payload', () => {
    const out = escHtml(XSS)
    expect(out).not.toContain('<img')
    expect(out).not.toContain('onerror="')
    expect(out).toContain('&lt;img')
  })

  it('renders null and undefined as an empty string, not "null"/"undefined"', () => {
    expect(escHtml(null)).toBe('')
    expect(escHtml(undefined)).toBe('')
  })

  it('leaves Arabic text untouched', () => {
    expect(escHtml('استخراج شهادة ميلاد')).toBe('استخراج شهادة ميلاد')
  })

  it('coerces non-strings safely', () => {
    expect(escHtml(42)).toBe('42')
    expect(escHtml(0)).toBe('0')
  })
})

describe('generateInvoiceHTML — escaping at every interpolation point', () => {
  // Each customer-controlled field, injected one at a time so a single unescaped
  // interpolation can't hide behind another field's escaping.
  const FIELDS = ['full_name', 'id_number', 'location', 'whatsapp_number']

  for (const field of FIELDS) {
    it(`escapes ${field}`, () => {
      const html = generateInvoiceHTML({ ...ORDER, [field]: XSS }, '', '', false, '')
      expect(html).not.toContain(XSS)
      expect(html).not.toMatch(/<img src=x onerror/)
      expect(html).toContain('&lt;img src=x onerror=')
    })
  }

  it('escapes service names', () => {
    const html = generateInvoiceHTML(
      { ...ORDER, services: [{ id: 1, service_name: XSS }] }, '', '', false, '')
    expect(html).not.toContain(XSS)
    expect(html).toContain('&lt;img')
  })

  it('escapes the admin-entered price note', () => {
    const html = generateInvoiceHTML(ORDER, '100', XSS, false, '')
    expect(html).not.toContain(XSS)
  })

  it('escapes price and shipping cost', () => {
    const html = generateInvoiceHTML(ORDER, XSS, '', true, XSS)
    expect(html).not.toContain(XSS)
  })

  it('cannot be escaped out of via a closing tag in a customer field', () => {
    const breakout = '</td></tr></table><script>fetch("//evil")</script>'
    const html = generateInvoiceHTML({ ...ORDER, full_name: breakout }, '', '', false, '')
    expect(html).not.toContain('<script>fetch')
    expect(html).not.toContain('</td></tr></table><script>')
  })

  it('still renders the legitimate content', () => {
    const html = generateInvoiceHTML(ORDER, '150', 'يشمل الرسوم', true, '20')
    expect(html).toContain('محمد أحمد')
    expect(html).toContain('استخراج شهادة ميلاد')
    expect(html).toContain('بيت المقدس للخدمات العامة')
    expect(html).toContain('00042')       // zero-padded invoice number
    expect(html).toContain('170 ₪')        // 150 + 20
  })

  it('uses the current brand accent, not the pre-rebrand gold', () => {
    const html = generateInvoiceHTML(ORDER, '', '', false, '')
    expect(html).not.toContain('#c8a96e')
    expect(html).toContain('#FD5523')
  })
})

describe('calcTotal', () => {
  it('adds shipping only when shipping is enabled', () => {
    expect(calcTotal('100', true, '25')).toBe(125)
    expect(calcTotal('100', false, '25')).toBe(100)
  })

  it('treats blank and non-numeric input as zero rather than NaN', () => {
    expect(calcTotal('', false, '')).toBe(0)
    expect(calcTotal('abc', true, 'xyz')).toBe(0)
    expect(calcTotal(undefined, true, undefined)).toBe(0)
  })

  it('handles decimal amounts', () => {
    expect(calcTotal('99.5', true, '0.5')).toBe(100)
  })
})

describe('buildWhatsAppText', () => {
  it('URI-encodes the message so field content cannot break the wa.me URL', () => {
    const text = buildWhatsAppText({ ...ORDER, full_name: 'a&b=c' }, '100', '', false, '')
    expect(text).not.toContain('&b=c')
    expect(decodeURIComponent(text)).toContain('a&b=c')
  })

  it('includes the order number and services', () => {
    const text = decodeURIComponent(buildWhatsAppText(ORDER, '100', '', false, ''))
    expect(text).toContain('#42')
    expect(text).toContain('استخراج شهادة ميلاد')
  })
})
