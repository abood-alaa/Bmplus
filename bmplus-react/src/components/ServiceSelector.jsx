/**
 * ServiceSelector.jsx — Multi-level service picker + extra service blocks.
 *
 * Hierarchy:
 *   Primary → (شهادة) Sub → (شهادة ثانوية عامة) Branch
 *   Primary → (معاملات المحمكة الشرعية) Court service
 *   All other primaries have no sub-levels.
 *
 * Key design decisions:
 *   - DEFAULT_* lists are hardcoded and filtered at runtime against /api/services
 *     (which returns only enabled entries). This means the component works even if
 *     the server is briefly unreachable — it falls back to showing all services.
 *
 *   - getEffectiveKey() always returns the subService value (e.g. 'شهادة ثانوية عامة'),
 *     NEVER the branch. This is critical: ServiceFields looks up serviceMap[key],
 *     and the map is keyed by subService. If we returned the branch ('علمي'),
 *     the photo and year fields would disappear when a branch is selected.
 *
 *   - buildServices() collects all three levels (primary label, subService, branch)
 *     into the services[] array so all of them are stored in the DB and shown in
 *     the admin panel and email.
 *
 *   - The "add extra service" button lets users request multiple services in one form.
 *     Each extra is an independent ExtraServiceBlock with its own state.
 */

import { useState, useEffect } from 'react'
import ServiceFields from './ServiceFields'

// Hardcoded defaults — filtered against server-enabled list
const DEFAULT_PRIMARY = [
  { value: 'شهادة',                          label: 'استخراج شهادة تعليمية' },
  { value: 'شهادة ميلاد',                    label: 'استخراج شهادة ميلاد' },
  { value: 'شهادة وفاة',                     label: 'استخراج شهادة وفاة' },
  { value: 'شهادة زواج',                     label: 'استخراج شهادة زواج' },
  { value: 'معاملات لم الشمل',               label: 'معاملات لم الشمل' },
  { value: 'جواز سفر للخارج',               label: 'اصدار جواز سفر' },
  { value: 'بيان العائلي',                   label: 'استخراج بيان عائلي' },
  { value: 'حسن سيره وسلوك',                label: 'استخراج شهادة حسن سيرة وسلوك' },
  { value: 'سليب الهوية',                    label: 'استخراج سليب الهوية' },
  { value: 'تغيير الحالة الاجتماعية',        label: 'تغيير الحالة الاجتماعية' },
  { value: 'معاملات المحمكة الشرعية',        label: 'معاملات المحمكة الشرعية' },
  { value: 'عدم المحكومية',                  label: 'عدم المحكومية' },
  { value: 'تصديق وكالات خاصه',             label: 'تصديق وكالات خاصة' },
  { value: 'خلو الامراض',                    label: 'خلو الأمراض' },
  { value: 'رخصة سواقة رام الله',           label: 'رخصة سواقة رام الله' },
  { value: 'أفادة رخصة',                    label: 'إفادة رخصة' },
  { value: 'رخصة دولية',                     label: 'رخصة دولية' },
  { value: 'استلام مزاولات من صحة',          label: 'استلام مزاولات من صحة' },
  { value: 'تصديق الخارجية بدون الاستخراج', label: 'تصديق الخارجية بدون الاستخراج' },
  { value: 'ترجمات قانونية معتمدة',          label: 'ترجمات قانونية معتمدة' },
  { value: 'ادخال ملفات لجميع السفارات',    label: 'ادخال ملفات لجميع السفارات' },
  { value: 'بريد دولي ومحلي',               label: 'بريد دولي ومحلي' },
]

const DEFAULT_SUBS = [
  { value: 'شهادة ثانوية عامة', label: 'شهادة ثانوية عامة' },
  { value: 'شهادة كرتون',       label: 'شهادة كرتون' },
  { value: 'شهادة مدرسية',      label: 'شهادة مدرسية' },
  { value: 'شهادة جامعية',      label: 'شهادة جامعية' },
]

