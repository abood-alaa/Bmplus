import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useSeo, ORIGIN } from '../lib/seo'

// Arabic averages ~180 words per minute for general readership. html_content is
// admin-authored HTML, so tags are stripped before counting — otherwise markup
// would inflate the estimate. Replaces the previously hardcoded "3 دقائق", which
// claimed the same read time for every article regardless of length.
function readingMinutes(html, excerpt) {
  const text  = String(html || excerpt || '').replace(/<[^>]*>/g, ' ')
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 180))
}

export default function BlogArticlePage() {
  const { slug }     = useParams()
  const navigate     = useNavigate()
  const [article, setArticle] = useState(null)
  const [loading,  setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/blogs/${encodeURIComponent(slug)}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json() })
      .then(data => { setArticle(data); setLoading(false) })
      .catch(() => navigate('/blog', { replace: true }))
  }, [slug])

  const minutes = article ? readingMinutes(article.html_content, article.excerpt) : 0

  // Per-article title/description/canonical/OG + Article structured data. Without
  // this every article shared the homepage's description and canonical URL, which
  // told search and answer engines they were all the same page.
  useSeo({
    ready: !!article,
    title: article ? `${article.title} | بيت المقدس` : undefined,
    description: article?.excerpt || undefined,
    path: `/blog/${slug}`,
    type: 'article',
    jsonLd: article ? {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.title,
      ...(article.excerpt ? { description: article.excerpt } : {}),
      ...(article.category ? { articleSection: article.category } : {}),
      inLanguage: 'ar',
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${ORIGIN}/blog/${article.slug}` },
      ...(article.created_at ? { datePublished: new Date(article.created_at).toISOString() } : {}),
      ...(article.updated_at ? { dateModified:  new Date(article.updated_at).toISOString() } : {}),
      author:    { '@id': `${ORIGIN}/#business` },
      publisher: { '@id': `${ORIGIN}/#business` },
    } : null,
  })

  if (loading) return (
    <main>
      <div className="article-hero" style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="article-hero-inner">
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem' }}>جاري التحميل...</p>
        </div>
      </div>
    </main>
  )

  if (!article) return null

  return (
    <main itemScope itemType="https://schema.org/Article">
      {article.css_content && <style dangerouslySetInnerHTML={{ __html: article.css_content }} />}

      <div className="article-hero">
        <div className="hero-orb hero-orb-1" aria-hidden="true" />
        <div className="hero-orb hero-orb-2" aria-hidden="true" />
        <div className="hero-pattern"        aria-hidden="true" />
        <div className="article-hero-inner">
          <nav className="article-hero-breadcrumb" aria-label="مسار التنقل">
            <Link to="/">الرئيسية</Link>
            <span className="article-hero-breadcrumb-sep" aria-hidden="true">&#9664;</span>
            <Link to="/blog">المدونة</Link>
            <span className="article-hero-breadcrumb-sep" aria-hidden="true">&#9664;</span>
            <span>{article.category}</span>
          </nav>
          <span className="article-hero-cat">{article.category}</span>
          <h1 className="article-hero-title" itemProp="headline">{article.title}</h1>
          <div className="article-hero-meta">
            <span>بيت المقدس للخدمات العامة</span>
            <span className="article-hero-meta-dot" aria-hidden="true" />
            <span>سطح مرحبا، رام الله، فلسطين</span>
            {article.created_at && (
              <>
                <span className="article-hero-meta-dot" aria-hidden="true" />
                <time itemProp="datePublished" dateTime={new Date(article.created_at).toISOString()}>
                  {new Date(article.created_at).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' })}
                </time>
              </>
            )}
            <span className="article-hero-meta-dot" aria-hidden="true" />
            <span>قراءة: {minutes} {minutes === 1 ? 'دقيقة' : minutes === 2 ? 'دقيقتان' : minutes <= 10 ? 'دقائق' : 'دقيقة'}</span>
          </div>
        </div>
      </div>

      <div className="article-content-wrap" itemProp="articleBody">
        {article.html_content ? (
          <div className="article-body" dangerouslySetInnerHTML={{ __html: article.html_content }} />
        ) : (
          <div className="article-body"><p>{article.excerpt}</p></div>
        )}

        <div className="article-cta-box">
          <div className="article-cta-inner">
            <h2 className="article-cta-title">جاهز لتقديم معاملتك؟</h2>
            <p className="article-cta-sub">
              أرسل لنا مستنداتك الآن عبر البوابة الرقمية وسيتواصل معك فريق بيت المقدس عبر الواتساب فور الاستلام.
            </p>
            <Link to="/" className="article-cta-btn"
              onClick={e => { e.preventDefault(); navigate('/'); setTimeout(() => document.getElementById('contact-builder')?.scrollIntoView({ behavior: 'smooth' }), 100) }}>
              ابدأ معاملتك الآن
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
