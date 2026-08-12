/**
 * adminStyles.js — Shared inline-style factory for the admin panel.
 *
 * Every component under src/pages/admin/ imports `S` from here instead of
 * defining its own styles, so the whole panel stays visually consistent.
 *
 * Color roles (matches the site's current orange brand family — see
 * bmplus-react/src/styles/style.css :root — this used to be a leftover
 * pre-rebrand gold `#c8a96e`, fixed here):
 *   GOLD       #FD5523 — solid fills (primary buttons, toggle "on" state,
 *              thin borders). Confirmed AA-safe as a fill with dark
 *              (`#0f1623`) text on top; do NOT use as small text color on
 *              a dark background — 5.1:1 on card bg is thin margin and
 *              this saturated a hue reads as harsh at text sizes.
 *   GOLD_LIGHT #FE9070 — text/headings on dark backgrounds (7.4–8.1:1
 *              contrast, comfortable AA margin) and the global focus-ring
 *              color (see admin.css). This is the default choice for
 *              "gold-ish" text anywhere in this panel.
 *   GOLD_DARK  #CB441C — reserved, not currently used in the dark admin UI
 *              (fails AA as text; would need light/white text on top if
 *              ever used as a fill — opposite rule from the other two).
 * These roles were confirmed against computed WCAG AA contrast ratios for
 * this exact dark theme during an accessibility review — don't swap
 * GOLD/GOLD_LIGHT roles without rechecking contrast.
 *
 * MUTED (#94a3b8) replaces the previous muted-text color (#64748b), which
 * measured 3.4–3.8:1 against these dark backgrounds — fails the 4.5:1 AA
 * text threshold everywhere it was used (column headers, timestamps, the
 * logout button). #94a3b8 was already used elsewhere in this file (S.label)
 * and passes at 6.4–7.1:1, so it's reused here instead of introducing a
 * third muted hex.
 *
 * NOTE — the generated invoice/PDF template (invoiceHelpers.js) is a
 * separate light-background document matching the *public* site's theme,
 * not this dark admin UI — its `#FD5523`/`#64748b` usages are intentionally
 * left as-is and are NOT part of this token system.
 */

export const GOLD       = '#FD5523'
export const GOLD_LIGHT = '#FE9070'
export const GOLD_DARK  = '#CB441C'
export const MUTED      = '#94a3b8'

