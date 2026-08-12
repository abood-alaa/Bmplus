/**
 * App.jsx — Root router and layout shell.
 *
 * AppLayout wraps all routes and conditionally renders Navbar, Footer, and
 * WhatsAppFAB. The /admin route gets none of those — it has its own full-screen
 * layout managed by AdminPage. ScrollToTop resets scroll position on every
 * route change so navigating between pages starts at the top.
 */

import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import { WhatsAppFAB } from './components/WAModal'
import HomePage from './pages/HomePage'
import BlogPage from './pages/BlogPage'
import BlogArticlePage from './pages/BlogArticlePage'
import NotFoundPage from './pages/NotFoundPage'

// The admin panel is ~2,000 lines across 11 modules plus its own stylesheet, and
// is used by a handful of staff — but as a static import it was bundled into the
// single chunk every public visitor downloads. Splitting it means that code is
// only fetched when /admin is actually opened.
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))

// Shown for the moment it takes to fetch the admin chunk. Styled to match the
// admin panel's dark theme rather than the public site's light one, so the
// transition into LoginScreen isn't a white flash.
function AdminChunkFallback() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0f1623', color: '#94a3b8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Tajawal, sans-serif', direction: 'rtl',
    }}>
      جاري التحميل...
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function AppLayout() {
  const { pathname } = useLocation()
  const isAdmin = pathname.startsWith('/admin')

  return (
    <>
      <ScrollToTop />
      {!isAdmin && <Navbar />}
      <Routes>
        <Route path="/"          element={<HomePage />} />
        <Route path="/blog"      element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogArticlePage />} />
        <Route path="/admin"     element={<Suspense fallback={<AdminChunkFallback />}><AdminPage /></Suspense>} />
        <Route path="*"          element={<NotFoundPage />} />
      </Routes>
      {!isAdmin && <Footer />}
      {!isAdmin && <WhatsAppFAB />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}