const DEFAULT_BRANCHES = ['علمي', 'أدبي', 'ريادي', 'صناعي', 'شرعي']

const DEFAULT_COURT = [
  { value: 'استخراج عقد زواج',     label: 'استخراج عقد زواج' },
  { value: 'تصديق حصر الإرث',      label: 'تصديق حصر الإرث' },
  { value: 'معاملات كتب الكتاب',   label: 'معاملات كتب الكتاب' },
  { value: 'معاملات حجة العزوبية', label: 'معاملات حجة العزوبية' },
  { value: 'معاملات الطلاق',       label: 'معاملات الطلاق' },
]

export default function ServiceSelector({ onChange }) {
  const [primary,       setPrimary]       = useState('')
  const [subService,    setSubService]    = useState('')
  const [branch,        setBranch]        = useState('')
  const [court,         setCourt]         = useState('')
  const [extras,        setExtras]        = useState([])
  const [primaryFields, setPrimaryFields] = useState({ textFields: [], files: [] })
  const [extraFields,   setExtraFields]   = useState({})

  // Live-filter lists from the server (falls back to defaults if unavailable)
  const [enabledValues, setEnabledValues] = useState(null)

  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json())
      .then(data => setEnabledValues(new Set(data.map(s => s.value))))
      .catch(() => {})
  }, [])

  function allowed(list) {
    if (!enabledValues) return list
    return list.filter(s => enabledValues.has(typeof s === 'string' ? s : s.value))
  }

  const PRIMARY_SERVICES = allowed(DEFAULT_PRIMARY)
  const SUB_SERVICES     = allowed(DEFAULT_SUBS)
  const BRANCHES         = allowed(DEFAULT_BRANCHES)
  const COURT_SERVICES   = allowed(DEFAULT_COURT)

  // effectiveKey drives ServiceFields — always 'شهادة ثانوية عامة' regardless of branch
  function getEffectiveKey() {
    if (primary === 'شهادة') return subService
    if (primary === 'معاملات المحمكة الشرعية') return court
    return primary
  }

  // Build the services list sent to DB/email: include all three levels when applicable
  function buildServices(p, s, b, c, ex) {
    const list = []
    if (p === 'شهادة') {
      const pl = DEFAULT_PRIMARY.find(x => x.value === p)?.label || p
      list.push(pl)
      if (s) list.push(s)
      if (b) list.push(b)
    } else if (p === 'معاملات المحمكة الشرعية') {
      const pl = DEFAULT_PRIMARY.find(x => x.value === p)?.label || p
      list.push(pl)
      if (c) list.push(c)
    } else if (p) {
      const pl = DEFAULT_PRIMARY.find(x => x.value === p)?.label || p
      list.push(pl)
    }
    ex.forEach(e => { if (e.key) list.push(e.key) })
    return list.filter(Boolean)
  }

  function emitAll(p, s, b, c, ex, pf, ef) {
    const services    = buildServices(p, s, b, c, ex)
    const textFields  = [...(pf.textFields || []), ...ex.flatMap(e => ef[e.id]?.textFields || [])]
    const files       = [...(pf.files || []),      ...ex.flatMap(e => ef[e.id]?.files || [])]
    onChange({ services, textFields, files })
  }

  function handlePrimary(val) {
    setPrimary(val); setSubService(''); setBranch(''); setCourt('')
    setPrimaryFields({ textFields: [], files: [] })
    emitAll(val, '', '', '', extras, { textFields: [], files: [] }, extraFields)
  }

  function handleSub(val) {
    setSubService(val); setBranch('')
    emitAll(primary, val, '', court, extras, primaryFields, extraFields)
  }

  function handleBranch(val) {
    setBranch(val)
    emitAll(primary, subService, val, court, extras, primaryFields, extraFields)
  }

  function handleCourt(val) {
    setCourt(val)
    emitAll(primary, subService, branch, val, extras, primaryFields, extraFields)
  }

  function handlePrimaryFields(fields) {
    setPrimaryFields(fields)
    emitAll(primary, subService, branch, court, extras, fields, extraFields)
  }

  function addExtra() {
    const id = Date.now()
    const next = [...extras, { id, key: '' }]
    setExtras(next)
    emitAll(primary, subService, branch, court, next, primaryFields, extraFields)
  }

  function removeExtra(id) {
    const next = extras.filter(e => e.id !== id)
    const ef2  = { ...extraFields }; delete ef2[id]
    setExtras(next); setExtraFields(ef2)
    emitAll(primary, subService, branch, court, next, primaryFields, ef2)
  }

  function setExtraKey(id, key) {
    const next = extras.map(e => e.id === id ? { ...e, key } : e)
    setExtras(next)
    emitAll(primary, subService, branch, court, next, primaryFields, extraFields)
  }

  function handleExtraFields(id, fields) {
    const ef2 = { ...extraFields, [id]: fields }
    setExtraFields(ef2)
    emitAll(primary, subService, branch, court, extras, primaryFields, ef2)
  }

  const effectiveKey = getEffectiveKey()
  const showFields   = !!effectiveKey

  return (
    <>
      <div className="field-group">
        <label className="field-label" htmlFor="wa-service">اختر الخدمة</label>
        <div className="select-wrap">
          <select id="wa-service" className="field-select" value={primary} onChange={e => handlePrimary(e.target.value)}>
            <option value="" disabled>تصفح القائمة واختر خدمتك...</option>
            {PRIMARY_SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <span className="select-arrow" aria-hidden="true">&#9660;</span>
        </div>
      </div>

      {primary === 'شهادة' && (
        <div className="field-group">
          <label className="field-label" htmlFor="wa-sub-service">حدد نوع الشهادة</label>
          <div className="select-wrap">
            <select id="wa-sub-service" className="field-select field-select-gold" value={subService} onChange={e => handleSub(e.target.value)}>
              <option value="" disabled>اختر نوع الشهادة...</option>
              {SUB_SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="select-arrow" aria-hidden="true">&#9660;</span>
          </div>
        </div>
      )}

      {primary === 'شهادة' && subService === 'شهادة ثانوية عامة' && (
        <div className="field-group">
          <label className="field-label" htmlFor="wa-branch">الفرع</label>
          <div className="select-wrap">
            <select id="wa-branch" className="field-select field-select-gold" value={branch} onChange={e => handleBranch(e.target.value)}>
              <option value="" disabled>اختر الفرع...</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <span className="select-arrow" aria-hidden="true">&#9660;</span>
          </div>
        </div>
      )}

      {primary === 'معاملات المحمكة الشرعية' && (
        <div className="field-group">
          <label className="field-label" htmlFor="wa-court">الخدمة المطلوبة:</label>
          <div className="select-wrap">
            <select id="wa-court" className="field-select field-select-gold" value={court} onChange={e => handleCourt(e.target.value)}>
              <option value="" disabled>اختر الخدمة...</option>
              {COURT_SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="select-arrow" aria-hidden="true">&#9660;</span>
          </div>
        </div>
      )}

      {showFields && <ServiceFields serviceKey={effectiveKey} onChange={handlePrimaryFields} />}

      {extras.map((extra, idx) => (
        <ExtraServiceBlock
          key={extra.id}
          index={idx + 1}
          extra={extra}
          primaryServices={PRIMARY_SERVICES}
          subServices={SUB_SERVICES}
          branches={BRANCHES}
          courtServices={COURT_SERVICES}
          onRemove={() => removeExtra(extra.id)}
          onKeyChange={key => setExtraKey(extra.id, key)}
          onFieldsChange={fields => handleExtraFields(extra.id, fields)}
        />
      ))}

      {showFields && (
        <div className="add-service-wrap">
          <button type="button" className="add-svc-btn" onClick={addExtra}>
            <span>＋</span> اضافة خدمة اخرى
          </button>
        </div>
      )}
    </>
  )
}

function ExtraServiceBlock({ index, extra, primaryServices, subServices, branches, courtServices, onRemove, onKeyChange, onFieldsChange }) {
  const [rawPrimary, setRawPrimary] = useState('')

  function handlePrimaryChange(val) {
    setRawPrimary(val)
    if (val === 'شهادة' || val === 'معاملات المحمكة الشرعية') {
      onKeyChange('')
    } else {
      onKeyChange(val)
    }
  }

  return (
    <div className="extra-service-block">
      <div className="extra-service-header">
        <span className="extra-service-label">خدمة اضافية {index}</span>
        <button type="button" className="remove-service-btn" onClick={onRemove}>&#x2715; حذف</button>
      </div>
      <div className="field-group">
        <label className="field-label">اختر الخدمة</label>
        <div className="select-wrap">
          <select className="field-select" value={rawPrimary} onChange={e => handlePrimaryChange(e.target.value)}>
            <option value="" disabled>تصفح القائمة واختر خدمتك...</option>
            {primaryServices.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <span className="select-arrow">&#9660;</span>
        </div>
      </div>

      <ExtraSubFields
        rawPrimary={rawPrimary}
        subServices={subServices}
        branches={branches}
        courtServices={courtServices}
        onEffectiveKey={onKeyChange}
        onFieldsChange={onFieldsChange}
      />
    </div>
  )
}

function ExtraSubFields({ rawPrimary, subServices, branches, courtServices, onEffectiveKey, onFieldsChange }) {
  const [sub, setSub]       = useState('')
  const [branch, setBranch] = useState('')
  const [court, setCourt]   = useState('')

  function getEff(s, b, c) {
    if (rawPrimary === 'شهادة') return s  // always return subService, not branch
    if (rawPrimary === 'معاملات المحمكة الشرعية') return c
    return rawPrimary
  }

  if (!rawPrimary) return null

  if (rawPrimary === 'شهادة') {
    return (
      <>
        <div className="field-group" style={{ marginTop: '1rem' }}>
          <label className="field-label">حدد نوع الشهادة</label>
          <div className="select-wrap">
            <select className="field-select field-select-gold" value={sub} onChange={e => {
              setSub(e.target.value); setBranch('')
              onEffectiveKey(getEff(e.target.value, '', court))
            }}>
              <option value="" disabled>اختر نوع الشهادة...</option>
              {subServices.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span className="select-arrow">&#9660;</span>
          </div>
        </div>

        {sub === 'شهادة ثانوية عامة' && (
          <div className="field-group" style={{ marginTop: '1rem' }}>
            <label className="field-label">الفرع</label>
            <div className="select-wrap">
              <select className="field-select field-select-gold" value={branch} onChange={e => {
                setBranch(e.target.value)
                // keep effectiveKey as sub (not branch) so fields stay visible
              }}>
                <option value="" disabled>اختر الفرع...</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <span className="select-arrow">&#9660;</span>
            </div>
          </div>
        )}

        {sub && <ServiceFields serviceKey={sub} onChange={onFieldsChange} />}
      </>
    )
  }

  if (rawPrimary === 'معاملات المحمكة الشرعية') {
    return (
      <div className="field-group" style={{ marginTop: '1rem' }}>
        <label className="field-label">الخدمة المطلوبة</label>
        <div className="select-wrap">
          <select className="field-select field-select-gold" value={court} onChange={e => {
            setCourt(e.target.value); onEffectiveKey(e.target.value)
          }}>
            <option value="" disabled>اختر الخدمة...</option>
            {courtServices.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <span className="select-arrow">&#9660;</span>
        </div>
        {court && <ServiceFields serviceKey={court} onChange={onFieldsChange} />}
      </div>
    )
  }

  return <ServiceFields serviceKey={rawPrimary} onChange={onFieldsChange} />
}
