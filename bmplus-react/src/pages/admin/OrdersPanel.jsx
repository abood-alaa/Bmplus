/**
 * OrdersPanel.jsx — main orders management view. Features:
 *   • Status filter tabs with live counts per status
 *   • Free-text search across name / ID number / services
 *   • Checkbox column for bulk operations (delete or change status)
 *   • Per-row inline status dropdown + delete button
 *   • Click any row (or activate the name button — keyboard/SR accessible)
 *     to open the OrderDetail panel: a sticky sidebar at desktop widths, a
 *     modal at narrow widths (see useIsNarrow)
 *
 * OrderDetail is split into a thin chrome wrapper (sidebar vs modal) and
 * OrderDetailBody (the actual editable fields/pricing/invoice logic), so the
 * same body renders in either container without duplicating logic.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAdminAuth } from './AdminAuthContext'
import { S, STATUS_LABELS } from './adminStyles'
import { Modal, useConfirm, useToast, LoadingRow, EmptyState, Spinner, ServiceToggle } from './ui'
import { useIsNarrow } from './hooks'
import { generateInvoiceHTML, calcTotal, buildWhatsAppText } from './invoiceHelpers'

// Matches the server's default page size (ORDERS_PAGE_SIZE in server.js).
const PAGE_SIZE = 50

export default function OrdersPanel({ initialFilter }) {
  const { authFetch, token } = useAdminAuth()
  const confirm = useConfirm()
  const toast   = useToast()

  const [orders,     setOrders]     = useState([])
  const [total,      setTotal]      = useState(0)         // matching rows across all pages
  const [counts,     setCounts]     = useState({})        // { status: n } for the filter-tab badges
  const [offset,     setOffset]     = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [openId,     setOpenId]     = useState(null)      // ID of the order whose detail panel is open
  const [detail,     setDetail]     = useState(null)
  const [showNew,    setShowNew]    = useState(false)
  const [filter,     setFilter]     = useState(initialFilter || 'all')
  const [search,     setSearch]     = useState('')
  const [checkedIds, setCheckedIds] = useState(new Set()) // IDs selected for bulk operations
  const [bulkStatus, setBulkStatus] = useState('in_progress')

  // Status filtering and text search run server-side now that the list is paged —
  // filtering a single page client-side would only ever search within that page,
  // silently hiding matches that live further down the table.
  // The input is debounced so typing doesn't fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Any change to the filter or the search term invalidates the current page number.
  useEffect(() => { setOffset(0) }, [filter, debouncedSearch])

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
    if (filter !== 'all')  params.set('status', filter)
    if (debouncedSearch)   params.set('q', debouncedSearch)
    authFetch(`/api/admin/orders?${params}`)
      .then((r) => r.json())
      .then((d) => {
        // A 401 body is { error }, not the page shape — authFetch has already kicked
        // back to the login screen, so just render an empty table rather than crash.
        setOrders(Array.isArray(d?.orders) ? d.orders : [])
        setTotal(Number(d?.total) || 0)
        setCounts(d?.counts || {})
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [authFetch, offset, filter, debouncedSearch])

  useEffect(() => { load() }, [load])

  async function loadDetail(id) {
    const r = await authFetch(`/api/admin/orders/${id}`)
    setDetail(await r.json())
    setOpenId(id)
  }

  async function updateStatus(id, status) {
    await authFetch(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    load()
    if (openId === id) loadDetail(id)
  }

  async function deleteOrder(id) {
    if (!await confirm({ title: 'حذف الطلب', message: 'هل تريد حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.', danger: true, confirmLabel: 'حذف' })) return
    await authFetch(`/api/admin/orders/${id}`, { method: 'DELETE' })
    if (openId === id) { setOpenId(null); setDetail(null) }
    toast.success('تم حذف الطلب')
    load()
  }

  // Sends selected IDs to the bulk-delete endpoint then clears the selection.
  async function bulkDelete() {
    if (!checkedIds.size) return
    if (!await confirm({ title: 'حذف الطلبات المحددة', message: `هل تريد حذف ${checkedIds.size} طلب؟ لا يمكن التراجع عن هذا الإجراء.`, danger: true, confirmLabel: 'حذف الكل' })) return
    await authFetch('/api/admin/orders/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: [...checkedIds] }) })
    if (checkedIds.has(openId)) { setOpenId(null); setDetail(null) }
    toast.success(`تم حذف ${checkedIds.size} طلب`)
    setCheckedIds(new Set())
    load()
  }

  // Changes status for all selected orders at once.
  async function bulkUpdateStatus() {
    if (!checkedIds.size) return
    await authFetch('/api/admin/orders/bulk-status', { method: 'POST', body: JSON.stringify({ ids: [...checkedIds], status: bulkStatus }) })
    if (openId && checkedIds.has(openId)) loadDetail(openId)
    toast.success(`تم تحديث حالة ${checkedIds.size} طلب`)
    setCheckedIds(new Set())
    load()
  }

  function toggleCheck(id) {
    setCheckedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // `orders` is already the filtered/searched page from the server — no further
  // client-side narrowing. Select-all therefore covers the visible page only,
  // which is also what its label promises ("كل الطلبات الظاهرة").
  const allChecked = orders.length > 0 && orders.every((o) => checkedIds.has(o.id))
  function toggleAll() {
    allChecked ? setCheckedIds(new Set()) : setCheckedIds(new Set(orders.map((o) => o.id)))
  }

  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd   = Math.min(offset + PAGE_SIZE, total)
  const hasPrev   = offset > 0
  const hasNext   = offset + PAGE_SIZE < total

  return (
    <div style={S.content}>
      {/* Header row: title + filter tabs + new order button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={S.sectionHd}>الطلبات ({total})</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['all', 'new', 'in_progress', 'done'].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={S.btn(filter === f ? 'primary' : 'ghost')} aria-pressed={filter === f}>
              {f === 'all' ? 'الكل' : STATUS_LABELS[f]}
              {/* Badge counts come from the server's GROUP BY over the whole table —
                  counting the current page would under-report once paginated. */}
              {f !== 'all' && (
                <span style={{ marginRight: 6, background: 'rgba(0,0,0,.3)', borderRadius: 10, padding: '1px 7px', fontSize: '0.75rem' }}>
                  {counts[f] || 0}
                </span>
              )}
            </button>
          ))}
          <button style={S.btn('success')} onClick={() => setShowNew(true)}>+ طلب جديد</button>
        </div>
      </div>

      {/* Free-text search input */}
      <label htmlFor="orders-search" style={S.srOnly}>بحث في الطلبات</label>
      <input
        id="orders-search"
        style={{ ...S.input, marginBottom: 10, maxWidth: 380 }}
        placeholder="🔍 بحث بالاسم أو رقم الهوية أو الخدمة..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        type="search"
      />

      {/* Bulk action toolbar — only visible when at least one checkbox is checked */}
      {checkedIds.size > 0 && (
        <div style={{ background: '#0d2140', border: '1px solid #2d5a8e', borderRadius: 10, padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#93c5fd', fontWeight: 700, fontSize: '0.9rem' }}>✓ {checkedIds.size} طلب محدد</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="bulk-status-select" style={S.srOnly}>الحالة الجديدة للطلبات المحددة</label>
            <select id="bulk-status-select" style={{ ...S.input, width: 'auto', padding: '5px 10px', fontSize: '0.85rem' }} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button style={{ ...S.btn('default'), padding: '6px 14px' }} onClick={bulkUpdateStatus}>تغيير الحالة</button>
          </div>
          <button style={{ ...S.btn('danger'), padding: '6px 14px' }} onClick={bulkDelete}>🗑️ حذف المحدد</button>
          <button style={{ ...S.btn('ghost'), padding: '6px 14px', marginRight: 'auto' }} onClick={() => setCheckedIds(new Set())}>إلغاء</button>
        </div>
      )}

      {showNew && (
        <NewOrderForm onDone={() => { setShowNew(false); toast.success('تم إضافة الطلب'); load() }} onCancel={() => setShowNew(false)} />
      )}

      {/* Two-column layout at desktop widths; the detail panel becomes a modal at narrow widths (see OrderDetail) */}
      <OrdersLayout
        openId={openId}
        table={(
          <div style={S.card}>
            {loading ? (
              <LoadingRow />
            ) : orders.length === 0 ? (
              <EmptyState
                icon="📋"
                title={search ? 'لا توجد نتائج للبحث' : 'لا توجد طلبات'}
                subtitle={search ? 'جرّب كلمات بحث مختلفة' : 'ستظهر الطلبات الجديدة هنا فور استلامها'}
                action={!search && <button style={S.btn('success')} onClick={() => setShowNew(true)}>+ طلب جديد</button>}
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width: 36, textAlign: 'center' }}>
                        <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="تحديد كل الطلبات الظاهرة" style={{ cursor: 'pointer' }} />
                      </th>
                      {['#', 'الاسم', 'الخدمات', 'الحالة', 'التاريخ', 'إجراءات'].map((h) => <th key={h} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => loadDetail(o.id)}
                        style={{ cursor: 'pointer', background: openId === o.id ? '#122033' : checkedIds.has(o.id) ? '#0f1e30' : 'transparent' }}
                      >
                        {/* Checkbox cell: stopPropagation on the cell so clicking here doesn't open
                            the detail panel; the checkbox's own onChange toggles the selection. */}
                        <td style={{ ...S.td, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={checkedIds.has(o.id)} onChange={() => toggleCheck(o.id)} aria-label={`تحديد الطلب رقم ${o.id} — ${o.full_name}`} style={{ cursor: 'pointer' }} />
                        </td>
                        <td style={S.td}>{o.id}</td>
                        {/* Real <button> (not just the <tr>'s onClick) so opening the detail panel is
                            keyboard/screen-reader operable — the <tr> itself isn't given a role/tabIndex
                            since it already contains other real interactive children (checkbox, status
                            select, delete button), which would create conflicting AT semantics. */}
                        <td style={S.td}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); loadDetail(o.id) }} style={S.rowLinkBtn}>
                            {o.full_name}
                          </button>
                        </td>
                        <td style={{ ...S.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.services || '—'}</td>
                        <td style={S.td}><span style={S.badge(o.status)}>{STATUS_LABELS[o.status]}</span></td>
                        <td style={{ ...S.td, whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '0.82rem' }}>{o.created_at?.slice(0, 16)}</td>
                        {/* Action cells: stopPropagation so they don't trigger row click → detail open */}
                        <td style={S.td} onClick={(e) => e.stopPropagation()}>
                          <label htmlFor={`order-status-${o.id}`} style={S.srOnly}>حالة الطلب رقم {o.id}</label>
                          <select
                            id={`order-status-${o.id}`}
                            style={{ ...S.input, width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}
                            value={o.status}
                            onChange={(e) => updateStatus(o.id, e.target.value)}
                          >
                            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <button style={{ ...S.btn('danger'), marginRight: 6, padding: '4px 10px' }} onClick={() => deleteOrder(o.id)} aria-label={`حذف الطلب رقم ${o.id} — ${o.full_name}`}>حذف</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pager. Hidden when everything fits on one page, so the common
                small-dataset case looks exactly as it did before pagination. */}
            {!loading && total > PAGE_SIZE && (
              <nav
                aria-label="تنقل بين صفحات الطلبات"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid #1e3a5f', flexWrap: 'wrap' }}
              >
                <span style={{ color: '#94a3b8', fontSize: '0.82rem' }} aria-live="polite">
                  عرض {pageStart}–{pageEnd} من {total}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{ ...S.btn('ghost'), padding: '5px 12px', opacity: hasPrev ? 1 : 0.5 }}
                    onClick={() => setOffset((v) => Math.max(0, v - PAGE_SIZE))}
                    disabled={!hasPrev}
                  >
                    → السابق
                  </button>
                  <button
                    style={{ ...S.btn('ghost'), padding: '5px 12px', opacity: hasNext ? 1 : 0.5 }}
                    onClick={() => setOffset((v) => v + PAGE_SIZE)}
                    disabled={!hasNext}
                  >
                    التالي ←
                  </button>
                </div>
              </nav>
            )}
          </div>
        )}
        detail={openId && detail && (
          <OrderDetail
            key={detail.id}
            detail={detail}
            token={token}
            onClose={() => { setOpenId(null); setDetail(null) }}
            onUpdated={() => { load(); loadDetail(detail.id) }}
          />
        )}
      />
    </div>
  )
}

