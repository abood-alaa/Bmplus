import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer id="site-footer" role="contentinfo">
      <div className="footer-glow" aria-hidden="true" />
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-col footer-col-brand">
            <div className="footer-logo-row">
              <img className="nav-logo-icon footer-logo-icon" src="/logo-white.png" alt="شعار بيت المقدس" />
              <span className="footer-brand-name">بيت المقدس</span>
            </div>
            <p className="footer-brand-desc">العنوان الأول في فلسطين لخدمات المعاملات الرسمية للفلسطينيين في الخارج.</p>
          </div>
          <div className="footer-col">
            <h3 className="footer-col-title">روابط سريعة</h3>
            <nav className="footer-nav" aria-label="روابط التذييل">
              <Link to="/" className="footer-nav-link">الصفحة الرئيسية</Link>
              <a href="/#about-us" className="footer-nav-link" onClick={e => { e.preventDefault(); document.getElementById('about-us')?.scrollIntoView({ behavior: 'smooth' }) }}>من نحن</a>
              <Link to="/blog" className="footer-nav-link">المدونة</Link>
              <a href="/#contact-builder" className="footer-nav-link" onClick={e => { e.preventDefault(); document.getElementById('contact-builder')?.scrollIntoView({ behavior: 'smooth' }) }}>تقديم طلب</a>
            </nav>
          </div>
          <div className="footer-col">
            <h3 className="footer-col-title">ساعات العمل</h3>
            <div className="footer-hours-card">
              <div className="footer-hours-row">
                <span className="footer-hours-days">السبت — الخميس</span>
                <span className="footer-hours-time">8:00 ص — 4:00 م</span>
              </div>
              <div className="footer-hours-row">
                <span className="footer-hours-days">الجمعة</span>
                <span className="footer-hours-closed">مغلق</span>
              </div>
            </div>
          </div>
          <div className="footer-col">
            <h3 className="footer-col-title">تواصل معنا</h3>
            <a href="tel:+972592112294" className="footer-phone" dir="ltr">059-211-2294</a>
            <a href="tel:+97222357937" className="footer-phone">هاتف أرضي: <span dir="ltr">02-235-7937</span></a>
            <a href="https://wa.me/972592112294" className="footer-whatsapp-link" target="_blank" rel="noopener noreferrer">واتساب مباشر</a>
            <a href="https://www.facebook.com/Ramallah.legal.services" className="footer-nav-link" target="_blank" rel="noopener noreferrer">فيسبوك</a>
            <p className="footer-address">سطح مرحبا، رام الله، فلسطين</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-copy">© 2026 بيت المقدس للخدمات العامة — جميع الحقوق محفوظة</p>
          <p className="footer-dev-credit">تم التطوير بواسطة <a href="https://novatrixdigital.com" className="footer-dev-link" target="_blank" rel="noopener noreferrer">NovaTrix Digital</a></p>
        </div>
      </div>
    </footer>
  )
}
