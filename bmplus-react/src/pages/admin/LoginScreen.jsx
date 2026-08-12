/**
 * LoginScreen.jsx — password gate.
 *
 * On success the server returns a random session token (see
 * AdminAuthContext.jsx) which is handed to onLogin() to store.
 *
 * Lockout: after 3 consecutive failed attempts within 15 minutes, the server
 * returns 429 { error, code: 'LOCKED_OUT', retryAfterSeconds }. The countdown
 * below recomputes remaining seconds from an absolute deadline
 * (Date.now() + retryAfterSeconds*1000) on every tick rather than
 * decrementing a counter — a naive decrement drifts/undercounts when the tab
 * is backgrounded (browsers throttle timers in inactive tabs), so a user who
 * tabs away and back would otherwise see a wrong countdown.
 */

import { useState, useEffect, useRef } from 'react'
import { S } from './adminStyles'
import { Spinner } from './ui'

export default function LoginScreen({ onLogin, sessionMsg, onDismissSessionMsg }) {
  const [pw, setPw]         = useState('')
  const [showPw, setShowPw] = useState(false)
  const [err, setErr]       = useState('')
  const [busy, setBusy]     = useState(false)
  const [lockedUntil, setLockedUntil] = useState(null) // epoch ms, or null when not locked
  const [remaining, setRemaining]     = useState(0)
  const [announcement, setAnnouncement] = useState('') // polite live-region text, updated only at lock-start/unlock

  const wasLocked = useRef(false)

  useEffect(() => {
    if (!lockedUntil) return undefined
    const tick = () => {
      const secs = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
      setRemaining(secs)
      if (secs <= 0) setLockedUntil(null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  // Announce lock-start and unlock exactly once each — NOT every tick, which
  // would spam a screen reader with a new announcement every second.
  useEffect(() => {
    const locked = !!lockedUntil && remaining > 0
    if (locked && !wasLocked.current) {
      wasLocked.current = true
      const mins = Math.ceil(remaining / 60)
      setAnnouncement(`تم إيقاف الدخول مؤقتاً. حاول مرة أخرى بعد ${mins} ${mins === 1 ? 'دقيقة' : 'دقائق'}.`)
    } else if (!locked && wasLocked.current) {
      wasLocked.current = false
      setAnnouncement('يمكنك المحاولة مرة أخرى الآن.')
    }
  }, [lockedUntil, remaining])

  const locked = !!lockedUntil && remaining > 0
  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`

  async function submit(e) {
    e.preventDefault()
    if (locked || busy) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
      const d = await r.json()
      if (r.status === 429 && d.code === 'LOCKED_OUT') {
        setLockedUntil(Date.now() + (d.retryAfterSeconds || 0) * 1000)
        setErr(d.error)
        return
      }
      if (!r.ok) throw new Error(d.error)
      onLogin(d.token)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page" style={{ minHeight: '100vh', background: '#0f1623', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Tajawal, sans-serif', padding: 16 }}>
      <div style={{ background: '#13202f', border: '1px solid #1e3a5f', borderRadius: 16, padding: 40, width: 360, maxWidth: '100%', direction: 'rtl', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ color: '#FE9070', fontSize: '1.6rem', fontWeight: 700 }}>بيت المقدس</div>
          <div style={{ color: '#94a3b8', fontSize: '0.88rem', marginTop: 6 }}>لوحة التحكم الإدارية</div>
        </div>

        {/* Visually hidden, updated only at lock-start/unlock — see effect above */}
        <div className="sr-only" role="status" aria-live="polite">{announcement}</div>

        {sessionMsg && (
          <div style={S.infoMsg}>
            <span>{sessionMsg}</span>
            <button type="button" onClick={onDismissSessionMsg} style={{ ...S.toastCloseBtn, color: 'inherit' }} aria-label="إغلاق">✕</button>
          </div>
        )}
        {err && <div style={S.errMsg} role="alert">{err}</div>}

        <form onSubmit={submit}>
          <label htmlFor="admin-login-pw" style={S.label}>كلمة المرور</label>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              id="admin-login-pw"
              type={showPw ? 'text' : 'password'}
              style={{ ...S.input, paddingLeft: 40 }}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="أدخل كلمة المرور"
              autoFocus
              disabled={locked}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={S.pwToggleBtn}
              aria-label={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              aria-pressed={showPw}
            >
              {showPw ? '🙈' : '👁️'}
            </button>
          </div>

          <button type="submit" style={{ ...S.btn('primary'), width: '100%', padding: '11px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (busy || locked) ? 0.75 : 1 }} disabled={busy || locked}>
            {locked ? `مغلق مؤقتاً — ${mmss}` : busy ? (<><Spinner size={16} /> جاري الدخول...</>) : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  )
}
