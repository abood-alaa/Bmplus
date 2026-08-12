/**
 * AdminPage.jsx — Admin control panel for Bayt Al-Maqdis General Services.
 *
 * Root component: wires up the auth/toast/confirm providers, then renders
 * either LoginScreen or the authenticated shell (header + nav + active panel).
 *
 * Sections:
 *   DashboardPanel — landing view: order counts by status, blog/service summary
 *   OrdersPanel    — table with search, status filter, checkboxes, bulk ops, detail panel
 *   BlogsPanel     — list / create / edit / delete blog articles
 *   ServicesPanel  — tree view of primary → sub → branch with enable/disable toggles
 *
 * Auth flow (see AdminAuthContext.jsx):
 *   POST /api/admin/login → server returns a random session token (DB-backed
 *   session, 30-minute sliding idle timeout). Token is stored in
 *   localStorage['adminToken'] and sent as a Bearer header on every request.
 *   A 401 on any request (session expired/revoked) clears the token and
 *   bounces back to LoginScreen with a "session expired" message.
 *
 * API base: all requests go through Vite's proxy (/api → localhost:3000) in dev.
 */

import { useState } from 'react'
import './admin.css'
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext'
import { ToastProvider, ConfirmProvider } from './ui'
import { S, NAV_ITEMS } from './adminStyles'
import LoginScreen from './LoginScreen'
import DashboardPanel from './DashboardPanel'
import OrdersPanel from './OrdersPanel'
import BlogsPanel from './BlogsPanel'
import ServicesPanel from './ServicesPanel'

export default function AdminPage() {
  return (
    <AdminAuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AdminShell />
        </ConfirmProvider>
      </ToastProvider>
    </AdminAuthProvider>
  )
}

function AdminShell() {
  const { token, login, logout, sessionMsg, clearSessionMsg } = useAdminAuth()
  const [view, setView] = useState('dashboard')
  const [ordersFilter, setOrdersFilter] = useState('all')

  if (!token) return <LoginScreen onLogin={login} sessionMsg={sessionMsg} onDismissSessionMsg={clearSessionMsg} />

  function navigateTo(nextView, filter) {
    if (filter) setOrdersFilter(filter)
    setView(nextView)
  }

  return (
    <div className="admin-page" style={S.page}>
      <div style={S.header}>
        <span style={S.logo}>🏢 لوحة تحكم بيت المقدس</span>
        <nav style={S.nav} aria-label="أقسام لوحة التحكم">
          {NAV_ITEMS.map(({ key, icon, label }) => (
            <button key={key} style={S.navBtn(view === key)} onClick={() => setView(key)} aria-current={view === key ? 'page' : undefined}>
              <span aria-hidden="true">{icon}</span> {label}
            </button>
          ))}
        </nav>
        <button style={S.logoutBtn} onClick={() => logout('')}>تسجيل خروج</button>
      </div>

      {view === 'dashboard' && <DashboardPanel onNavigate={navigateTo} />}
      {view === 'orders'    && <OrdersPanel key={ordersFilter} initialFilter={ordersFilter} />}
      {view === 'blogs'     && <BlogsPanel />}
      {view === 'services'  && <ServicesPanel />}
    </div>
  )
}