// Grid wrapper for the table + detail panel. At narrow widths the detail
// panel renders as a modal (see OrderDetail), so the grid collapses to one
// column instead of squeezing a 400px sidebar next to the table.
function OrdersLayout({ openId, table, detail }) {
  const isNarrow = useIsNarrow()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : (openId ? '1fr 400px' : '1fr'), gap: 16 }}>
      {table}
      {detail}
    </div>
  )
}

// ─── Order Detail ────────────────────────────────────────────────────────
// Thin chrome wrapper: sticky sidebar at desktop widths, modal at narrow
// widths — same OrderDetailBody either way.
function OrderDetail({ detail, token, onClose, onUpdated }) {
  const isNarrow = useIsNarrow()
  const titleNode = (
    <>
      طلب #{detail.id}&nbsp;
      <span style={{ ...S.badge(detail.status), marginRight: 4 }}>{STATUS_LABELS[detail.status]}</span>
    </>
  )

  if (isNarrow) {
    return (
      <Modal open onClose={onClose} title={titleNode} wide>
        <OrderDetailBody detail={detail} token={token} onUpdated={onUpdated} />
      </Modal>
    )
  }

  return (
    <div style={{ ...S.card, height: 'fit-content', position: 'sticky', top: 24 }}>
      <div style={S.cardHd}>
        <span style={S.cardTitle}>{titleNode}</span>
        <button style={S.btn('ghost')} onClick={onClose} aria-label="إغلاق تفاصيل الطلب">✕</button>
      </div>
      <div style={{ ...S.cardBody, fontSize: '0.88rem' }}>
        <OrderDetailBody detail={detail} token={token} onUpdated={onUpdated} />
      </div>
    </div>
  )
}

