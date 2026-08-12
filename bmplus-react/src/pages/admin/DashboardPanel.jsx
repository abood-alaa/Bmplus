/**
 * DashboardPanel.jsx — landing tab shown first after login: order counts by
 * status, plus a quick summary of blogs/services.
 *
 * Counts come from GET /api/admin/stats, which aggregates them in SQL. This
 * previously fetched /api/admin/orders, /blogs and /services in full and called
 * .length/.filter() on the results — i.e. it shipped every row in three tables
 * across the wire to produce nine integers, on the tab that loads first after
 * every login. The dedicated endpoint the old comment here anticipated now
 * exists (see server.js).
 */

import { useState, useEffect, useCallback } from 'react'
import { useAdminAuth } from './AdminAuthContext'
import { S, STATUS_LABELS } from './adminStyles'
import { LoadingRow } from './ui'

export default function DashboardPanel({ onNavigate }) {
  const { authFetch } = useAdminAuth()
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    authFetch('/api/admin/stats')
      .then((r) => r.json())
      .then((d) => {
        // A 401 body is { error } rather than the stats shape; authFetch has already
        // bounced to the login screen by then, so just avoid rendering a broken tile.
        if (d && d.orders) setStats(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [authFetch])

  useEffect(() => { load() }, [load])

  if (loading || !stats) {
    return <div style={S.content}><LoadingRow /></div>
  }

  function StatTile({ icon, number, label, onClick }) {
    return (
      <button type="button" style={S.statTile(!!onClick)} onClick={onClick} disabled={!onClick}>
        <div aria-hidden="true" style={{ fontSize: '1.3rem', marginBottom: 6 }}>{icon}</div>
        <div style={S.statNumber}>{number}</div>
        <div style={S.statLabel}>{label}</div>
      </button>
    )
  }

  return (
    <div style={S.content}>
      <h2 style={S.sectionHd}>نظرة عامة</h2>

      <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 700, margin: '4px 0 10px' }}>الطلبات</div>
      <div style={S.statsGrid}>
        <StatTile icon="📋" number={stats.orders.total} label="إجمالي الطلبات" onClick={() => onNavigate('orders', 'all')} />
        <StatTile icon="🆕" number={stats.orders.new} label={STATUS_LABELS.new} onClick={() => onNavigate('orders', 'new')} />
        <StatTile icon="⏳" number={stats.orders.in_progress} label={STATUS_LABELS.in_progress} onClick={() => onNavigate('orders', 'in_progress')} />
        <StatTile icon="✅" number={stats.orders.done} label={STATUS_LABELS.done} onClick={() => onNavigate('orders', 'done')} />
      </div>

      <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 700, margin: '4px 0 10px' }}>المدونة والخدمات</div>
      <div style={S.statsGrid}>
        <StatTile icon="📝" number={stats.blogs.total} label="إجمالي المقالات" onClick={() => onNavigate('blogs')} />
        <StatTile icon="🌐" number={stats.blogs.published} label="منشورة" onClick={() => onNavigate('blogs')} />
        <StatTile icon="📄" number={stats.blogs.draft} label="مسودات" onClick={() => onNavigate('blogs')} />
        <StatTile icon="⚙️" number={`${stats.services.enabled}/${stats.services.total}`} label="خدمات مفعّلة" onClick={() => onNavigate('services')} />
      </div>
    </div>
  )
}
