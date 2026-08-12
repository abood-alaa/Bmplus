import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSeo, ORIGIN } from '../lib/seo'

export default function BlogPage() {
  const [articles, setArticles] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch('/api/blogs')
      .then(r => r.json())
      .then(data => { setArticles(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Title/description/canonical/OG for this route — previously only document.title
  // was set here, so the blog index shared the homepage's description and canonical
  // URL. The Blog JSON-LD is emitted once articles have loaded so its itemListElement
  // reflects real posts rather than an empty list.
  useSeo({
    title: 'مدونة بيت المقدس | دليل المعاملات الرسمية للفلسطينيين في الخارج',
    description: 'مقالات إرشادية حول استخراج الوثائق الرسمية الفلسطينية وتصديقها من الخارج — الشهادات، الأحوال المدنية، المحكمة الشرعية، والتصديقات.',
    path: '/blog',
    jsonLd: loading ? null : {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'مدونة بيت المقدس',
      url: `${ORIGIN}/blog`,
      inLanguage: 'ar',
      publisher: { '@id': `${ORIGIN}/#business` },
      blogPost: articles.map(a => ({
        '@type': 'BlogPosting',
        headline: a.title,
        url: `${ORIGIN}/blog/${a.slug}`,
        ...(a.excerpt ? { description: a.excerpt } : {}),
        ...(a.created_at ? { datePublished: new Date(a.created_at).toISOString() } : {}),
      })),
    },
  })

  return (
    <main className="blog-page-wrap">
      <div className="blog-page-inner">
        <div className="blog-page-header">
          <span className="section-badge">المدونة</span>
          <h1 className="section-h2 blog-h1">دليل المعاملات الرسمية للفلسطينيين في الخارج</h1>
          <p className="blog-page-sub">
            معلومات موثوقة وإجابات على أكثر الأسئلة شيوعاً حول المعاملات الحكومية الفلسطينية — من رام الله إلى كل بقاع الأرض
          </p>
          <div className="blog-page-divider" />
        </div>

        <div className="blog-grid" role="list">
          {loading ? (
            <article className="blog-card" role="listitem">
              <span className="blog-card-cat">جاري التحميل...</span>
              <h2 className="blog-card-title">يتم تحميل المقالات</h2>
              <p className="blog-card-excerpt">الرجاء الانتظار قليلاً.</p>
            </article>
          ) : articles.length === 0 ? (
            <article className="blog-card" role="listitem">
              <span className="blog-card-cat">لا توجد مقالات</span>
              <h2 className="blog-card-title">لا توجد مقالات منشورة حالياً</h2>
              <p className="blog-card-excerpt">قم بإضافة مقالة من لوحة التحكم وستظهر هنا تلقائياً.</p>
            </article>
          ) : articles.map(article => (
            <article key={article.id} className="blog-card" role="listitem">
              <span className="blog-card-cat">{article.category}</span>
              <h2 className="blog-card-title">
                <Link to={`/blog/${article.slug}`} className="blog-card-title-link">{article.title}</Link>
              </h2>
              <p className="blog-card-excerpt">{article.excerpt}</p>
              <Link to={`/blog/${article.slug}`} className="blog-card-link" aria-label="اقرأ المزيد">
                اقرأ المقالة ←
              </Link>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}