// Sticky/modal-agnostic body: editable client info, requested services,
// pricing/shipping/invoice export, and office notes. All fields are saved
// together in one PATCH call ("حفظ الكل").
function OrderDetailBody({ detail, token, onUpdated }) {
  const { authFetch } = useAdminAuth()
  const toast = useToast()

  const [editingInfo,  setEditingInfo]  = useState(false)
  const [fullName,     setFullName]     = useState(detail.full_name       || '')
  const [idNumber,     setIdNumber]     = useState(detail.id_number       || '')
  const [location,     setLocation]     = useState(detail.location        || '')
  const [whatsapp,     setWhatsapp]     = useState(detail.whatsapp_number || '')

  const [notes,        setNotes]        = useState(detail.notes           || '')
  const [price,        setPrice]        = useState(detail.price           || '')
  const [priceNote,    setPriceNote]    = useState(detail.price_note      || '')
  const [hasShipping,  setHasShipping]  = useState(!!detail.has_shipping)
  const [shippingCost, setShippingCost] = useState(detail.shipping_cost   || '')
  const [saving,       setSaving]       = useState(false)

  const total = calcTotal(price, hasShipping, shippingCost)

  async function saveAll() {
    setSaving(true)
    await authFetch(`/api/admin/orders/${detail.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        full_name: fullName, id_number: idNumber, location, whatsapp_number: whatsapp,
        notes, price, price_note: priceNote, has_shipping: hasShipping, shipping_cost: shippingCost,
      }),
    })
    setSaving(false)
    setEditingInfo(false)
    toast.success('تم حفظ التغييرات')
    onUpdated()
  }

  function openInvoice() {
    const merged  = { ...detail, full_name: fullName, id_number: idNumber, location, whatsapp_number: whatsapp }
    const apiBase = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin
    const html    = generateInvoiceHTML(merged, price, priceNote, hasShipping, shippingCost, token, apiBase)
    const win = window.open('', '_blank')
    if (!win) { toast.error('الرجاء السماح بالنوافذ المنبثقة (Popups) لهذا الموقع لعرض الفاتورة.'); return }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  function shareWhatsApp() {
    const merged = { ...detail, full_name: fullName, id_number: idNumber }
    window.open(`https://wa.me/?text=${buildWhatsAppText(merged, price, priceNote, hasShipping, shippingCost)}`, '_blank')
  }

  return (
    <>
      {/* ─── Client info with edit toggle ─── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 700 }}>بيانات الزبون</span>
          <button style={{ ...S.btn(editingInfo ? 'primary' : 'ghost'), padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => setEditingInfo((v) => !v)}>
            {editingInfo ? 'إغلاق' : '✏️ تعديل'}
          </button>
        </div>

        {editingInfo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label htmlFor="od-fullname" style={S.label}>الاسم الكامل</label>
              <input id="od-fullname" style={S.input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="od-idnumber" style={S.label}>رقم الهوية</label>
              <input id="od-idnumber" style={{ ...S.input, direction: 'ltr' }} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
            </div>
            <div>
              <label htmlFor="od-location" style={S.label}>الموقع</label>
              <input id="od-location" style={S.input} value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label htmlFor="od-whatsapp" style={S.label}>واتساب</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="od-whatsapp" style={{ ...S.input, direction: 'ltr', flex: 1 }} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ ...S.btn('success'), textDecoration: 'none', padding: '9px 12px', display: 'flex', alignItems: 'center' }} aria-label="فتح محادثة واتساب">💬</a>
              </div>
            </div>
          </div>
        ) : (
          <>
            <Row label="الاسم" value={fullName} />
            <Row label="الهوية" value={idNumber} ltr />
            <Row label="الموقع" value={location} />
            <Row label="واتساب" value={
              <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ color: '#34d399', textDecoration: 'none', direction: 'ltr' }}>{whatsapp}</a>
            } />
          </>
        )}
      </div>

      <Row label="التاريخ" value={detail.created_at?.slice(0, 16)} ltr />

      {detail.services?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: 6, fontWeight: 700 }}>الخدمات:</div>
          {detail.services.map((s) => (
            <div key={s.id} style={{ color: '#e2e8f0', padding: '4px 0', borderBottom: '1px solid #0d1b2e', fontSize: '0.85rem' }}>{s.service_name}</div>
          ))}
        </div>
      )}

      {detail.textFields?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: 6, fontWeight: 700 }}>معلومات إضافية:</div>
          {detail.textFields.map((tf) => <Row key={tf.id} label={tf.label} value={tf.value} />)}
        </div>
      )}

      {/* Filenames wrap rather than truncate: staff identify a document by its name,
          and ellipsis truncation in this RTL block clipped the *start* of Latin
          filenames — "novatrix-ad-square-logo.jpg" rendered as "uare-logo.jpg…",
          hiding the identifying half. <bdi> isolates the filename's direction so a
          Latin name reads correctly beside the Arabic label. */}
      {detail.files?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: 6, fontWeight: 700 }}>الملفات:</div>
          {detail.files.map((f) => (
            <a key={f.id} href={`/uploads/${f.file_path}`} target="_blank" rel="noreferrer" style={{ display: 'block', color: '#60a5fa', fontSize: '0.82rem', marginBottom: 4, textDecoration: 'none', overflowWrap: 'anywhere' }}>
              📎 {f.label} — <bdi>{f.file_name}</bdi>
            </a>
          ))}
        </div>
      )}

      {/* ─── Price, shipping & invoice export ─── */}
      <div style={{ marginTop: 16, background: '#0d1b2e', borderRadius: 10, padding: 14, border: '1px solid #FD552333' }}>
        <div style={{ color: '#FE9070', fontWeight: 700, fontSize: '0.88rem', marginBottom: 12 }}>💰 السعر والفاتورة</div>

        <label htmlFor="od-price" style={S.label}>سعر الخدمة (بالشيكل ₪)</label>
        <input id="od-price" style={{ ...S.input, marginBottom: 12, direction: 'ltr' }} type="number" min="0" step="0.5" placeholder="مثال: 150" value={price} onChange={(e) => setPrice(e.target.value)} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasShipping ? 10 : 12, padding: '8px 12px', background: '#0f1e30', borderRadius: 8, border: '1px solid #1e3a5f' }}>
          <ServiceToggle on={hasShipping} onClick={() => setHasShipping((v) => !v)} label="يوجد شحن" />
          <span style={{ color: hasShipping ? '#e2e8f0' : '#94a3b8', fontSize: '0.88rem', fontWeight: 600 }}>🚚 يوجد شحن</span>
          {hasShipping && shippingCost && (
            <span style={{ marginRight: 'auto', color: '#FE9070', fontSize: '0.82rem', fontWeight: 700 }}>{shippingCost} ₪</span>
          )}
        </div>

        {hasShipping && (
          <>
            <label htmlFor="od-shipping-cost" style={S.srOnly}>تكلفة الشحن</label>
            <input id="od-shipping-cost" style={{ ...S.input, marginBottom: 12, direction: 'ltr' }} type="number" min="0" step="0.5" placeholder="تكلفة الشحن بالشيكل" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
          </>
        )}

        <label htmlFor="od-price-note" style={S.label}>ملاحظة السعر (اختياري)</label>
        <input id="od-price-note" style={{ ...S.input, marginBottom: 10 }} placeholder="مثال: يشمل رسوم الاستخراج" value={priceNote} onChange={(e) => setPriceNote(e.target.value)} />

        {(price || (hasShipping && shippingCost)) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', background: '#0f2040', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>الإجمالي</span>
            <span style={{ color: '#FE9070', fontWeight: 800, fontSize: '1rem', direction: 'ltr' }}>{total} ₪</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btn('primary'), flex: 1 }} onClick={openInvoice}>🖨️ طباعة فاتورة</button>
          <button style={{ ...S.btn('success'), flex: 1 }} onClick={shareWhatsApp}>💬 واتساب</button>
        </div>
      </div>

      {/* Office notes + master save button */}
      <div style={{ marginTop: 12 }}>
        <label htmlFor="od-notes" style={S.label}>ملاحظات المكتب</label>
        <textarea id="od-notes" style={S.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        <button style={{ ...S.btn('default'), marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={saveAll} disabled={saving}>
          {saving ? <><Spinner size={14} /> جاري الحفظ...</> : '💾 حفظ الكل'}
        </button>
      </div>
    </>
  )
}

// Simple key-value display row used in the detail panel.
function Row({ label, value, ltr }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #0d1b2e', gap: 8 }}>
      <span style={{ color: '#94a3b8', fontSize: '0.82rem', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.88rem', direction: ltr ? 'ltr' : 'rtl' }}>{value}</span>
    </div>
  )
}

// ─── New Order Form ─────────────────────────────────────────────────────
// Manual order creation by the admin (for phone/walk-in orders). Services
// are entered as newline-separated text, split on submit.
function NewOrderForm({ onDone, onCancel }) {
  const { authFetch } = useAdminAuth()
  const [form, setForm] = useState({ fullName: '', idNumber: '', location: '', countryCode: '+970', whatsapp: '', notes: '', services: '', status: 'new' })
  const [err, setErr]   = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const r = await authFetch('/api/admin/orders', {
        method: 'POST',
        body: JSON.stringify({ ...form, services: form.services.split('\n').map((s) => s.trim()).filter(Boolean) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div style={{ ...S.card, marginBottom: 16 }}>
      <div style={S.cardHd}><span style={S.cardTitle}>إضافة طلب يدوي</span><button style={S.btn('ghost')} onClick={onCancel} aria-label="إلغاء إضافة الطلب">✕</button></div>
      <div style={S.cardBody}>
        {err && <div style={S.errMsg} role="alert">{err}</div>}
        <form onSubmit={submit}>
          <div style={{ ...S.row2, marginBottom: 12 }}>
            <div><label htmlFor="no-fullname" style={S.label}>الاسم الكامل *</label><input id="no-fullname" style={S.input} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required /></div>
            <div><label htmlFor="no-idnumber" style={S.label}>رقم الهوية *</label><input id="no-idnumber" style={S.input} value={form.idNumber} onChange={(e) => set('idNumber', e.target.value)} required /></div>
          </div>
          <div style={{ ...S.row2, marginBottom: 12 }}>
            <div><label htmlFor="no-location" style={S.label}>الموقع *</label><input id="no-location" style={S.input} value={form.location} onChange={(e) => set('location', e.target.value)} required /></div>
            <div><label htmlFor="no-whatsapp" style={S.label}>واتساب</label><input id="no-whatsapp" style={S.input} value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="no-services" style={S.label}>الخدمات (سطر لكل خدمة)</label>
            <textarea id="no-services" style={S.textarea} value={form.services} onChange={(e) => set('services', e.target.value)} rows={3} placeholder="مثال: استخراج شهادة تعليمية" />
          </div>
          <div style={{ ...S.row2, marginBottom: 12 }}>
            <div>
              <label htmlFor="no-status" style={S.label}>الحالة</label>
              <select id="no-status" style={S.input} value={form.status} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div><label htmlFor="no-notes" style={S.label}>ملاحظات</label><input id="no-notes" style={S.input} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={{ ...S.btn('primary'), display: 'flex', alignItems: 'center', gap: 8 }} disabled={busy}>{busy && <Spinner size={14} />} {busy ? 'جاري الحفظ...' : 'حفظ الطلب'}</button>
            <button type="button" style={S.btn('ghost')} onClick={onCancel}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  )
}
