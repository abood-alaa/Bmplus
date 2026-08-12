/**
 * ui.jsx — shared UI primitives for the admin panel: toasts, a confirm
 * dialog, a generic modal, a spinner, and an empty-state block.
 *
 * These replace native `confirm()`/`alert()` calls and the old static
 * inline error boxes used for transient feedback throughout the old
 * single-file AdminPage.jsx.
 */

import { createContext, useContext, useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { S } from './adminStyles'

// ─── Toasts ──────────────────────────────────────────────────────────────
// Transient success/error/info feedback. role="status" + aria-live="polite"
// for success/info (doesn't interrupt whatever the screen reader is already
// announcing); role="alert" (implicitly assertive) for errors, since a
// failed action is worth interrupting for. Always manually dismissible too
// (not just auto-timeout) — a screen-reader or slow-reading user shouldn't
// lose the message just because a timer fired.
const ToastContext = createContext(null)

function ToastItem({ toast, onClose }) {
  const isError = toast.type === 'error'
  return (
    <div style={S.toast(toast.type)} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'}>
      <span aria-hidden="true">{toast.type === 'success' ? '✅' : isError ? '⚠️' : 'ℹ️'}</span>
      <span>{toast.message}</span>
      <button type="button" onClick={onClose} style={S.toastCloseBtn} aria-label="إغلاق الإشعار">✕</button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]) // {id, type, message}

  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const push = useCallback((message, type, duration) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, type }])
    if (duration > 0) setTimeout(() => remove(id), duration)
    return id
  }, [remove])

  const toast = useMemo(() => ({
    success: (m, d = 4000) => push(m, 'success', d),
    error:   (m, d = 6000) => push(m, 'error', d),
    info:    (m, d = 4500) => push(m, 'info', d),
  }), [push])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={S.toastContainer}>
        {toasts.map((t) => <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />)}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ─── Generic modal (focus-trapped, portal-rendered) ───────────────────────
// role="dialog" + aria-modal="true"; traps Tab/Shift+Tab within the dialog's
// focusable elements; Escape closes; focus moves into the dialog on open and
// is restored to whatever triggered it on close. Tab order inside the trap
// follows DOM order same as anywhere else on the web platform — the RTL
// `direction: rtl` on the dialog only affects visual layout, not focus
// traversal order, so no special-casing is needed here for RTL.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, children, footer, wide, labelledBy }) {
  const cardRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    const card = cardRef.current
    const focusables = card ? card.querySelectorAll(FOCUSABLE_SELECTOR) : []
    ;(focusables[0] || card)?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab' || !card) return
      const items = card.querySelectorAll(FOCUSABLE_SELECTOR)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = ''
      restoreFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div style={S.modalOverlay} onMouseDown={onClose}>
      <div
        ref={cardRef}
        style={S.modalCard(wide)}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || titleId}
        tabIndex={-1}
      >
        <div style={S.modalHd}>
          <span id={titleId} style={S.cardTitle}>{title}</span>
          <button type="button" style={S.btn('ghost')} onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        <div style={S.modalBody}>{children}</div>
        {footer && <div style={S.modalFooter}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ─── Confirm dialog (promise-based, replaces native confirm()) ───────────
//   const ok = await confirm({ title, message, danger, confirmLabel })
//   if (!ok) return
// Focus defaults to Cancel (the safer action) rather than Confirm, so an
// accidental Enter/Space keypress right after the dialog opens can't
// trigger a destructive action — this matters most for the `danger` cases
// (delete order/article/service), which is most of this dialog's callers.
const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null) // { title, message, danger, confirmLabel, resolve }
  const cancelBtnRef = useRef(null)

  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), [])
  const settle = useCallback((result) => { state.resolve(result); setState(null) }, [state])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          open
          onClose={() => settle(false)}
          title={state.title || 'تأكيد'}
          footer={(
            <>
              <button ref={cancelBtnRef} type="button" style={S.btn('ghost')} onClick={() => settle(false)}>إلغاء</button>
              <button type="button" style={S.btn(state.danger ? 'danger' : 'primary')} onClick={() => settle(true)}>{state.confirmLabel || 'تأكيد'}</button>
            </>
          )}
        >
          {state.message}
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

// ─── Spinner ───────────────────────────────────────────────────────────
export function Spinner({ size = 16 }) {
  return <span style={S.spinner(size)} aria-hidden="true" />
}

// ─── Empty state ─────────────────────────────────────────────────────────
export function EmptyState({ icon = '📭', title, subtitle, action }) {
  return (
    <div style={S.emptyState}>
      <div style={S.emptyIcon} aria-hidden="true">{icon}</div>
      <div style={S.emptyTitle}>{title}</div>
      {subtitle && <div style={S.emptySubtitle}>{subtitle}</div>}
      {action}
    </div>
  )
}

// ─── Loading row ─────────────────────────────────────────────────────────
export function LoadingRow({ label = 'جاري التحميل...' }) {
  return (
    <div style={S.loadingRow}>
      <Spinner size={16} />
      <span>{label}</span>
    </div>
  )
}

// ─── Pill toggle switch ────────────────────────────────────────────────
// Used both for per-service enable/disable (ServicesPanel) and the shipping
// on/off switch (OrdersPanel). A plain <button> already, but previously
// relied solely on a `title` attribute for its accessible name (unreliable —
// title isn't consistently exposed by screen readers, especially on
// touch/mobile). Now takes a required `label` describing what's being
// toggled and exposes state via aria-pressed, matching the native "switch"
// semantics screen readers expect from a toggle control.
export function ServiceToggle({ on, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={S.toggle(on)}
      title={on ? `${label} — تعطيل` : `${label} — تفعيل`}
      aria-pressed={on}
      aria-label={`${label}: ${on ? 'مفعّل' : 'معطّل'}`}
    >
      <span aria-hidden="true" style={{ position: 'absolute', top: 3, left: on ? 3 : 'auto', right: on ? 'auto' : 3, width: 18, height: 18, borderRadius: '50%', background: on ? '#0f1623' : '#334155', transition: 'all .2s', display: 'block' }} />
    </button>
  )
}
