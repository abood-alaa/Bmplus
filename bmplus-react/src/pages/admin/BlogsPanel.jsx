/**
 * BlogsPanel.jsx — lists all articles (published and drafts). Clicking
 * "تعديل" switches to BlogEditor. Articles are stored as raw HTML + optional
 * CSS in the blog_articles table.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAdminAuth } from './AdminAuthContext'
import { S } from './adminStyles'
import { useConfirm, useToast, LoadingRow, EmptyState, Spinner } from './ui'

export default function BlogsPanel() {
  const { authFetch } = useAdminAuth()
  const confirm = useConfirm()
  const toast   = useToast()

  const [articles, setArticles] = useState([])
  const [editing,  setEditing]  = useState(null) // null | 'new' | article object
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(() => {
    authFetch('/api/admin/blogs').then((r) => r.json()).then((d) => { setArticles(Array.isArray(d) ? d : []); setLoading(false) })
  }, [authFetch])

  useEffect(() => { load() }, [load])

  async function deleteArticle(id, title) {
    if (!await confirm({ title: 'حذف المقالة', message: `هل تريد حذف مقالة "${title}"؟ لا يمكن التراجع عن هذا الإجراء.`, danger: true, confirmLabel: 'حذف' })) return
    await authFetch(`/api/admin/blogs/${id}`, { method: 'DELETE' })
    toast.success('تم حذف المقالة')
    load()
  }

  if (editing !== null) {
    const wasNew = editing === 'new'
    return (
      <BlogEditor
        article={wasNew ? null : editing}
        onDone={() => { toast.success(wasNew ? 'تم نشر المقالة' : 'تم حفظ التعديلات'); setEditing(null); load() }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div style={S.content}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={S.sectionHd}>المدونة ({articles.length})</h2>
        <button style={S.btn('success')} onClick={() => setEditing('new')}>+ مقالة جديدة</button>
      </div>

      {loading ? (
        <LoadingRow />
      ) : articles.length === 0 ? (
        <div style={S.card}>
          <EmptyState icon="📝" title="لا توجد مقالات" subtitle="ابدأ بإضافة أول مقالة في المدونة" action={<button style={S.btn('success')} onClick={() => setEditing('new')}>+ مقالة جديدة</button>} />
        </div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>{['العنوان', 'الفئة', 'الحالة', 'التاريخ', 'إجراءات'].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...S.td, fontWeight: 600, maxWidth: 240 }}>{a.title}</td>
                    <td style={{ ...S.td, color: '#94a3b8' }}>{a.category || '—'}</td>
                    <td style={S.td}><span style={S.badge(a.is_published ? 'done' : 'new')}>{a.is_published ? 'منشور' : 'مسودة'}</span></td>
                    <td style={{ ...S.td, color: '#94a3b8', fontSize: '0.82rem' }}>{a.created_at?.slice(0, 10)}</td>
                    <td style={S.td}>
                      <button style={{ ...S.btn('default'), marginLeft: 6, padding: '4px 12px' }} onClick={() => setEditing(a)} aria-label={`تعديل مقالة ${a.title}`}>تعديل</button>
                      <button style={{ ...S.btn('danger'), padding: '4px 10px' }} onClick={() => deleteArticle(a.id, a.title)} aria-label={`حذف مقالة ${a.title}`}>حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Blog Editor ────────────────────────────────────────────────────────
// Create or edit a blog article. The slug is auto-generated from the title
// for new articles but can be overridden. Content is written as raw HTML
// with an optional CSS block; both are injected into BlogArticlePage at
// render time.
function BlogEditor({ article, onDone, onCancel }) {
  const { authFetch } = useAdminAuth()
  const isNew = !article
  const [form, setForm] = useState({
    title:        article?.title        || '',
    slug:         article?.slug         || '',
    category:     article?.category     || '',
    excerpt:      article?.excerpt      || '',
    html_content: article?.html_content || '',
    css_content:  article?.css_content  || '',
    is_published: article?.is_published ?? 1,
  })
  const [err, setErr]   = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Converts the title to a URL-safe slug (supports Arabic characters).
  function autoSlug(title) {
    return title.toLowerCase().replace(/\s+/g, '-').replace(/[^؀-ۿa-z0-9-]/g, '').slice(0, 80)
  }

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const method = isNew ? 'POST' : 'PUT'
      const url    = isNew ? '/api/admin/blogs' : `/api/admin/blogs/${article.id}`
      const r = await authFetch(url, { method, body: JSON.stringify(form) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div style={S.content}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <button style={S.btn('ghost')} onClick={onCancel}>← رجوع</button>
        <h2 style={{ ...S.sectionHd, margin: 0 }}>{isNew ? 'مقالة جديدة' : `تعديل: ${article.title}`}</h2>
      </div>

      {err && <div style={S.errMsg} role="alert">{err}</div>}
      <form onSubmit={submit}>
        <div style={{ ...S.row2, marginBottom: 12 }}>
          <div>
            <label htmlFor="blog-title" style={S.label}>العنوان *</label>
            <input id="blog-title" style={S.input} value={form.title} onChange={(e) => { set('title', e.target.value); if (isNew) set('slug', autoSlug(e.target.value)) }} required />
          </div>
          <div>
            <label htmlFor="blog-slug" style={S.label}>الرابط (slug) *</label>
            <input id="blog-slug" style={{ ...S.input, direction: 'ltr' }} value={form.slug} onChange={(e) => set('slug', e.target.value)} required />
          </div>
        </div>
        <div style={{ ...S.row2, marginBottom: 12 }}>
          <div>
            <label htmlFor="blog-category" style={S.label}>الفئة</label>
            <input id="blog-category" style={S.input} value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="مثال: جوازات السفر" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
            <input type="checkbox" id="pub" checked={!!form.is_published} onChange={(e) => set('is_published', e.target.checked ? 1 : 0)} />
            <label htmlFor="pub" style={{ ...S.label, margin: 0, cursor: 'pointer' }}>منشور</label>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="blog-excerpt" style={S.label}>المقتطف</label>
          <textarea id="blog-excerpt" style={S.textarea} value={form.excerpt} onChange={(e) => set('excerpt', e.target.value)} rows={2} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="blog-html" style={S.label}>محتوى HTML</label>
          <textarea id="blog-html" style={{ ...S.textarea, minHeight: 200, direction: 'ltr', fontFamily: 'monospace', fontSize: '0.82rem' }} value={form.html_content} onChange={(e) => set('html_content', e.target.value)} rows={10} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="blog-css" style={S.label}>CSS مخصص (اختياري)</label>
          <textarea id="blog-css" style={{ ...S.textarea, minHeight: 80, direction: 'ltr', fontFamily: 'monospace', fontSize: '0.82rem' }} value={form.css_content} onChange={(e) => set('css_content', e.target.value)} rows={4} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" style={{ ...S.btn('primary'), display: 'flex', alignItems: 'center', gap: 8 }} disabled={busy}>{busy && <Spinner size={14} />} {busy ? 'جاري الحفظ...' : (isNew ? 'نشر المقالة' : 'حفظ التعديلات')}</button>
          <button type="button" style={S.btn('ghost')} onClick={onCancel}>إلغاء</button>
        </div>
      </form>
    </div>
  )
}