export const S = {
  page:    { minHeight: '100vh', background: '#0f1623', color: '#e2e8f0', direction: 'rtl', fontFamily: 'Tajawal, sans-serif' },
  header:  { background: '#0d1b2e', borderBottom: '1px solid #1e3a5f', padding: '8px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 60, flexWrap: 'wrap', gap: 8 },
  logo:    { color: GOLD_LIGHT, fontWeight: 700, fontSize: '1.1rem', whiteSpace: 'nowrap' },
  nav:     { display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  navBtn:  (active) => ({
    background: active ? '#1e3a5f' : 'transparent',
    color: active ? GOLD_LIGHT : MUTED,
    border: 'none',
    borderBottom: active ? `2px solid ${GOLD_LIGHT}` : '2px solid transparent',
    borderRadius: '8px 8px 0 0',
    padding: '8px 18px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
    transition: 'all .2s',
    fontFamily: 'Tajawal, sans-serif',
    whiteSpace: 'nowrap',
  }),
  logoutBtn: { background: 'transparent', color: MUTED, border: '1px solid #1e3a5f', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'Tajawal, sans-serif', whiteSpace: 'nowrap' },
  content: { padding: 24, maxWidth: 1100, margin: '0 auto' },
  card:    { background: '#13202f', border: '1px solid #1e3a5f', borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  cardHd:  { background: '#0d1b2e', padding: '14px 20px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  cardTitle: { fontWeight: 700, color: GOLD_LIGHT, fontSize: '0.95rem' },
  cardBody:  { padding: 20 },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' },
  th:      { padding: '10px 12px', borderBottom: '1px solid #1e3a5f', color: MUTED, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' },
  td:      { padding: '10px 12px', borderBottom: '1px solid #0d1b2e', color: '#cbd5e1', verticalAlign: 'top' },
  badge:   (s) => {
    const map = { new: ['#1e3a5f','#60a5fa'], in_progress: ['#2d2a0e','#fbbf24'], done: ['#0e2d1c','#34d399'] }
    const [bg, fg] = map[s] || ['#1a2535', MUTED]
    return { background: bg, color: fg, padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700, display: 'inline-block', whiteSpace: 'nowrap' }
  },
  btn:     (variant = 'default') => {
    const variants = {
      default:  { background: '#1e3a5f', color: '#e2e8f0', border: 'none' },
      primary:  { background: GOLD, color: '#0f1623', border: 'none' },
      danger:   { background: '#7f1d1d', color: '#fca5a5', border: 'none' },
      ghost:    { background: 'transparent', color: MUTED, border: '1px solid #1e3a5f' },
      success:  { background: '#14532d', color: '#86efac', border: 'none' },
    }
    return { ...variants[variant], borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'Tajawal, sans-serif', transition: 'opacity .2s' }
  },
  // outline intentionally NOT set to 'none' here (it used to be, which killed focus
  // visibility on every field with no replacement) — admin.css supplies a real
  // `:focus-visible` ring instead. See admin.css.
  input:   { background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 8, color: '#e2e8f0', padding: '9px 12px', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box', fontFamily: 'Tajawal, sans-serif', direction: 'rtl' },
  textarea: { background: '#0d1b2e', border: '1px solid #1e3a5f', borderRadius: 8, color: '#e2e8f0', padding: '9px 12px', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box', fontFamily: 'Tajawal, sans-serif', direction: 'rtl', resize: 'vertical', minHeight: 80 },
  label:   { display: 'block', color: '#94a3b8', fontSize: '0.82rem', marginBottom: 6, fontWeight: 600 },
  row2:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  errMsg:  { background: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: '0.88rem', marginBottom: 12 },
  infoMsg: { background: '#0d2140', border: '1px solid #2d5a8e', color: '#93c5fd', borderRadius: 8, padding: '10px 14px', fontSize: '0.88rem', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  toggle:  (on) => ({ width: 44, height: 24, borderRadius: 12, background: on ? GOLD : '#1e3a5f', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }),

  // ── Toasts ────────────────────────────────────────────────────────────
  toastContainer: { position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999, maxWidth: '92vw', pointerEvents: 'none' },
  toast: (type) => {
    const map = {
      success: ['#0e2d1c', '#86efac', '#14532d'],
      error:   ['#450a0a', '#fca5a5', '#7f1d1d'],
      info:    ['#0d2140', '#93c5fd', '#2d5a8e'],
    }
    const [bg, fg, border] = map[type] || map.info
    return {
      background: bg, color: fg, border: `1px solid ${border}`, borderRadius: 10,
      padding: '12px 16px', fontSize: '0.88rem', fontWeight: 600, display: 'flex',
      alignItems: 'center', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      animation: 'admin-toast-in .2s ease-out', minWidth: 240, pointerEvents: 'auto',
    }
  },
  toastCloseBtn: { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem', marginRight: 'auto', opacity: 0.75, padding: 2, lineHeight: 1 },

  // ── Modal ─────────────────────────────────────────────────────────────
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(6,10,18,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 },
  modalCard:    (wide) => ({ background: '#13202f', border: '1px solid #1e3a5f', borderRadius: 14, width: '100%', maxWidth: wide ? 640 : 440, maxHeight: '90vh', overflowY: 'auto', direction: 'rtl' }),
  modalHd:      { background: '#0d1b2e', padding: '16px 20px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0 },
  modalBody:    { padding: 20, fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.7 },
  modalFooter:  { padding: '14px 20px', borderTop: '1px solid #1e3a5f', display: 'flex', gap: 8, justifyContent: 'flex-start' },

  // ── Spinner ───────────────────────────────────────────────────────────
  spinner: (size = 16) => ({
    display: 'inline-block', width: size, height: size, borderRadius: '50%',
    border: `${Math.max(2, Math.round(size / 8))}px solid rgba(255,255,255,.22)`,
    borderTopColor: 'currentColor', animation: 'admin-spin .6s linear infinite',
    verticalAlign: 'middle', flexShrink: 0,
  }),

  // ── Empty / loading states ───────────────────────────────────────────
  emptyState:    { padding: '48px 24px', textAlign: 'center', color: MUTED },
  emptyIcon:     { fontSize: '2.2rem', marginBottom: 10, opacity: 0.7 },
  emptyTitle:    { color: '#cbd5e1', fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 },
  emptySubtitle: { fontSize: '0.82rem', marginBottom: 14 },
  loadingRow:    { padding: 40, textAlign: 'center', color: MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 },

  // ── Dashboard ─────────────────────────────────────────────────────────
  statsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 },
  statTile:   (clickable) => ({ background: '#13202f', border: '1px solid #1e3a5f', borderRadius: 12, padding: '18px 20px', cursor: clickable ? 'pointer' : 'default', textAlign: 'right', transition: 'border-color .2s', width: '100%', fontFamily: 'Tajawal, sans-serif' }),
  statNumber: { fontSize: '1.9rem', fontWeight: 800, color: GOLD_LIGHT, lineHeight: 1.2 },
  statLabel:  { color: MUTED, fontSize: '0.82rem', marginTop: 4, fontWeight: 600 },
  sectionHd:  { color: GOLD_LIGHT, margin: '0 0 12px', fontSize: '1.05rem', fontWeight: 700 },

  // ── Login screen ──────────────────────────────────────────────────────
  pwToggleBtn: { position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.05rem', color: MUTED, padding: 4, lineHeight: 1 },
  srOnly: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 },

  // A table cell's "primary" value rendered as a real <button> so it's
  // keyboard/screen-reader operable, but visually indistinguishable from
  // plain bold text — the <tr> itself keeps its own onClick for mouse users
  // (see OrdersPanel.jsx); this button is the keyboard-accessible equivalent.
  rowLinkBtn: { background: 'transparent', border: 'none', color: '#e2e8f0', fontWeight: 600, fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'right', width: '100%' },
}

// Arabic labels for order status values stored in the DB. Shared across
// OrdersPanel, DashboardPanel, and invoiceHelpers.
export const STATUS_LABELS = { new: 'جديد', in_progress: 'قيد التنفيذ', done: 'منجز' }

// Nav tabs shown in the header — {key, icon, label} instead of a bare
// string so icon/label aren't string-concatenated (keeps the door open for
// icon-only nav at very narrow widths without parsing an emoji out of text).
export const NAV_ITEMS = [
  { key: 'dashboard', icon: '📊', label: 'الرئيسية' },
  { key: 'orders',    icon: '📋', label: 'الطلبات' },
  { key: 'blogs',     icon: '📝', label: 'المدونة' },
  { key: 'services',  icon: '⚙️', label: 'الخدمات' },
]
