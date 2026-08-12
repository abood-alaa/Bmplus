import { useState, useEffect, useRef } from 'react'
import { favoriteCountries, allCountries } from '../lib/data'

export default function CountryPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const btnRef = useRef(null)
  const [style, setStyle] = useState({})

  function position() {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const dropW = 288
    let left = rect.left
    if (left + dropW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - dropW - 8)
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const newStyle = {
      position: 'fixed',
      left: `${left}px`,
      width: `${dropW}px`,
      zIndex: 2000,
    }
    if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
      newStyle.top = `${rect.bottom + 8}px`
    } else {
      newStyle.bottom = `${window.innerHeight - rect.top + 8}px`
    }
    setStyle(newStyle)
  }

  useEffect(() => {
    if (!open) return
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target) && !btnRef.current.contains(e.target))
        setOpen(false)
    }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('click', handler)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('click', handler); document.removeEventListener('keydown', esc) }
  }, [open])

  const filtered = search
    ? allCountries.filter(c => c.name.includes(search) || c.code.includes(search))
    : allCountries

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        id="country-btn"
        ref={btnRef}
        className="h-full bg-slate-100 px-4 flex items-center gap-2 border-r border-slate-200 hover:bg-slate-200 transition-colors"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        aria-expanded={open}
        style={{ height: '100%', background: '#eef2f7', border: 'none', borderLeft: '1.5px solid #e2e8f0', padding: '0 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', color: '#1e293b' }}
      >
        <span id="selected-code" style={{ fontWeight: 700, fontSize: '0.82rem' }}>{value}</span>
        <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>▼</span>
      </button>

      {open && (
        <div
          ref={containerRef}
          style={{
            ...style,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '13px',
            boxShadow: '0 12px 40px rgba(0,26,51,0.14)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '0.6rem 0.6rem 0' }}>
            <input
              type="text"
              placeholder="ابحث عن الدولة..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: '8px', padding: '0.55rem 0.8rem',
                fontFamily: 'Tajawal, sans-serif', fontSize: '0.8rem',
                outline: 'none', direction: 'rtl', textAlign: 'right', color: '#1e293b',
              }}
            />
          </div>
          <div className="country-dropdown-list" style={{ maxHeight: 240, overflowY: 'auto', padding: '0.4rem' }}>
            {!search && (
              <>
                <span className="favorite-header">الدول المفضلة</span>
                {favoriteCountries.map((c, i) => (
                  <CountryItem key={`fav-${i}`} c={c} selected={c.code === value} onSelect={c => { onChange(c.code); setOpen(false); setSearch('') }} />
                ))}
                <div className="dropdown-divider" />
                <span className="favorite-header">جميع الدول</span>
              </>
            )}
            {filtered.length === 0
              ? <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', padding: '1rem' }}>لا توجد نتائج</p>
              : filtered.map((c, i) => (
                <CountryItem key={`all-${i}`} c={c} selected={c.code === value} onSelect={c => { onChange(c.code); setOpen(false); setSearch('') }} />
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

function CountryItem({ c, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`country-item${selected ? ' selected' : ''}`}
      role="option"
      onClick={e => { e.stopPropagation(); onSelect(c) }}
    >
      <span className="country-item-name">{c.name}</span>
      <span className="country-item-code">{c.code}</span>
    </button>
  )
}
