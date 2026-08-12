/**
 * data.js — Static data and field-level helpers
 *
 * Contains:
 *   favoriteCountries / allCountries  — phone country code lists
 *   getGraduationYears()              — dynamic year range for graduation year dropdowns
 *   getBloodTypes()                   — fixed blood type options
 *   serviceMap                        — maps a service key to its list of required fields
 *   getFieldAccept(label)             — returns the file input accept string for a given field label
 *   isFileAllowed(file, label)        — client-side MIME + size validation (mirrors server-side magic bytes check)
 *   validatePhone(phone, code)        — phone number format validation
 *
 * serviceMap field syntax:
 *   'text:LabelText'     → plain text input
 *   'select:LabelText'   → graduation year dropdown (getGraduationYears)
 *   'select2:LabelText'  → blood type dropdown (getBloodTypes)
 *   'Any other string'   → file upload field (label determines accept type via getFieldAccept)
 */

// Countries shown at the top of the phone code dropdown before the full alphabetical list.
export const favoriteCountries = [
  { name: 'فلسطين', code: '+970' },
  { name: 'فلسطين المحتلة', code: '+972' },
  { name: 'مصر', code: '+20' },
  { name: 'تركيا', code: '+90' },
  { name: 'ألمانيا', code: '+49' },
  { name: 'بلجيكا', code: '+32' },
]

export const allCountries = [
  { name: 'أفغانستان', code: '+93' },
  { name: 'ألبانيا', code: '+355' },
  { name: 'الجزائر', code: '+213' },
  { name: 'الأرجنتين', code: '+54' },
  { name: 'أرمينيا', code: '+374' },
  { name: 'أستراليا', code: '+61' },
  { name: 'النمسا', code: '+43' },
  { name: 'أذربيجان', code: '+994' },
  { name: 'البحرين', code: '+973' },
  { name: 'بنغلاديش', code: '+880' },
  { name: 'بلجيكا', code: '+32' },
  { name: 'البوسنة', code: '+387' },
  { name: 'البرازيل', code: '+55' },
  { name: 'كندا', code: '+1' },
  { name: 'تشيلي', code: '+56' },
  { name: 'الصين', code: '+86' },
  { name: 'كولومبيا', code: '+57' },
  { name: 'كرواتيا', code: '+385' },
  { name: 'قبرص', code: '+357' },
  { name: 'التشيك', code: '+420' },
  { name: 'الدنمارك', code: '+45' },
  { name: 'مصر', code: '+20' },
  { name: 'إثيوبيا', code: '+251' },
  { name: 'فنلندا', code: '+358' },
  { name: 'فرنسا', code: '+33' },
  { name: 'جورجيا', code: '+995' },
  { name: 'ألمانيا', code: '+49' },
  { name: 'غانا', code: '+233' },
  { name: 'اليونان', code: '+30' },
  { name: 'المجر', code: '+36' },
  { name: 'الهند', code: '+91' },
  { name: 'إندونيسيا', code: '+62' },
  { name: 'إيران', code: '+98' },
  { name: 'العراق', code: '+964' },
  { name: 'أيرلندا', code: '+353' },
  { name: 'إيطاليا', code: '+39' },
  { name: 'اليابان', code: '+81' },
  { name: 'الأردن', code: '+962' },
  { name: 'كازاخستان', code: '+7' },
  { name: 'كينيا', code: '+254' },
  { name: 'كوريا الجنوبية', code: '+82' },
  { name: 'الكويت', code: '+965' },
  { name: 'لبنان', code: '+961' },
  { name: 'ليبيا', code: '+218' },
  { name: 'ليتوانيا', code: '+370' },
  { name: 'ماليزيا', code: '+60' },
  { name: 'المغرب', code: '+212' },
  { name: 'هولندا', code: '+31' },
  { name: 'نيوزيلندا', code: '+64' },
  { name: 'نيجيريا', code: '+234' },
  { name: 'النرويج', code: '+47' },
  { name: 'عُمان', code: '+968' },
  { name: 'باكستان', code: '+92' },
  { name: 'فلسطين', code: '+970' },
  { name: 'فلسطين المحتلة', code: '+972' },
  { name: 'الفلبين', code: '+63' },
  { name: 'بولندا', code: '+48' },
  { name: 'البرتغال', code: '+351' },
  { name: 'قطر', code: '+974' },
  { name: 'رومانيا', code: '+40' },
  { name: 'روسيا', code: '+7' },
  { name: 'المملكة العربية السعودية', code: '+966' },
  { name: 'السنغال', code: '+221' },
  { name: 'صربيا', code: '+381' },
  { name: 'سنغافورة', code: '+65' },
  { name: 'جنوب أفريقيا', code: '+27' },
  { name: 'إسبانيا', code: '+34' },
  { name: 'السويد', code: '+46' },
  { name: 'سويسرا', code: '+41' },
  { name: 'سوريا', code: '+963' },
  { name: 'تايلاند', code: '+66' },
  { name: 'تونس', code: '+216' },
  { name: 'تركيا', code: '+90' },
  { name: 'أوكرانيا', code: '+380' },
  { name: 'الإمارات', code: '+971' },
  { name: 'المملكة المتحدة', code: '+44' },
  { name: 'الولايات المتحدة', code: '+1' },
  { name: 'أوزبكستان', code: '+998' },
  { name: 'اليمن', code: '+967' },
].sort((a, b) => a.name.localeCompare(b.name, 'ar'))

// Generates school year strings like "2025/2026" from the current year back to 1994.
export const getGraduationYears = () => {
  const years = []
  const current = new Date().getFullYear()
  for (let i = current; i >= 1994; i--) years.push(`${i}/${i + 1}`)
  return years
}

