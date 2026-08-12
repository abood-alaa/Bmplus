/**
 * invoiceHelpers.js — pure functions for building the printable/PDF invoice
 * and the WhatsApp share text. No React here — generateInvoiceHTML() builds
 * a self-contained HTML document string that's written into a fresh same-origin
 * tab via document.write() (see OrdersPanel.jsx's openInvoice()).
 *
 * Colors in the generated invoice template intentionally stay on the site's
 * light-theme brand gold (#FD5523 / #FD5523-derived usages already migrated
 * to #FD5523) — this is a separate light-background print document matching
 * the *public* site's theme, not the dark admin UI, so it is NOT part of the
 * adminStyles.js dark-theme color-token system.
 */

import { STATUS_LABELS } from './adminStyles'

// Escapes HTML-significant characters before interpolating order data into
// the raw HTML string built by generateInvoiceHTML() below. This is a
// required security control, not cosmetic: full_name, id_number, location,
// whatsapp_number and every service_name originate from the public,
// unauthenticated POST /api/submit endpoint (server.js), which validates
// only presence/length — NOT HTML safety. Without this, an attacker could
// submit an order containing a script/event-handler payload that executes
// when an admin opens the invoice (window.open('', '_blank') + document.write
// creates a same-origin tab, so injected script can read
// localStorage['adminToken'] directly) and again server-side if "Save PDF"
// is used (Puppeteer renders this same HTML in /api/admin/invoice/pdf).
// Mirrors server.js's esc() helper used for the equivalent
// order-notification email template.
export function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Returns base + shipping (or just base if shipping is off).
export function calcTotal(price, hasShipping, shippingCost) {
  const base     = parseFloat(price)        || 0
  const shipping = parseFloat(shippingCost) || 0
  return hasShipping ? base + shipping : base
}

