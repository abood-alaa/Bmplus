import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import CountryPicker from '../components/CountryPicker'
import ServiceSelector from '../components/ServiceSelector'
import { WAModal } from '../components/WAModal'
import { submitRequest } from '../lib/api'
import { validatePhone } from '../lib/data'

export default function HomePage() {
  // Scroll reveal
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries, o) => {
        entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('active'); o.unobserve(en.target) } })
      }, { threshold: 0.12 })
      els.forEach(el => obs.observe(el))
      return () => obs.disconnect()
    } else {
      els.forEach(el => el.classList.add('active'))
    }
  }, [])

  // Scroll progress
  useEffect(() => {
    const bar = document.getElementById('scroll-progress')
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0
      if (bar) bar.style.width = `${Math.min(Math.max(pct, 0), 100)}%`
    }
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <>
      <HeroSection />
      <TickerStrip />
      <AboutSection />
      <ContactForm />
    </>
  )
}

/* ─── HERO ─────────────────────────────────────────────────── */
function HeroSection() {
  return (
    <section id="hero" aria-labelledby="hero-title">
      <div className="hero-orb hero-orb-1" aria-hidden="true" />
      <div className="hero-orb hero-orb-2" aria-hidden="true" />
      <div className="hero-pattern" aria-hidden="true" />
      <div className="hero-inner">
        <div className="hero-left">
          <div className="hero-badge" role="note">
            <span className="hero-badge-pulse" aria-hidden="true" />
            <span className="hero-badge-text">نظام استقبال المعاملات الرقمي — رام الله</span>
          </div>
          <h1 id="hero-title" className="hero-h1">
            معاملاتك الرسمية في فلسطين
            <span className="hero-h1-gold">وأنت في الخارج</span>
          </h1>
          <p className="hero-p">بيت المقدس للخدمات العامة — مكتبنا في رام الله ينوب عنك في مراجعة الدوائر الحكومية والمحاكم، ويشحن لك الوثيقة أينما كنت. أكثر من 25 خدمة، ومتابعة عبر الواتساب من الطلب حتى التسليم.</p>
          <div className="hero-actions">
            <a href="#contact-builder" className="hero-btn-primary" onClick={e => { e.preventDefault(); document.getElementById('contact-builder')?.scrollIntoView({ behavior: 'smooth' }) }}>ابدأ معاملتك الآن</a>
            <a href="#about-us" className="hero-btn-ghost" onClick={e => { e.preventDefault(); document.getElementById('about-us')?.scrollIntoView({ behavior: 'smooth' }) }}>تعرف علينا</a>
          </div>
        </div>
        <div className="hero-right" aria-hidden="true">
          <div className="hero-card hero-card-main">
            <p className="hero-card-title">خدماتنا الرئيسية</p>
            {['معاملات السفر والجوازات','الشهادات والوثائق الرسمية','لم الشمل وعقود الزواج','الترجمات القانونية المعتمدة','البريد الدولي والمحلي'].map(s => (
              <div key={s} className="hero-svc-item"><span className="svc-dot" />{s}</div>
            ))}
          </div>
          {/* Replaces the previous "+18 years experience" stat grid. The office is
              new, so tenure numbers were both untrue and (at 18 vs 15 in different
              places) self-contradictory. A process walkthrough earns more trust from
              someone abroad deciding whether to hand over their ID documents: it
              answers "how does this actually work" instead of asserting seniority. */}
          <div className="hero-steps">
            <p className="hero-steps-title">كيف تتم معاملتك</p>
            {[
              { n: '1', t: 'أرسل طلبك ومستنداتك', d: 'من أي دولة، عبر النموذج في الأسفل — دون سفر أو وساطة.' },
              { n: '2', t: 'نؤكد لك التكلفة والمدة', d: 'نراجع الطلب ونتواصل معك عبر الواتساب قبل أن نبدأ أو تدفع.' },
              { n: '3', t: 'ننجز ونشحن الوثيقة إليك', d: 'نتابع الدوائر الرسمية نيابةً عنك، ونبقيك على اطلاع خطوة بخطوة.' },
            ].map(s => (
              <div key={s.n} className="hero-step">
                <span className="hero-step-num">{s.n}</span>
                <span className="hero-step-body">
                  <span className="hero-step-title">{s.t}</span>
                  <span className="hero-step-desc">{s.d}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── TICKER ────────────────────────────────────────────────── */
const TICKER_ITEMS = ['جواز سفر للخارج','شهادة ثانوية عامة','معاملات لم الشمل','ترجمات قانونية معتمدة','رخصة دولية','معاملات المحمكة الشرعية','حسن سيرة وسلوك','تصديق وكالات خاصة','بريد دولي ومحلي','عدم المحكومية']

function TickerStrip() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]
  return (
    <div id="ticker-strip" aria-hidden="true">
      <div className="ticker-track">
        {items.map((item, i) => (
          <span key={i} className="ticker-item">
            <span className="ticker-sep" />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ─── ABOUT ─────────────────────────────────────────────────── */
function AboutSection() {
  return (
    <section id="about-us" className="reveal" aria-labelledby="about-title">
      <div className="about-grid">
        <div className="about-left">
          <span className="section-badge">من نحن</span>
          <h2 id="about-title" className="section-h2">أكثر من مكتب خدمات —<br /><span className="section-h2-accent">وكيلك الموثوق داخل فلسطين</span></h2>
          <p className="about-lead">حين تكون بعيداً عن وطنك، تصبح كل ورقة رسمية عبئاً. نحن نتحمل هذا العبء عنك.</p>
          {/* Rewritten: the previous copy claimed "more than fifteen years" while the
              stat cards claimed eighteen. Both were untrue for a newly-opened office,
              and the contradiction between them was itself a credibility problem. The
              honest framing below turns being new into the actual differentiator —
              a digital intake system instead of phone calls and verbal promises. */}
          <p className="about-body">بيت المقدس مكتب خدمات عامة في قلب رام الله، أنشأناه لسبب واحد: أن يُنجز الفلسطيني المقيم في الخارج معاملته الرسمية دون سفر ودون وساطة مجهولة. نحن مكتب حديث، ونعتبر ذلك ميزة — بنينا نظام استقبال رقمي ترفع عبره مستنداتك وتتابع حالة معاملتك خطوة بخطوة، بدل المكالمات والوعود الشفهية.</p>
          <div className="about-pillars">
            {[
              { title: 'السرية والخصوصية', desc: 'وثائقك وبياناتك لا تغادر قناة اتصال آمنة بينك وبين المكتب مباشرة.' },
              { title: 'متابعة حقيقية وليست وعوداً', desc: 'لا وعود فارغة. كل معاملة لها حالة، وكل حالة لها موعد، وكل موعد له مساءلة.' },
              { title: 'تعرف التكلفة قبل أن تبدأ', desc: 'نراجع طلبك، نؤكد إمكانية إنجازه، ونرسل لك التكلفة والمدة المتوقعة — قبل أي التزام أو دفع.' },
            ].map(p => (
              <div key={p.title} className="about-pillar">
                <div className="about-pillar-line" />
                <div className="about-pillar-content">
                  <h3 className="about-pillar-title">{p.title}</h3>
                  <p className="about-pillar-desc">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="about-right">
          <div className="about-stats-card">
            {/* "+18 سنة في الخدمة" removed — untrue for a new office. Both figures
                kept here are verifiable: the service count matches services_config,
                and document confidentiality is a policy we control, not a tenure claim. */}
            <div className="about-stat-row">
              <div className="about-stat-block"><span className="about-stat-num">+25</span><span className="about-stat-label">نوع خدمة</span></div>
              <div className="about-stat-divider" />
              <div className="about-stat-block"><span className="about-stat-num">100%</span><span className="about-stat-label">سرية المستندات</span></div>
            </div>
            <div className="about-stat-bar" />
            <div className="about-quote">
              <span className="about-quote-mark">"</span>
              <p className="about-quote-text">نحن لا نبيعك خدمة — نحمل عنك همّ المسافة.</p>
            </div>
            <div className="about-location-row">
              <span className="about-location-dot" />
              <span className="about-location-text">سطح مرحبا، رام الله، فلسطين</span>
            </div>
          </div>
          <div className="about-serve-card">
            <p className="about-serve-title">نخدم الفلسطينيين في</p>
            <div className="about-serve-tags">
              {['فلسطين','أوروبا','أمريكا','روسيا','مصر','تركيا','عمان','وكل دول العالم'].map(t => (
                <span key={t} className="serve-tag">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── CONTACT FORM ──────────────────────────────────────────── */
function ContactForm() {
  const [countryCode, setCountryCode] = useState('+970')
  const [phone, setPhone] = useState('')
  const [serviceData, setServiceData] = useState({ services: [], textFields: [], files: [] })
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState(null) // { type, msg }
  const [loading, setLoading] = useState(false)
  const [modalData, setModalData] = useState(null)

  const nameRef = useRef(); const idRef = useRef(); const locationRef = useRef()

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)

    try {
      const fullName = nameRef.current.value.trim()
      const idNumber = idRef.current.value.trim()
      const location = locationRef.current.value.trim()
      const cleanPhone = phone.replace(/^0+/, '')

      if (!fullName || !idNumber || !location || !cleanPhone)
        throw new Error('الرجاء تعبئة جميع الحقول المطلوبة')
      if (idNumber.length !== 9 || !/^\d{9}$/.test(idNumber))
        throw new Error('رقم الهوية يجب أن يكون 9 أرقام')
      if (!serviceData.services.length)
        throw new Error('الرجاء اختيار الخدمة المطلوبة')

      const validation = validatePhone(cleanPhone, countryCode)
      if (!validation.valid) throw new Error(validation.message)
      const fullPhone = countryCode + validation.phone

      setLoading(true)
      setStatus({ type: 'info', msg: 'جاري إرسال الطلب...' })

      const { requestId } = await submitRequest({
        payload: {
          fullName, idNumber, location,
          countryCode, whatsapp: fullPhone,
          notes, services: serviceData.services,
          textFields: serviceData.textFields,
        },
        selectedFiles: serviceData.files,
      })

      setStatus(null)
      setModalData({ customerName: fullName, identityNumber: idNumber, location, fullPhone, allServices: serviceData.services, requestId })

      // Auto reset after 8s
      setTimeout(() => {
        e.target.reset()
        setPhone(''); setCountryCode('+970'); setNotes('')
        setServiceData({ services: [], textFields: [], files: [] })
      }, 8000)

    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <section id="contact-builder" aria-labelledby="form-title">
        <div className="form-wrap">
          <div className="form-heading">
            <span className="section-badge">بوابة الطلبات</span>
            <h2 id="form-title" className="section-h2 form-section-h2">بوابة استقبال المستندات</h2>
            <p className="form-section-sub">يرجى تعبئة البيانات التالية لبدء تنفيذ معاملتكم. جميع البيانات محمية ومشفرة.</p>
          </div>
          <div className="form-card">
            <form id="submission-form" onSubmit={handleSubmit} noValidate>
              <div className="form-block-label"><span className="form-block-line" />المعلومات الشخصية</div>
              <div className="form-grid-2 mb-6">
                <div className="field-group">
                  <label className="field-label" htmlFor="wa-name">الاسم الكامل <span className="required-star">*</span></label>
                  <input ref={nameRef} type="text" id="wa-name" required autoComplete="name" placeholder="أدخل اسمك الكامل هنا" className="field-input" />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="id-number">رقم الهوية <span className="required-star">*</span></label>
                  <input
                    ref={idRef} type="text" id="id-number" inputMode="numeric" maxLength={9} required placeholder="9 أرقام" className="field-input"
                    onChange={e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 9) }}
                  />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label" htmlFor="wa-location">مكان الإقامة <span className="required-star">*</span></label>
                  <input ref={locationRef} type="text" id="wa-location" required autoComplete="country-name" placeholder="الدولة / المدينة" className="field-input" />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="wa-phone">رقم الواتساب <span className="required-star">*</span></label>
                  <div style={{ display: 'flex', alignItems: 'stretch', border: '1.5px solid #e2e8f0', borderRadius: '13px', overflow: 'hidden', background: '#f8fafc', direction: 'ltr', transition: 'all .25s' }}>
                    <CountryPicker value={countryCode} onChange={setCountryCode} />
                    <input
                      type="tel" id="wa-phone" required placeholder="7XXXXXXXX"
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, '').replace(/^0+/, ''))}
                      style={{ flex: 1, border: 'none', background: 'transparent', padding: '0.85rem 0.9rem', fontFamily: 'Tajawal, sans-serif', fontSize: '0.88rem', fontWeight: 700, outline: 'none', direction: 'ltr', color: '#1e293b', minWidth: 0 }}
                    />
                  </div>
                </div>
              </div>

              <div className="form-sep" />
              <div className="form-block-label"><span className="form-block-line" />الخدمة المطلوبة</div>

              <ServiceSelector onChange={setServiceData} />

              {serviceData.services.length > 0 && (
                <div className="field-group">
                  <label className="field-label" htmlFor="wa-notes">ملاحظات</label>
                  <textarea id="wa-notes" rows={4} className="field-input" placeholder="اكتب أي ملاحظات إضافية هنا (اختياري)" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              )}

              {status && (
                <div className={`status-msg ${status.type}`} role="alert" aria-live="polite">{status.msg}</div>
              )}

              <div className="form-submit-wrap">
                <button type="submit" id="submit-btn" className="submit-btn" disabled={loading}>
                  <span id="submit-label">{loading ? 'جاري الإرسال...' : 'ارسال الطلب للمكتب'}</span>
                </button>
                <p className="form-disclaimer">بياناتك محفوظة وآمنة. سيتواصل معك فريقنا عبر الواتساب فور استلام الطلب.</p>
              </div>
            </form>
          </div>
        </div>
      </section>

      <WAModal data={modalData} onClose={() => setModalData(null)} />
    </>
  )
}
