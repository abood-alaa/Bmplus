import { Link } from 'react-router-dom'
import { useSeo } from '../lib/seo'

export default function NotFoundPage() {
  // noindex so soft-404s (the SPA serves index.html for every unknown path, with
  // a 200) don't accumulate in the search index as thin duplicate pages.
  useSeo({
    title: 'الصفحة غير موجودة | بيت المقدس للخدمات العامة',
    description: 'الصفحة المطلوبة غير موجودة. عد إلى الصفحة الرئيسية لبدء معاملتك.',
    path: '/404',
    noindex: true,
  })

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{
          fontFamily: 'Cairo, sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(6rem, 20vw, 12rem)',
          background: 'linear-gradient(135deg, #FE9070, #FD5523)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1,
          marginBottom: '1rem',
        }}>
          404
        </div>
        <h1 style={{
          fontFamily: 'Cairo, sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          color: '#0f172a',
          marginBottom: '1rem',
        }}>
          الصفحة غير موجودة
        </h1>
        <p style={{
          color: '#565969',
          fontSize: '1rem',
          lineHeight: 1.8,
          maxWidth: '400px',
          margin: '0 auto 2rem',
        }}>
          عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <Link to="/" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.9rem 2rem',
          background: 'linear-gradient(135deg, #062E39, #05242D)',
          color: 'white',
          fontFamily: 'Cairo, sans-serif',
          fontWeight: 800,
          fontSize: '0.9rem',
          borderRadius: '13px',
          textDecoration: 'none',
          boxShadow: '0 6px 24px rgba(6,46,57,0.32)',
          transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}>
          العودة إلى الصفحة الرئيسية
        </Link>
      </div>
    </main>
  )
}