// Generates a self-contained Arabic RTL HTML invoice as a string.
// Opened via a same-origin tab (window.open('', '_blank') + document.write) —
// no server round-trip needed just to view/print it.
// Both buttons call window.print(): the browser's native print dialog renders
// Arabic correctly and provides a "Save as PDF" option that preserves text
// (unlike html2canvas). @media print hides the tip bar so buttons never
// appear in the printed/saved PDF.
// adminToken and apiBase are embedded in the generated HTML so the "Save as
// PDF" button inside the blob-URL tab can call back to the server without
// needing React state. If the token has since expired (30-min sliding
// session), the save-PDF fetch below simply gets a 401 with the server's own
// Arabic "session expired" message, which flows into the same error banner —
// no special-casing needed here for that case.
// TODO: invoice template below uses placeholder address/domain — replace with real values before production
export function generateInvoiceHTML(detail, price, priceNote, hasShipping, shippingCost, adminToken = '', apiBase = '') {
  const date   = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
  const padded = String(detail.id).padStart(5, '0')
  const total        = calcTotal(price, hasShipping, shippingCost)
  const totalDisplay = total > 0 ? `${total} ₪` : 'لم يُحدد بعد'
  const serviceRows  = (detail.services || []).map((s, i) => `
    <tr>
      <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #e2e8f0;text-align:center;color:#94a3b8;width:40px;">${i + 1}</td>
      <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #e2e8f0;">${escHtml(s.service_name)}</td>
      <td style="padding:11px 16px;font-size:13px;border-bottom:1px solid #e2e8f0;text-align:left;direction:ltr;">${i === 0 && price ? escHtml(price) + ' ₪' : ''}</td>
    </tr>`).join('')
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>فاتورة #${detail.id} — بيت المقدس</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:15mm 20mm;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Cairo',Tahoma,Arial,sans-serif;background:#fff;color:#1e293b;direction:rtl;}
.page{max-width:720px;margin:0 auto;padding:40px;}
.tip{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 16px;margin-bottom:24px;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:8px;}
.pdf-err{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;border-radius:8px;padding:10px 16px;margin:0 0 24px;font-size:13px;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;border-bottom:3px solid #0f2040;padding-bottom:24px;}
.on{font-size:22px;font-weight:800;color:#0f2040;}.os{font-size:13px;color:#64748b;margin-top:4px;}
.it{font-size:28px;font-weight:800;color:#FD5523;letter-spacing:1px;text-align:left;}
.in{font-size:13px;color:#64748b;margin-top:4px;direction:ltr;text-align:left;}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px;}
.mb{background:#f8fafc;border-radius:10px;padding:16px;border:1px solid #e2e8f0;}
.mb h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:10px;font-weight:700;}
.mr{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;}
.ml{color:#64748b;}.mv{font-weight:600;color:#1e293b;}
table{width:100%;border-collapse:collapse;margin-bottom:24px;}
thead{background:#0f2040;}thead th{color:#FD5523;padding:12px 16px;font-size:13px;font-weight:700;text-align:right;}
tbody tr:nth-child(even){background:#f8fafc;}
.totals{margin-right:auto;width:280px;margin-bottom:32px;}
.tr{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;}
.grand{background:#0f2040;color:#fff;padding:12px 16px;border-radius:8px;border:none;margin-top:8px;}
.pnote{background:#fef9ec;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;color:#78350f;margin-bottom:24px;}
.footer{border-top:2px solid #e2e8f0;padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end;}
.sl{width:160px;border-top:1px solid #64748b;margin:40px auto 6px;}.slb{font-size:11px;color:#94a3b8;text-align:center;}
.wm{font-size:10px;color:#cbd5e1;text-align:center;margin-top:24px;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.tip{display:none!important;}.pdf-err{display:none!important;}}
</style>
<scr` + `ipt>
function showPdfError(msg) {
  var el = document.getElementById('pdf-err');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pdf-err';
    el.className = 'pdf-err';
    el.setAttribute('role', 'alert');
    var tip = document.querySelector('.tip');
    tip.parentNode.insertBefore(el, tip.nextSibling);
  }
  el.textContent = '⚠️ فشل حفظ PDF: ' + msg;
}
async function savePDF() {
  var btn = document.getElementById('pdf-btn');
  var orig = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ جاري الإنشاء...';
  try {
    var res = await fetch('${apiBase}/api/admin/invoice/pdf', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer ${adminToken}'},
      body: JSON.stringify({html: document.documentElement.outerHTML, filename: 'فاتورة-#${padded}.pdf'})
    });
    if (!res.ok) { var ct = res.headers.get('content-type')||''; var msg = ct.includes('json') ? (await res.json()).error : ('خطأ ' + res.status); throw new Error(msg || 'خطأ'); }
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'فاتورة-#${padded}.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  } catch(e) { showPdfError(e.message); }
  finally { btn.disabled = false; btn.textContent = orig; }
}
</scr` + `ipt>
</head><body><div class="page">
<div class="tip">
  <span>للطباعة أو حفظ الفاتورة كـ PDF:</span>
  <span style="display:flex;gap:8px;flex-shrink:0;">
    <button onclick="window.print()" style="background:#0f2040;color:#FD5523;border:none;border-radius:6px;padding:8px 18px;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:700;">🖨️ طباعة</button>
    <button id="pdf-btn" onclick="savePDF()" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:8px 18px;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:700;">💾 حفظ PDF</button>
  </span>
</div>
<div class="hdr">
  <div><div class="on">بيت المقدس للخدمات العامة</div><div class="os">سطح مرحبا، رام الله، فلسطين</div><div class="os">gs.bmexpress.co</div></div>
  <div><div class="it">فاتورة</div><div class="in">#${String(detail.id).padStart(5,'0')}</div><div class="in">${date}</div></div>
</div>
<div class="meta">
  <div class="mb"><h3>بيانات الزبون</h3>
    <div class="mr"><span class="ml">الاسم</span><span class="mv">${escHtml(detail.full_name)}</span></div>
    <div class="mr"><span class="ml">رقم الهوية</span><span class="mv" style="direction:ltr;">${escHtml(detail.id_number)}</span></div>
    <div class="mr"><span class="ml">الموقع</span><span class="mv">${escHtml(detail.location)}</span></div>
    <div class="mr"><span class="ml">واتساب</span><span class="mv" style="direction:ltr;">${escHtml(detail.whatsapp_number)}</span></div>
  </div>
  <div class="mb"><h3>بيانات الفاتورة</h3>
    <div class="mr"><span class="ml">رقم الفاتورة</span><span class="mv" style="direction:ltr;">#${String(detail.id).padStart(5,'0')}</span></div>
    <div class="mr"><span class="ml">التاريخ</span><span class="mv">${date}</span></div>
    <div class="mr"><span class="ml">الحالة</span><span class="mv">${STATUS_LABELS[detail.status]||'جديد'}</span></div>
  </div>
</div>
<div style="font-size:13px;font-weight:700;color:#0f2040;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">الخدمات المطلوبة</div>
<table><thead><tr><th style="text-align:center;width:40px;">#</th><th>الخدمة</th><th style="text-align:left;width:120px;">السعر</th></tr></thead>
<tbody>${serviceRows}</tbody></table>
${priceNote ? `<div class="pnote">📝 ملاحظة السعر: ${escHtml(priceNote)}</div>` : ''}
<div class="totals">
  <div class="tr"><span>سعر الخدمة</span><span style="direction:ltr;">${price ? escHtml(price) + ' ₪' : '—'}</span></div>
  ${hasShipping ? `<div class="tr"><span>🚚 تكلفة الشحن</span><span style="direction:ltr;">${shippingCost ? escHtml(shippingCost) + ' ₪' : '—'}</span></div>` : ''}
  <div class="tr grand"><span style="color:#FD5523;font-weight:700;font-size:15px;">الإجمالي المستحق</span><span style="font-weight:800;font-size:15px;">${totalDisplay}</span></div>
</div>
<div class="footer">
  <div><div class="sl"></div><div class="slb">توقيع المكتب</div></div>
  <div style="font-size:11px;color:#94a3b8;max-width:200px;text-align:center;line-height:1.6;">يُرجى الاحتفاظ بهذه الفاتورة كوثيقة للدفع</div>
  <div><div class="sl"></div><div class="slb">توقيع الزبون / الاستلام</div></div>
</div>
<div class="wm">بيت المقدس للخدمات العامة — gs.bmexpress.co</div>
</div></body></html>`
}

// Builds the WhatsApp share message text (URI-encoded).
export function buildWhatsAppText(detail, price, priceNote, hasShipping, shippingCost) {
  const services = (detail.services || []).map((s) => `• ${s.service_name}`).join('\n')
  const date     = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
  const total    = calcTotal(price, hasShipping, shippingCost)
  return encodeURIComponent(
    `🧾 *فاتورة — بيت المقدس للخدمات العامة*\n` +
    `─────────────────\n` +
    `👤 الاسم: ${detail.full_name}\n` +
    `🪪 الهوية: ${detail.id_number}\n` +
    `📍 الموقع: ${detail.location}\n` +
    `📅 التاريخ: ${date}\n` +
    `─────────────────\n` +
    `🛠️ الخدمات:\n${services}\n` +
    `─────────────────\n` +
    `💰 سعر الخدمة: ${price ? price + ' ₪' : 'سيتم الإخبار لاحقاً'}\n` +
    (hasShipping ? `🚚 تكلفة الشحن: ${shippingCost ? shippingCost + ' ₪' : '—'}\n` : '') +
    (hasShipping || price ? `📊 الإجمالي: ${total > 0 ? total + ' ₪' : '—'}\n` : '') +
    (priceNote ? `📝 ملاحظة: ${priceNote}\n` : '') +
    `─────────────────\n` +
    `🆔 رقم الطلب: #${detail.id}\n` +
    `للاستفسار: gs.bmexpress.co`,
  )
}
