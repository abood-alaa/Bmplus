/**
 * AdminAuthContext.jsx — token/session state + the single authFetch used by
 * every admin panel.
 *
 * Auth flow (server-side sessions, see server.js):
 *   POST /api/admin/login → { token } — a random 256-bit hex string; only its
 *   SHA-256 hash is ever stored server-side. Sent as `Authorization: Bearer
 *   <token>` on every subsequent request. Sessions slide forward on each
 *   authenticated request (30-minute idle timeout, refreshed server-side) —
 *   unlike the old deterministic token, this one can expire and can be
 *   revoked (POST /api/admin/logout).
 *
 * Every admin panel calls the `authFetch` from this context (via
 * useAdminAuth()) instead of a bare fetch(). On ANY 401 response — expired
 * session, revoked session, or a stale token — it clears the stored token
 * and sets a "session expired" message, which flips AdminShell back to the
 * login screen automatically (see AdminPage.jsx). This is the ONE place
 * that logic lives; individual panels never need to check response.status
 * for auth purposes themselves.
 */

import { createContext, useContext, useCallback, useState } from 'react'

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') || '')
  const [sessionMsg, setSessionMsg] = useState('') // shown on LoginScreen after a forced logout

  // Single logout path for both the logout button and a 401-triggered kick-back.
  // Always attempts the server-side revoke — harmless/idempotent even when the
  // session is already gone (that's exactly the 401 case) — so there's no
  // separate "silent local-only clear" path to keep in sync with this one.
  const logout = useCallback((message = '') => {
    setToken((current) => {
      if (current) fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: `Bearer ${current}` } }).catch(() => {})
      return ''
    })
    localStorage.removeItem('adminToken')
    setSessionMsg(message)
  }, [])

  const login = useCallback((t) => {
    localStorage.setItem('adminToken', t)
    setToken(t)
    setSessionMsg('')
  }, [])

  const clearSessionMsg = useCallback(() => setSessionMsg(''), [])

  // Every admin panel calls this instead of a bare fetch(). Adds the auth
  // header, and on a 401 clears the session everywhere (see logout() above).
  const authFetch = useCallback((url, opts = {}) => {
    return fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    }).then((res) => {
      if (res.status === 401) logout('انتهت صلاحية الجلسة. الرجاء تسجيل الدخول مرة أخرى.')
      return res
    })
  }, [token, logout])

  return (
    <AdminAuthContext.Provider value={{ token, login, logout, authFetch, sessionMsg, clearSessionMsg }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
