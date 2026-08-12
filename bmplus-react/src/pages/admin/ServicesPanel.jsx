/**
 * ServicesPanel.jsx — tree view: primary → sub → branch (and primary → court
 * for court services). Each node has an enable/disable toggle and a delete
 * button. Changes here immediately affect what the public ServiceSelector
 * shows.
 *
 * Markup: nested <ul role="list">/<li role="listitem"> rather than plain
 * <div>s (role="list"/"listitem" work around a Safari VoiceOver bug where
 * `list-style: none` strips list semantics entirely). A full ARIA tree
 * widget (role="tree"/"treeitem", roving tabindex, aria-expanded) was
 * considered and deliberately not used — nothing here collapses/expands,
 * every node is always visible, so a plain list is the right level of
 * complexity. Revisit if this tree ever gains real collapse/expand behavior.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAdminAuth } from './AdminAuthContext'
import { S } from './adminStyles'
import { useConfirm, useToast, LoadingRow, EmptyState, Spinner, ServiceToggle } from './ui'
import { useIsNarrow } from './hooks'

const listReset = { listStyle: 'none', margin: 0, padding: 0 }

export default function ServicesPanel() {
  const { authFetch } = useAdminAuth()
  const confirm = useConfirm()
  const toast   = useToast()
  const isNarrow = useIsNarrow()

  const [services, setServices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)

  const load = useCallback(() => {
    authFetch('/api/admin/services').then((r) => r.json()).then((d) => { setServices(Array.isArray(d) ? d : []); setLoading(false) })
  }, [authFetch])

  useEffect(() => { load() }, [load])

  async function toggle(id, current) {
    await authFetch(`/api/admin/services/${id}`, { method: 'PATCH', body: JSON.stringify({ is_enabled: current ? 0 : 1 }) })
    load()
  }

  async function deleteService(id, label) {
    if (!await confirm({ title: 'حذف الخدمة', message: `هل تريد حذف "${label}"؟ سيتم حذف كل ما يتفرّع منها أيضاً.`, danger: true, confirmLabel: 'حذف' })) return
    await authFetch(`/api/admin/services/${id}`, { method: 'DELETE' })
    toast.success('تم حذف الخدمة')
    load()
  }

  const primary     = services.filter((s) => s.type === 'primary')
  const getChildren = (type, parentVal) => services.filter((s) => s.type === type && s.parent_value === parentVal)

  const subPad    = isNarrow ? '10px 16px 10px 24px' : '10px 20px 10px 40px'
  const branchPad = isNarrow ? '8px 16px 8px 40px'    : '8px 20px 8px 64px'

  return (
    <div style={S.content}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={S.sectionHd}>إدارة الخدمات</h2>
        <button style={S.btn('success')} onClick={() => setShowAdd(true)}>+ إضافة خدمة</button>
      </div>

      {showAdd && <AddServiceForm services={services} onDone={() => { setShowAdd(false); toast.success('تمت إضافة الخدمة'); load() }} onCancel={() => setShowAdd(false)} />}

      {loading ? (
        <LoadingRow />
      ) : primary.length === 0 ? (
        <div style={S.card}>
          <EmptyState icon="⚙️" title="لا توجد خدمات بعد" subtitle="أضف أول خدمة رئيسية ليظهر نموذج الطلب للزوار" action={<button style={S.btn('success')} onClick={() => setShowAdd(true)}>+ إضافة خدمة</button>} />
        </div>
      ) : (
        <ul style={listReset} role="list">
          {primary.map((p) => {
            const subs   = getChildren('sub', p.value)
            const courts = getChildren('court', p.value)
            return (
              <li key={p.id} role="listitem" style={{ ...S.card, marginBottom: 12 }}>
                {/* Primary service row */}
                <div style={{ ...S.cardHd, gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <ServiceToggle on={!!p.is_enabled} onClick={() => toggle(p.id, p.is_enabled)} label={p.label} />
                    <span style={{ color: p.is_enabled ? '#e2e8f0' : '#475569', fontWeight: 700 }}>{p.label}</span>
                    {!isNarrow && <span style={{ color: '#475569', fontSize: '0.78rem' }}>({p.value})</span>}
                  </div>
                  <button style={{ ...S.btn('danger'), padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => deleteService(p.id, p.label)} aria-label={`حذف ${p.label}`}>حذف</button>
                </div>

                {(subs.length > 0 || courts.length > 0) && (
                  <ul style={listReset} role="list">
                    {/* Sub-services (one level deeper, indented) */}
                    {subs.map((sub) => {
                      const branches = getChildren('branch', sub.value)
                      return (
                        <li key={sub.id} role="listitem" style={{ borderTop: '1px solid #0d1b2e' }}>
                          <div style={{ padding: subPad, display: 'flex', alignItems: 'center', gap: 10, background: '#0f1e30', flexWrap: 'wrap' }}>
                            <ServiceToggle on={!!sub.is_enabled} onClick={() => toggle(sub.id, sub.is_enabled)} label={sub.label} />
                            <span style={{ color: sub.is_enabled ? '#cbd5e1' : '#475569' }}>↳ {sub.label}</span>
                            {!isNarrow && <span style={{ color: '#475569', fontSize: '0.78rem' }}>({sub.value})</span>}
                            <div style={{ marginRight: 'auto' }}>
                              <button style={{ ...S.btn('danger'), padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => deleteService(sub.id, sub.label)} aria-label={`حذف ${sub.label}`}>حذف</button>
                            </div>
                          </div>

                          {branches.length > 0 && (
                            <ul style={listReset} role="list">
                              {branches.map((br) => (
                                <li key={br.id} role="listitem" style={{ padding: branchPad, display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #0a1520', background: '#0c1928', flexWrap: 'wrap' }}>
                                  <ServiceToggle on={!!br.is_enabled} onClick={() => toggle(br.id, br.is_enabled)} label={br.label} />
                                  <span style={{ color: br.is_enabled ? '#94a3b8' : '#334155', fontSize: '0.88rem' }}>⤷ {br.label}</span>
                                  <div style={{ marginRight: 'auto' }}>
                                    <button style={{ ...S.btn('danger'), padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => deleteService(br.id, br.label)} aria-label={`حذف ${br.label}`}>حذف</button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      )
                    })}

                    {/* Court sub-services (same level as sub, but under court primary) */}
                    {courts.map((cs) => (
                      <li key={cs.id} role="listitem" style={{ padding: subPad, display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #0d1b2e', background: '#0f1e30', flexWrap: 'wrap' }}>
                        <ServiceToggle on={!!cs.is_enabled} onClick={() => toggle(cs.id, cs.is_enabled)} label={cs.label} />
                        <span style={{ color: cs.is_enabled ? '#cbd5e1' : '#475569' }}>↳ {cs.label}</span>
                        <div style={{ marginRight: 'auto' }}>
                          <button style={{ ...S.btn('danger'), padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => deleteService(cs.id, cs.label)} aria-label={`حذف ${cs.label}`}>حذف</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Add Service Form ───────────────────────────────────────────────────
// Inline card form for adding a new service node. Type dropdown controls
// which parent options appear (sub needs a primary parent, etc).
function AddServiceForm({ services, onDone, onCancel }) {
  const { authFetch } = useAdminAuth()
  const [form, setForm] = useState({ type: 'primary', parent_value: '', value: '', label: '' })
  const [err, setErr]   = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const parents = services.filter((s) => {
    if (form.type === 'sub')    return s.type === 'primary'
    if (form.type === 'branch') return s.type === 'sub'
    if (form.type === 'court')  return s.type === 'primary'
    return false
  })

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const r = await authFetch('/api/admin/services', { method: 'POST', body: JSON.stringify(form) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div style={{ ...S.card, marginBottom: 16 }}>
      <div style={S.cardHd}><span style={S.cardTitle}>إضافة خدمة</span><button style={S.btn('ghost')} onClick={onCancel} aria-label="إلغاء إضافة الخدمة">✕</button></div>
      <div style={S.cardBody}>
        {err && <div style={S.errMsg} role="alert">{err}</div>}
        <form onSubmit={submit}>
          <div style={{ ...S.row2, marginBottom: 12 }}>
            <div>
              <label htmlFor="as-type" style={S.label}>نوع الخدمة</label>
              <select id="as-type" style={S.input} value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="primary">رئيسية</option>
                <option value="sub">فرعية</option>
                <option value="branch">فرع</option>
                <option value="court">خدمة محكمة</option>
              </select>
            </div>
            {form.type !== 'primary' && (
              <div>
                <label htmlFor="as-parent" style={S.label}>الخدمة الأب</label>
                <select id="as-parent" style={S.input} value={form.parent_value} onChange={(e) => set('parent_value', e.target.value)} required>
                  <option value="">اختر...</option>
                  {parents.map((p) => <option key={p.id} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ ...S.row2, marginBottom: 12 }}>
            <div>
              <label htmlFor="as-label" style={S.label}>الاسم (للعرض)</label>
              <input id="as-label" style={S.input} value={form.label} onChange={(e) => { set('label', e.target.value); if (!form.value) set('value', e.target.value) }} required />
            </div>
            <div>
              <label htmlFor="as-value" style={S.label}>المعرّف (value)</label>
              <input id="as-value" style={S.input} value={form.value} onChange={(e) => set('value', e.target.value)} required />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={{ ...S.btn('primary'), display: 'flex', alignItems: 'center', gap: 8 }} disabled={busy}>{busy && <Spinner size={14} />} {busy ? 'جاري الحفظ...' : 'إضافة'}</button>
            <button type="button" style={S.btn('ghost')} onClick={onCancel}>إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  )
}
