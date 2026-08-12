import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <>
      <div id="scroll-progress" />
      <header role="banner">
        <nav id="main-nav" role="navigation" aria-label="القائمة الرئيسية">
          <Link to="/" className="nav-logo-btn" aria-label="بيت المقدس - الصفحة الرئيسية">
            <img className="nav-logo-icon" src="/logo-white.png" alt="شعار بيت المقدس" />
            <div className="nav-brand-text">
              <span className="nav-brand-name">بيت المقدس</span>
              <span className="nav-brand-sub">بوابة الخدمات الرقمية</span>
            </div>
          </Link>
          <div className="nav-links" role="list">
            {isHome ? (
              <Link to="/blog" className="nav-link-btn" role="listitem">أسئلة شائعة</Link>
            ) : (
              <Link to="/" className="nav-link-btn" role="listitem">الصفحة الرئيسية</Link>
            )}
            <Link to="/#contact-builder" className="nav-cta-btn" role="listitem"
              onClick={e => {
                if (isHome) { e.preventDefault(); document.getElementById('contact-builder')?.scrollIntoView({ behavior: 'smooth' }) }
              }}>
              تقديم طلب
            </Link>
          </div>
          <button
            id="mobile-btn"
            className="mobile-hamburger"
            onClick={() => setOpen(true)}
            aria-label="فتح القائمة"
            aria-expanded={open}
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
        </nav>
      </header>

      {/* Mobile overlay */}
      <div
        className={`mobile-overlay${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <nav className={`mobile-drawer${open ? ' open' : ''}`} aria-label="قائمة الجوال" aria-hidden={!open}>
        <button className="mobile-close-btn" onClick={() => setOpen(false)} aria-label="اغلاق القائمة">
          <span aria-hidden="true">&#x2715;</span>
        </button>
        <div className="mobile-brand">
          <img className="nav-logo-icon" src="/logo-white.png" alt="شعار بيت المقدس" />
          <span className="nav-brand-name">بيت المقدس</span>
        </div>
        <ul className="mobile-nav-list" role="list">
          {isHome ? (
            <li><Link to="/blog" className="mobile-nav-link" onClick={() => setOpen(false)}>أسئلة شائعة</Link></li>
          ) : (
            <li><Link to="/" className="mobile-nav-link" onClick={() => setOpen(false)}>الصفحة الرئيسية</Link></li>
          )}
          <li>
            <Link
              to="/#contact-builder"
              className="mobile-nav-cta"
              onClick={() => {
                setOpen(false)
                setTimeout(() => document.getElementById('contact-builder')?.scrollIntoView({ behavior: 'smooth' }), 100)
              }}
            >
              تقديم طلب
            </Link>
          </li>
        </ul>
        <div className="mobile-drawer-footer">
          <a href="tel:+972592112294" className="mobile-phone-link" dir="ltr">059-211-2294</a>
          <span className="mobile-location">سطح مرحبا، رام الله، فلسطين</span>
        </div>
      </nav>
    </>
  )
}