export const getBloodTypes = () => ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

// Maps a service key (usually the subservice or primary value) to its required fields.
// Field string syntax: see module-level JSDoc above.
// Adding a new service: add an entry here AND add the same value to services_config in server.js seed.
export const serviceMap = {
  'بيان العائلي':                      ['صورة هوية الأب والأم مع السليب', 'صورة عقد الزواج'],
  'حسن سيره وسلوك':                    ['صورة جواز السفر', 'صورة شخصية حديثة', 'text:سبب التقديم والدولة'],
  'سليب الهوية':                       ['صورة هوية الأب والأم', 'عقد الزواج', 'شهادات ميلاد الأولاد'],
  'تغيير الحالة الاجتماعية':           ['عقد زواج مصدق', 'هوية الزوج والزوجة'],
  'عدم المحكومية':                     ['صورة الهوية أو الجواز'],
  'تصديق وكالات خاصه':                ['نسخة سكنر عن الوكالة'],
  'خلو الامراض':                       ['نسخة سكنر عن التقرير الطبي'],
  'رخصة سواقة رام الله':              ['صورة شخصية', 'صورة جواز السفر', 'صورة الرخصة', 'select2:فصيلة الدم'],
  'أفادة رخصة':                        ['صورة الرخصة', 'صورة الجواز'],
  'رخصة دولية':                        ['صورة شخصية', 'صورة الجواز', 'صورة رخصة القيادة'],
  'استلام مزاولات من صحة':             ['صورة هوية صاحب المعاملة'],
  'تصديق الخارجية بدون الاستخراج':    ['صورة الورقة المراد تصديقها'],
  'ترجمات قانونية معتمدة':             ['صورة الورقة المراد ترجمتها', 'text:اللغة المطلوبة'],
  'ادخال ملفات لجميع السفارات':       ['صورة الجواز', 'المستندات الداعمة'],
  'بريد دولي ومحلي':                  ['صورة الهوية', 'text:وصف المحتوى والدولة'],
  'معاملات لم الشمل':                 ['صورة جواز السفر', 'text:اسم صاحب الملف الأوروبي', 'text:الدولة المقصودة'],
  'جواز سفر للخارج':                  ['صورة الهوية الشخصية', 'صورة آخر جواز سفر (إن وجد)', 'text:الدولة المقصودة'],
  'شهادة ثانوية عامة':                ['صورة الهوية', 'select:سنة التخرج'],
  'شهادة كرتون':                      ['صورة الهوية', 'select:سنة التخرج'],
  'شهادة مدرسية':                     ['صورة الهوية', 'text:اسم المدرسة وسنة الدراسة', 'text:المديرية'],
  'شهادة جامعية':                     ['ملف الشهادة (نسخة PDF من الجامعة)'],
  'شهادة ميلاد':                      ['صورة عن شهادة الميلاد أو الهوية'],
  'شهادة وفاة':                       ['صورة عن شهادة الوفاة أو الهوية'],
  'شهادة زواج':                       ['عقد الزواج', 'صورة هوية الزوج', 'صورة هوية الزوجة'],
  'استخراج عقد زواج':                 ['صورة سكانر عن عقد الزواج'],
  'معاملات كتب الكتاب':               ['وكالة الزوجين', 'فحص ثلاسيميا', 'موافقة ولي أمر'],
  'معاملات حجة العزوبية':             ['صورة الهوية مع السليب'],
  'معاملات الطلاق':                   ['وكالة الزوجين', 'عقد الزواج'],
  'تصديق حصر الإرث':                 ['وكالة الزوجين', 'عقد الزواج'],
}

// Returns the correct file input `accept` attribute value for a given field label.
// Fields with "ملف" or "PDF" in the label accept PDF only; all others accept images.
// This is enforced again server-side via magic bytes validation.
export function getFieldAccept(label) {
  if (label && (label.includes('ملف') || label.toUpperCase().includes('PDF'))) {
    return 'application/pdf'
  }
  return 'image/jpeg,image/png'
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

// Client-side MIME type and size validation.
// Returns { ok: true } or { ok: false, reason: string }.
// The server performs an independent magic bytes check — this is just early UX feedback.
export function isFileAllowed(file, label) {
  const accept = getFieldAccept(label)
  const isPDF = accept === 'application/pdf'

  const allowedMimes = isPDF
    ? ['application/pdf']
    : ['image/jpeg', 'image/png']

  if (!allowedMimes.includes(file.type)) {
    const desc = isPDF ? 'PDF فقط' : 'صور JPG/PNG فقط'
    return { ok: false, reason: `نوع الملف "${file.name}" غير مسموح. المطلوب: ${desc}` }
  }
  if (file.size > MAX_FILE_SIZE)
    return { ok: false, reason: `الملف "${file.name}" أكبر من 10 ميغابايت.` }
  return { ok: true }
}

// Validates a phone number given the country calling code.
// Strips leading zeros before checking length.
// Palestinian (+970/+966) numbers must be exactly 9 digits.
export function validatePhone(phone, code) {
  phone = phone.replace(/^0+/, '')
  if (!/^\d+$/.test(phone)) return { valid: false, message: 'رقم الهاتف يجب أن يحتوي على أرقام فقط' }
  const prefix = code.replace('+', '')
  if ((prefix === '970' || prefix === '966') && phone.length !== 9)
    return { valid: false, message: 'رقم الهاتف يجب أن يكون 9 أرقام بدون مفتاح الدولة' }
  if (phone.length < 7 || phone.length > 12)
    return { valid: false, message: 'رقم الهاتف غير صالح (7-12 رقم)' }
  return { valid: true, phone }
}
