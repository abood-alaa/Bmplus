/**
 * ServiceFields.jsx — Dynamic field renderer for a selected service.
 *
 * Receives a serviceKey (e.g. 'شهادة ثانوية عامة') and renders the fields
 * defined in serviceMap[serviceKey]. Calls onChange({ textFields, files })
 * whenever any field changes.
 *
 * stateRef stores field values as a plain object (not React state) so that
 * individual field changes don't trigger a full re-render of the list — only
 * the parent receives the aggregated update via emitChange().
 * This pattern avoids stale-closure issues common with multiple useState hooks.
 *
 * Field types (defined in data.js serviceMap):
 *   'text:Label'    → <input type="text">
 *   'select:Label'  → graduation year <select>
 *   'select2:Label' → blood type <select>
 *   anything else   → FileUploadField (image or PDF based on label keywords)
 */

import { useEffect, useRef } from 'react'
import { serviceMap, getGraduationYears, getBloodTypes, isFileAllowed, getFieldAccept } from '../lib/data'

export default function ServiceFields({ serviceKey, onChange }) {
  const reqs     = serviceKey ? (serviceMap[serviceKey] || []) : []
  const stateRef = useRef({ textFields: {}, files: {} })

  useEffect(() => {
    stateRef.current = { textFields: {}, files: {} }
    emitChange()
  }, [serviceKey])

  function emitChange() {
    const tf    = Object.entries(stateRef.current.textFields).filter(([, v]) => v).map(([label, value]) => ({ label, value }))
    const files = Object.values(stateRef.current.files).filter(Boolean)
    onChange({ textFields: tf, files })
  }

  if (!reqs.length) return null

  return (
    <div className="fields-container" id="dynamic-requirements">
      {reqs.map((req, i) => {
        if (req.startsWith('text:')) {
          const label = req.replace('text:', '')
          return (
            <div key={i}>
              <label className="dynamic-label">{label}</label>
              <input
                type="text"
                className="dynamic-text-field data-input"
                placeholder={label}
                onChange={e => { stateRef.current.textFields[label] = e.target.value.trim(); emitChange() }}
              />
            </div>
          )
        }

        if (req.startsWith('select:')) {
          const label = req.replace('select:', '')
          return (
            <div key={i}>
              <label className="dynamic-label">{label}</label>
              <div className="select-wrap">
                <select
                  className="field-select data-input"
                  defaultValue=""
                  onChange={e => { stateRef.current.textFields[label] = e.target.value; emitChange() }}
                >
                  <option value="" disabled>اختر سنة التخرج...</option>
                  {getGraduationYears().map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="select-arrow" aria-hidden="true">&#9660;</span>
              </div>
            </div>
          )
        }

        if (req.startsWith('select2:')) {
          const label = req.replace('select2:', '')
          return (
            <div key={i}>
              <label className="dynamic-label">{label}</label>
              <div className="select-wrap">
                <select
                  className="field-select data-input"
                  defaultValue=""
                  onChange={e => { stateRef.current.textFields[label] = e.target.value; emitChange() }}
                >
                  <option value="" disabled>اختر فصيلة الدم...</option>
                  {getBloodTypes().map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="select-arrow" aria-hidden="true">&#9660;</span>
              </div>
            </div>
          )
        }

        return (
          <FileUploadField
            key={i}
            label={req}
            onChange={file => {
              stateRef.current.files[req] = file ? { label: req, file } : null
              emitChange()
            }}
          />
        )
      })}
    </div>
  )
}

function FileUploadField({ label, onChange }) {
  const inputRef   = useRef()
  const nameRef    = useRef()
  const errRef     = useRef()
  const accept     = getFieldAccept(label)
  const isPDF      = accept === 'application/pdf'
  const hint       = isPDF ? 'اختر ملف PDF' : 'اختر صورة (JPG أو PNG)'

  return (
    <div className="file-upload-box">
      <span className="file-upload-label">{label}</span>
      <span className="file-upload-optional">اختياري</span>
      {/* Input covers the whole box — no onClick on parent needed (avoids double-open) */}
      <input
        ref={inputRef}
        type="file"
        className="service-file data-input"
        accept={accept}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
        onChange={e => {
          const file = e.target.files[0]
          if (errRef.current) errRef.current.textContent = ''
          if (!file) return
          // Client-side check is instant UX feedback only — the server independently
          // re-validates MIME type via magic bytes (see checkMagic() in server.js) and
          // is the real enforcement point.
          const check = isFileAllowed(file, label)
          if (!check.ok) {
            if (errRef.current) errRef.current.textContent = check.reason
            e.target.value = ''
            return
          }
          if (nameRef.current) nameRef.current.textContent = file.name
          onChange(file)
        }}
      />
      <div className="file-upload-trigger">
        <span className="file-upload-icon">📂</span>
        <span ref={nameRef} className="file-name-display">{hint}</span>
      </div>
      <span ref={errRef} className="file-upload-error" role="alert"></span>
    </div>
  )
}
