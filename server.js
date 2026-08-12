/**
 * server.js — Express backend for Bayt Al-Maqdis General Services
 *
 * Architecture:
 *   - CommonJS module (require) — cPanel's Phusion Passenger loads the file named in
 *     package.json "main" via require() and needs app.listen() to be called
 *     synchronously during load, so this file is CommonJS, NOT an ES module, and does
 *     NOT use top-level await. (The migration scripts remain ESM as *.mjs.)
 *   - MySQL via mysql2/promise (async, connection pooling — no native compilation)
 *   - Files stored locally in data/uploads/ (served as static via /uploads)
 *   - Email sent via SMTP on each new submission (nodemailer)
 *   - Admin authentication: real server-side sessions (admin_sessions table). Login
 *     issues a random 256-bit token; only its SHA-256 hash is stored server-side.
 *     Sessions slide forward on each authenticated request (30-minute idle timeout)
 *     and can be revoked via POST /api/admin/logout. Login is rate-limited per-IP
 *     with a hard lockout (admin_login_attempts table) after 3 consecutive failures
 *     within 15 minutes.
 *   - File security: MIME type whitelist + magic bytes validation on every upload
 *
 * Environment variables — see .env.example for the full documented list. None of the
 * secrets below (ADMIN_PASSWORD, DB_PASS, SMTP_PASS) have a built-in
 * fallback value: a missing required secret fails loudly (console.error + the
 * affected feature disabled) instead of silently running with a known/guessable
 * default.
 *   ADMIN_PASSWORD   — admin panel password (required — no fallback)
 *   ADMIN_EMAIL      — email address(es) that receive new order notifications (comma-separated)
 *   BASE_URL         — public base URL used to build file links in emails / default CORS origin
 *   ALLOWED_ORIGINS  — comma-separated CORS allowlist (defaults to BASE_URL)
 *   SMTP_HOST        — SMTP server host (default: mail.bmexpress.co)
 *   SMTP_PORT        — SMTP server port (default: 465)
 *   SMTP_USER        — SMTP auth username (default: noreply@bmexpress.co)
 *   SMTP_PASS        — SMTP auth password (required for email; no fallback — email
 *                       sending is skipped, not fatal, when unset)
 *   DB_HOST          — MySQL host (default: localhost)
 *   DB_USER          — MySQL username (required — no fallback)
 *   DB_PASS          — MySQL password (required — no fallback)
 *   DB_NAME          — MySQL database name (required — no fallback)
 *   PORT             — HTTP port (default 3000; Passenger overrides via its own socket)
 */

require('dotenv').config()

const express     = require('express')
const cors        = require('cors')
const helmet      = require('helmet')
const compression = require('compression')
const rateLimit   = require('express-rate-limit')
const nodemailer  = require('nodemailer')
const multer      = require('multer')
const path        = require('path')
const fs          = require('fs')
const crypto      = require('crypto')
const mysql       = require('mysql2/promise')

// __dirname and __filename are provided natively in CommonJS.

// ─── Puppeteer (optional — PDF generation only) ───────────────────────────────
let puppeteer = null
try { puppeteer = require('puppeteer-core') } catch { /* unavailable */ }

const CHROMIUM_EXEC = puppeteer ? [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
].find(p => { try { return fs.existsSync(p) } catch { return false } }) : null

const app = express()

// Behind Apache/Passenger — trust one proxy hop so req.ip / rate-limiting see the
// real client address from X-Forwarded-For.
app.set('trust proxy', 1)
app.disable('x-powered-by')

// Security headers.
// CSP is disabled (contentSecurityPolicy: false) — this is a deliberate tradeoff, not
// an oversight: the admin blog CMS (BlogEditor in AdminPage.jsx) stores raw HTML/CSS
// that's later rendered via dangerouslySetInnerHTML on public blog pages, and helmet's
// default CSP would block that. Per security review, helmet's *default* CSP (script-src
// 'self', style-src already allows 'unsafe-inline') would likely keep the CMS working
// while blocking the actual dangerous vector (inline <script>/event-handler attributes)
// — but this needs the site owner's sign-off (a policy tradeoff) plus a check that the
// JSON-LD structured-data <script> in bmplus-react/index.html isn't blocked, so it is
// NOT applied here; left as a documented follow-up.
// crossOriginResourcePolicy is left at helmet's default (same-origin) globally; the
// relaxed 'cross-origin' policy needed for embedding uploaded images/PDFs is scoped to
// just the /uploads route below instead of every response.
app.use(helmet({
  contentSecurityPolicy: false,
}))

// gzip responses (big win for the React JS/CSS bundle and JSON payloads).
app.use(compression())

// Lock CORS to the site's own origin(s). The frontend is same-origin, so this only
// blocks rogue cross-origin callers hitting the API. Falls back to a non-functional
// localhost origin (not a real domain) when unconfigured, so a missing env var fails
// closed (blocks the real frontend, loudly) instead of silently trusting the wrong domain.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.BASE_URL || 'http://localhost:3000')
  .split(',').map(s => s.trim()).filter(Boolean)
if (!process.env.ALLOWED_ORIGINS && !process.env.BASE_URL)
  console.warn('⚠ ALLOWED_ORIGINS/BASE_URL are not set — CORS defaults to a non-functional localhost origin. Set ALLOWED_ORIGINS (or BASE_URL) to the real production domain.')
app.use(cors({
  origin: (origin, cb) => (!origin || ALLOWED_ORIGINS.includes(origin))
    ? cb(null, true)
    : cb(new Error('CORS: origin not allowed')),
}))

// Blog content (html_content/css_content) can be large, so allow a generous body.
app.use(express.json({ limit: '5mb' }))

// ─── Config ───────────────────────────────────────────────────────────────────
// No built-in fallback values for real secrets — these previously fell back to real,
// now-leaked credentials committed to git history. A missing required secret must
// fail loudly, never silently accept a known/guessable value.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null
// Recipient(s) for new-order notifications. Comma-separated for multiple addresses.
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@example.com'
const BASE_URL       = process.env.BASE_URL       || 'http://localhost:3000'
const SMTP_PASS      = process.env.SMTP_PASS      || ''

// The admin panel is disabled (routes return 503) until ADMIN_PASSWORD is set.
// Session tokens are random (crypto.randomBytes) and looked up by hash in the
// admin_sessions table, so — unlike the old deterministic-HMAC scheme this replaced —
// no signing secret is needed at all; nothing here is sensitive to Passenger's
// frequent worker idle-respawns since session state lives in MySQL, not in memory.
const ADMIN_CONFIGURED = Boolean(ADMIN_PASSWORD)

if (!ADMIN_PASSWORD) console.error('✗ CRITICAL: ADMIN_PASSWORD is not set. The admin panel is disabled until this is configured as an environment variable in the cPanel Node.js App page.')
if (!process.env.DB_USER) console.error('✗ CRITICAL: DB_USER is not set. Database connection will fail until this is configured as an environment variable in the cPanel Node.js App page.')
if (!process.env.DB_PASS) console.error('✗ CRITICAL: DB_PASS is not set. Database connection will fail until this is configured as an environment variable in the cPanel Node.js App page.')
if (!process.env.DB_NAME) console.error('✗ CRITICAL: DB_NAME is not set. Database connection will fail until this is configured as an environment variable in the cPanel Node.js App page.')
if (!SMTP_PASS)      console.warn('⚠ SMTP_PASS is not set — order notification emails will be skipped. Order submission itself is unaffected.')
if (!process.env.BASE_URL) console.warn('⚠ BASE_URL is not set — using a non-functional localhost default. File links in notification emails will be wrong until this is set.')

// ─── Admin Auth ───────────────────────────────────────────────────────────────
// Real server-side sessions, replacing the old deterministic-HMAC token. Login
// issues crypto.randomBytes(32) as the raw token; only SHA-256(token) is ever
// stored (in admin_sessions.token_hash) or logged — the raw value exists only in
// the login response body and the client's Authorization header on each request.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}
// Constant-time comparison (hash first so inputs are fixed length) to avoid timing
// side-channels when checking the submitted password against ADMIN_PASSWORD.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}
// Looks up the session by hashed token and, in the same atomic UPDATE, slides the
// 30-minute idle expiry forward — an actively-used session never expires mid-task,
// only 30 minutes of inactivity ends it. affectedRows !== 1 covers "no such session",
// "already expired", and "token missing/malformed" with a single query and one
// consistent 401, so a stale/expired token can't be distinguished from a bad one
// (nothing useful would come from letting a client tell those apart).
async function requireAdmin(req, res, next) {
  if (!ADMIN_CONFIGURED) return res.status(503).json({ error: 'الإعداد غير مكتمل. الرجاء التواصل مع المسؤول.' })
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'غير مصرح' })
  const [result] = await pool.execute(
    'UPDATE admin_sessions SET last_seen_at=NOW(), expires_at=NOW()+INTERVAL 30 MINUTE WHERE token_hash=? AND expires_at>NOW()',
    [hashToken(auth.slice(7))]
  )
  if (result.affectedRows !== 1) return res.status(401).json({ error: 'انتهت صلاحية الجلسة. الرجاء تسجيل الدخول مرة أخرى.' })
  next()
}

// ─── Rate limiters ────────────────────────────────────────────────────────────
// Coarse per-IP request-rate ceiling — defense in depth alongside (not instead of)
// the precise 3-strikes/15-minute lockout implemented inside the login route itself
// (admin_login_attempts table, see POST /api/admin/login below).
const loginLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'محاولات كثيرة جداً. الرجاء المحاولة لاحقاً.' } })
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'محاولات كثيرة جداً. الرجاء المحاولة لاحقاً.' } })
// Logout is deliberately unauthenticated (it must work with an already-invalid
// token), but it still performs a DB write per call — without a limiter anyone
// could drive DELETE-by-hash queries at line rate.
const logoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'محاولات كثيرة جداً. الرجاء المحاولة لاحقاً.' } })
// Each PDF request launches a full Chromium process. Even behind requireAdmin a
// single session must not be able to spawn them without bound on shared hosting.
const pdfLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'محاولات كثيرة جداً لإنشاء PDF. الرجاء المحاولة لاحقاً.' } })

// ─── MySQL Pool ───────────────────────────────────────────────────────────────
// Test seam: the suite assigns a stub pool to this global before requiring this
// file, so route logic (auth gating, lockout arithmetic, field scoping, rollback
// ordering) can be tested without a live MySQL — see test/helpers/app.js. This
// is a plain `require()` of a CommonJS module, which module mocking can't
// intercept, hence the explicit hook. Nothing outside the test suite ever sets
// this global, so production always takes the createPool() branch.
const pool = globalThis.__BM_PLUS_TEST_POOL__ || mysql.createPool({
  host:               process.env.DB_HOST || 'localhost', // not a secret — safe generic default
  user:               process.env.DB_USER,
  password:           process.env.DB_PASS,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  charset:            'utf8mb4',
})

// ─── Database Schema ──────────────────────────────────────────────────────────
// This repo has no migration tool by design — schema lives in CREATE TABLE IF
// NOT EXISTS statements below. That covers new installs, but cannot add an index
// to a table that already exists, so index changes go through this helper: it
// checks information_schema first and is therefore safe to re-run every boot.
async function ensureIndex(table, indexName, columns) {
  try {
    const [[{ n }]] = await pool.execute(
      `SELECT COUNT(*) AS n FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [table, indexName]
    )
    if (Number(n) === 0) {
      await pool.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`)
      console.log(`✓ Added index ${indexName} on ${table}`)
    }
  } catch (e) {
    // Never fatal: a missing index degrades performance, it doesn't break the app.
    console.error(`Could not ensure index ${indexName} on ${table}:`, e.message)
  }
}

async function initDB() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS form_requests (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      full_name       VARCHAR(255) NOT NULL,
      id_number       VARCHAR(50)  NOT NULL,
      location        VARCHAR(255) NOT NULL,
      country_code    VARCHAR(10)  DEFAULT '+970',
      whatsapp_number VARCHAR(50)  NOT NULL DEFAULT '',
      notes           TEXT,
      status          ENUM('new','in_progress','done') DEFAULT 'new',
      price           VARCHAR(50)  DEFAULT '',
      price_note      TEXT,
      has_shipping    TINYINT(1)   DEFAULT 0,
      shipping_cost   VARCHAR(50)  DEFAULT '',
      created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4
  `)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS request_services (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      form_request_id INT NOT NULL,
      service_name    VARCHAR(255) NOT NULL,
      sort_order      INT DEFAULT 0,
      FOREIGN KEY (form_request_id) REFERENCES form_requests(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4
  `)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS request_text_fields (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      form_request_id INT NOT NULL,
      label           VARCHAR(255) NOT NULL,
      value           TEXT NOT NULL,
      FOREIGN KEY (form_request_id) REFERENCES form_requests(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4
  `)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS request_files (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      form_request_id INT NOT NULL,
      label           VARCHAR(255) DEFAULT '',
      file_name       VARCHAR(255) DEFAULT '',
      file_type       VARCHAR(100) DEFAULT '',
      file_path       VARCHAR(500) DEFAULT '',
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (form_request_id) REFERENCES form_requests(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4
  `)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS blog_articles (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      title        VARCHAR(500)  NOT NULL,
      slug         VARCHAR(500)  NOT NULL UNIQUE,
      category     VARCHAR(255)  DEFAULT '',
      excerpt      TEXT,
      html_content LONGTEXT,
      css_content  LONGTEXT,
      is_published TINYINT(1)   DEFAULT 1,
      created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4
  `)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS services_config (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      type         VARCHAR(50)  NOT NULL DEFAULT 'primary',
      parent_value VARCHAR(255) DEFAULT '',
      value        VARCHAR(255) NOT NULL,
      label        VARCHAR(255) NOT NULL,
      is_enabled   TINYINT(1)  DEFAULT 1,
      sort_order   INT         DEFAULT 0
    ) CHARACTER SET utf8mb4
  `)
  // Server-side admin sessions. Only the SHA-256 hash of the session token is ever
  // stored (see hashToken() above) — the raw token exists only client-side and in
  // the one-time login response. expires_at is deliberately NOT indexed: it's
  // updated on every authenticated admin request (sliding 30-min idle expiry), and
  // at this app's scale (single admin, a handful of concurrent sessions) the write
  // amplification of keeping an index in sync on every request outweighs the benefit
  // to the occasional cleanup DELETE in POST /api/admin/login.
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      token_hash   CHAR(64)  NOT NULL UNIQUE,
      created_at   DATETIME  DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME  DEFAULT CURRENT_TIMESTAMP,
      expires_at   DATETIME  NOT NULL
    ) CHARACTER SET utf8mb4
  `)
  // Per-IP login attempt log, used to lock out after 3 consecutive failures within
  // 15 minutes (see POST /api/admin/login). Indexed on (ip, attempted_at) since
  // every login checks "recent attempts for this IP" — the one non-PK/non-UNIQUE
  // index in this schema, added because that query runs on every login attempt
  // (unlike the admin_sessions cleanup DELETE above, which is infrequent).
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      ip           VARCHAR(45) NOT NULL,
      attempted_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
      success      TINYINT(1)  NOT NULL DEFAULT 0,
      INDEX idx_admin_login_attempts_ip_time (ip, attempted_at)
    ) CHARACTER SET utf8mb4
  `)

  // form_requests is the only table here that grows without bound, and every
  // admin list query sorts by created_at (see GET /api/admin/orders). The other
  // tables deliberately stay PK/UNIQUE-only — they're small enough that a scan
  // beats an index. `CREATE TABLE IF NOT EXISTS` above can't add an index to an
  // already-existing table, so this is applied separately and idempotently.
  await ensureIndex('form_requests', 'idx_form_requests_created', 'created_at')

  // Seed services on first run
  const [[{ cnt }]] = await pool.execute('SELECT COUNT(*) as cnt FROM services_config')
  if (Number(cnt) === 0) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const ins = 'INSERT INTO services_config (type,parent_value,value,label,sort_order) VALUES (?,?,?,?,?)'
      const primary = [
        ['شهادة','استخراج شهادة تعليمية'],['شهادة ميلاد','استخراج شهادة ميلاد'],
        ['شهادة وفاة','استخراج شهادة وفاة'],['شهادة زواج','استخراج شهادة زواج'],
        ['معاملات لم الشمل','معاملات لم الشمل'],['جواز سفر للخارج','اصدار جواز سفر'],
        ['بيان العائلي','استخراج بيان عائلي'],['حسن سيره وسلوك','استخراج شهادة حسن سيرة وسلوك'],
        ['سليب الهوية','استخراج سليب الهوية'],['تغيير الحالة الاجتماعية','تغيير الحالة الاجتماعية'],
        ['معاملات المحمكة الشرعية','معاملات المحمكة الشرعية'],['عدم المحكومية','عدم المحكومية'],
        ['تصديق وكالات خاصه','تصديق وكالات خاصة'],['خلو الامراض','خلو الأمراض'],
        ['رخصة سواقة رام الله','رخصة سواقة رام الله'],['أفادة رخصة','إفادة رخصة'],
        ['رخصة دولية','رخصة دولية'],['استلام مزاولات من صحة','استلام مزاولات من صحة'],
        ['تصديق الخارجية بدون الاستخراج','تصديق الخارجية بدون الاستخراج'],
        ['ترجمات قانونية معتمدة','ترجمات قانونية معتمدة'],
        ['ادخال ملفات لجميع السفارات','ادخال ملفات لجميع السفارات'],
        ['بريد دولي ومحلي','بريد دولي ومحلي'],
      ]
      for (let i = 0; i < primary.length; i++)
        await conn.execute(ins, ['primary', '', primary[i][0], primary[i][1], i])

      const subs = [['شهادة ثانوية عامة','شهادة ثانوية عامة'],['شهادة كرتون','شهادة كرتون'],['شهادة مدرسية','شهادة مدرسية'],['شهادة جامعية','شهادة جامعية']]
      for (let i = 0; i < subs.length; i++)
        await conn.execute(ins, ['sub', 'شهادة', subs[i][0], subs[i][1], i])

      const branches = ['علمي','أدبي','ريادي','صناعي','شرعي']
      for (let i = 0; i < branches.length; i++)
        await conn.execute(ins, ['branch', 'شهادة ثانوية عامة', branches[i], branches[i], i])

      const court = [['استخراج عقد زواج','استخراج عقد زواج'],['تصديق حصر الإرث','تصديق حصر الإرث'],['معاملات كتب الكتاب','معاملات كتب الكتاب'],['معاملات حجة العزوبية','معاملات حجة العزوبية'],['معاملات الطلاق','معاملات الطلاق']]
      for (let i = 0; i < court.length; i++)
        await conn.execute(ins, ['court', 'معاملات المحمكة الشرعية', court[i][0], court[i][1], i])

      await conn.commit()
      console.log('✓ Services seeded')
    } catch (e) {
      await conn.rollback()
      console.error('Seed failed:', e.message)
    } finally {
      conn.release()
    }
  }
  console.log('✓ Database ready (MySQL)')
}

// Initialise the database in the background. We do NOT await here: Passenger needs
// app.listen() to run synchronously during module load. All CREATE TABLE statements
// use IF NOT EXISTS (idempotent), so this is safe to run on every boot.
//
// It is retried with backoff because a single failed attempt used to leave the app
// running permanently against a database whose schema was never created — every
// request then 500s with ER_NO_SUCH_TABLE until someone manually restarts. That is a
// realistic failure here, not a theoretical one: Passenger idle-respawns workers
// frequently on this host, and MySQL can refuse or drop the very first connection
// while it is still starting up (observed: "Connection lost: The server closed the
// connection" against a MySQL that had only just begun accepting connections).
//
// Deliberately does NOT exit the process on failure — Passenger needs the listener to
// stay up, and the app can still serve the static SPA while the database is unreachable.
const DB_INIT_MAX_ATTEMPTS = 10
let dbReady = false

async function initDBWithRetry() {
  for (let attempt = 1; attempt <= DB_INIT_MAX_ATTEMPTS; attempt++) {
    try {
      await initDB()
      dbReady = true
      return
    } catch (e) {
      // 1s, 2s, 4s, 8s, then capped at 15s — ~2 minutes total, which comfortably
      // covers a MySQL restart without hammering a server that is genuinely down.
      const delay = Math.min(15000, 1000 * 2 ** (attempt - 1))
      console.error(`initDB attempt ${attempt}/${DB_INIT_MAX_ATTEMPTS} failed: ${e.message}` +
        (attempt < DB_INIT_MAX_ATTEMPTS ? ` — retrying in ${delay / 1000}s` : ''))
      if (attempt < DB_INIT_MAX_ATTEMPTS) await new Promise(r => setTimeout(r, delay))
    }
  }
  console.error('✗ CRITICAL: database schema could not be initialised after ' +
    `${DB_INIT_MAX_ATTEMPTS} attempts. The API will return errors until the database is ` +
    'reachable and the app is restarted (touch tmp/restart.txt).')
}

initDBWithRetry()

// ─── Uploads directory ────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

// ─── SMTP ─────────────────────────────────────────────────────────────────────
// Defaults point at the noreply@bmexpress.co mailbox using standard cPanel mail
// hosting convention (mail.<domain>, port 465, implicit TLS) — all overridable via
// env for whenever the mailbox is actually provisioned. SMTP_PASS has no fallback;
// sendEmail() below skips sending (without blocking order submission) while unset.
const SMTP_HOST   = process.env.SMTP_HOST || 'mail.bmexpress.co'
const SMTP_PORT   = Number(process.env.SMTP_PORT || 465)
const SMTP_USER   = process.env.SMTP_USER || 'noreply@bmexpress.co'
const SMTP_SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : SMTP_PORT === 465
const transporter = nodemailer.createTransport({
  host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  // Certificate validation is ON by default. Cheap shared-hosting mail certs
  // sometimes don't validate cleanly (CN mismatch) — only set
  // SMTP_TLS_REJECT_UNAUTHORIZED=false if verified necessary via test-smtp.mjs,
  // and prefer fixing the cert/hostname first.
  tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' },
})

// ─── File Security ────────────────────────────────────────────────────────────
const MAGIC = {
  'image/jpeg': [0xFF,0xD8,0xFF],
  'image/png':  [0x89,0x50,0x4E,0x47],
  'application/pdf': [0x25,0x50,0x44,0x46],
}
function checkMagic(buf, mime) {
  const sig = MAGIC[mime]
  return sig ? sig.every((b, i) => buf[i] === b) : false
}

// multer/busboy decodes the filename out of the multipart Content-Disposition
// header as latin1, so a UTF-8 filename arrives with each byte reinterpreted as
// a separate character — "هوية.jpg" becomes "ÙÙÙØ©.jpg". Nearly every file this
// office receives is named in Arabic, and the original filename is shown to the
// admin on the order detail view, so it has to be re-decoded.
// Only the *filename* is affected: ordinary form fields (file_labels) and the
// JSON payload are already correct UTF-8.
function decodeUploadName(name) {
  const raw = String(name || '')
  try {
    const fixed = Buffer.from(raw, 'latin1').toString('utf8')
    // A mis-decode round-trips to U+FFFD; if that happens the name wasn't
    // latin1-mangled UTF-8 (e.g. a plain ASCII name), so keep it as-is.
    return fixed.includes('�') ? raw : fixed
  } catch {
    return raw
  }
}

// ─── Multer ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg','image/png','application/pdf'].includes(file.mimetype)
    cb(ok ? null : new Error(`نوع الملف غير مسموح: ${decodeUploadName(file.originalname)}`), ok)
  },
})

// ─── Static files ─────────────────────────────────────────────────────────────
// Relaxed cross-origin resource policy, scoped to just this route, so uploaded
// images/PDFs can be embedded/opened cross-origin (e.g. from an emailed link).
app.use('/uploads', helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }), express.static(UPLOADS_DIR, { maxAge: '7d', immutable: true }))

// ─── Public: Submit ───────────────────────────────────────────────────────────
// Length caps are defense-in-depth: they bound how much attacker-controlled text can
// flow into places that render it as HTML (order-notification email via esc(), and the
// admin invoice template via the frontend's escHtml()) or get stored in fixed-width DB
// columns — the primary XSS defense is output-side escaping at each render site, not
// these caps, but keeping payload sizes sane costs nothing.
const FIELD_MAX = { fullName: 255, idNumber: 50, location: 255, whatsapp: 50, notes: 5000, serviceName: 255, textLabel: 255, textValue: 2000 }
// Bounds the worst-case memory multer buffers per request (memoryStorage holds every
// file in RAM until written to disk) without restricting realistic multi-service
// submissions — see ServiceSelector.jsx, which allows adding several services (each
// with a few file fields) to one submission.
const MAX_TOTAL_UPLOAD_BYTES = 60 * 1024 * 1024

app.post('/api/submit', submitLimiter, upload.array('files', 20), async (req, res) => {
  const conn = await pool.getConnection()
  // Declared outside the try so the catch block can clean these up — fs writes are
  // not covered by the DB transaction's rollback.
  const writtenPaths = []
  try {
    let data
    try { data = JSON.parse(req.body.data) } catch { return res.status(400).json({ error: 'بيانات غير صالحة' }) }
    const { fullName, idNumber, location, countryCode, whatsapp, notes, services, textFields } = data
    if (!fullName || !idNumber || !location || !whatsapp)
      return res.status(400).json({ error: 'الرجاء تعبئة جميع الحقول المطلوبة' })
    if (String(fullName).length > FIELD_MAX.fullName || String(idNumber).length > FIELD_MAX.idNumber ||
        String(location).length > FIELD_MAX.location || String(whatsapp).length > FIELD_MAX.whatsapp ||
        (notes && String(notes).length > FIELD_MAX.notes) ||
        (services || []).some(s => String(s).length > FIELD_MAX.serviceName) ||
        (textFields || []).some(({ label, value }) => String(label || '').length > FIELD_MAX.textLabel || String(value || '').length > FIELD_MAX.textValue))
      return res.status(400).json({ error: 'أحد الحقول طويل جداً' })
    const totalUploadBytes = (req.files || []).reduce((sum, f) => sum + f.buffer.length, 0)
    if (totalUploadBytes > MAX_TOTAL_UPLOAD_BYTES)
      return res.status(400).json({ error: 'الحجم الإجمالي للملفات المرفقة كبير جداً' })
    const fileLabels = req.body.file_labels
      ? (Array.isArray(req.body.file_labels) ? req.body.file_labels : [req.body.file_labels]) : []

    await conn.beginTransaction()
    const [ins] = await conn.execute(
      'INSERT INTO form_requests (full_name,id_number,location,country_code,whatsapp_number,notes) VALUES (?,?,?,?,?,?)',
      [fullName, idNumber, location, countryCode||'+970', whatsapp, notes||'']
    )
    const requestId = ins.insertId

    if (services?.length)
      for (let i = 0; i < services.length; i++)
        await conn.execute('INSERT INTO request_services (form_request_id,service_name,sort_order) VALUES (?,?,?)', [requestId, services[i], i])

    if (textFields?.length)
      for (const { label, value } of textFields)
        await conn.execute('INSERT INTO request_text_fields (form_request_id,label,value) VALUES (?,?,?)', [requestId, label, value])

    const savedFiles = []
    // Files rejected by the magic-byte check are reported back to the caller rather
    // than silently dropped: previously the order succeeded, the attachment vanished,
    // and the customer was never told which one (or that anything was missing).
    const rejectedFiles = []
    if (req.files?.length) {
      for (let i = 0; i < req.files.length; i++) {
        const f = req.files[i]
        const originalName = decodeUploadName(f.originalname)
        const label = fileLabels[i] || originalName
        if (!checkMagic(f.buffer, f.mimetype)) {
          console.warn(`Security: magic bytes failed for ${originalName}`)
          rejectedFiles.push(originalName)
          continue
        }
        const ext  = { 'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf' }[f.mimetype] || 'bin'
        // 16 random bytes (128 bits) — these are unauthenticated, non-expiring, permanent
        // links to real client ID documents, so filenames must not be practically guessable.
        const safe = `${requestId}_${Date.now()}_${crypto.randomBytes(16).toString('hex')}.${ext}`
        const abs  = path.join(UPLOADS_DIR, safe)
        fs.writeFileSync(abs, f.buffer)
        writtenPaths.push(abs)
        await conn.execute('INSERT INTO request_files (form_request_id,label,file_name,file_type,file_path) VALUES (?,?,?,?,?)', [requestId, label, originalName, f.mimetype, safe])
        savedFiles.push({ label, fileName: safe })
      }
    }
    await conn.commit()
    const fileLinks = savedFiles.map(f => ({ label: f.label, url: `${BASE_URL}/uploads/${f.fileName}` }))
    // Deliberately NOT awaited: the order is already durable at this point, and the
    // customer shouldn't wait on a full SMTP round-trip to get their confirmation.
    // sendEmail() swallows its own errors, so this can never reject unhandled.
    sendEmail({ fullName, idNumber, location, countryCode, whatsapp, notes, services, requestId, textFields, fileLinks })
    res.json({ requestId, success: true, rejectedFiles })
  } catch (err) {
    await conn.rollback()
    for (const p of writtenPaths) { try { fs.unlinkSync(p) } catch { /* already gone */ } }
    console.error('Submit error:', err)
    res.status(500).json({ error: 'تعذّر إرسال الطلب. حاول مرة أخرى.' })
  } finally {
    conn.release()
  }
})

// ─── Public: Blogs & Services ─────────────────────────────────────────────────
// These three are public, identical for every visitor, and change rarely (blog
// posts and the service list are edited by hand from the admin panel). A short
// shared cache lets the CDN/browser skip the DB round-trip entirely on the hot
// path — /api/services in particular is fetched on every page view by
// ServiceSelector.jsx. Kept deliberately short (5 min) so an admin edit shows up
// quickly without needing a cache purge.
const PUBLIC_CACHE = 'public, max-age=300, stale-while-revalidate=600'

app.get('/api/blogs', async (_req, res) => {
  const [rows] = await pool.execute('SELECT id,title,slug,category,excerpt,created_at,updated_at FROM blog_articles WHERE is_published=1 ORDER BY created_at DESC')
  res.setHeader('Cache-Control', PUBLIC_CACHE)
  res.json(rows)
})
app.get('/api/blogs/:slug', async (req, res) => {
  const [[a]] = await pool.execute('SELECT * FROM blog_articles WHERE slug=? AND is_published=1', [req.params.slug])
  if (!a) return res.status(404).json({ error: 'المقالة غير موجودة' })
  res.setHeader('Cache-Control', PUBLIC_CACHE)
  res.json(a)
})
app.get('/api/services', async (_req, res) => {
  const [rows] = await pool.execute('SELECT * FROM services_config WHERE is_enabled=1 ORDER BY sort_order')
  res.setHeader('Cache-Control', PUBLIC_CACHE)
  res.json(rows)
})

// ─── Admin: Login / Logout ────────────────────────────────────────────────────
const LOCKOUT_MAX_FAILS  = 3
const LOCKOUT_WINDOW_SQL = 'INTERVAL 15 MINUTE'
const SESSION_TTL_SQL    = 'INTERVAL 30 MINUTE'

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  if (!ADMIN_CONFIGURED) return res.status(503).json({ error: 'الإعداد غير مكتمل. الرجاء التواصل مع المسؤول.' })

  // Opportunistic cleanup. Runs only here (not in requireAdmin, which fires on every
  // authenticated request and must stay to a single query) — cheap, indexed deletes.
  await pool.execute('DELETE FROM admin_sessions WHERE expires_at < NOW()')
  await pool.execute('DELETE FROM admin_login_attempts WHERE attempted_at < NOW() - INTERVAL 1 DAY')

  const ip = req.ip

  // Lockout check. "Consecutive" = failures since this IP's most recent success —
  // a success from a different IP never resets another IP's streak. Only the 3 most
  // recent qualifying failures matter: if all 3 fall inside the last 15 minutes,
  // the IP is locked out until the oldest of those 3 ages out of that window.
  const [[{ lastSuccess }]] = await pool.execute(
    'SELECT MAX(attempted_at) AS lastSuccess FROM admin_login_attempts WHERE ip=? AND success=1', [ip]
  )
  const [recentFails] = await pool.execute(
    `SELECT attempted_at FROM admin_login_attempts
     WHERE ip=? AND success=0 AND attempted_at > ?
     ORDER BY attempted_at DESC LIMIT ${LOCKOUT_MAX_FAILS}`,
    [ip, lastSuccess || '1970-01-01 00:00:00']
  )
  if (recentFails.length >= LOCKOUT_MAX_FAILS) {
    const oldest = recentFails[recentFails.length - 1].attempted_at
    const [[{ retryAfterSeconds }]] = await pool.execute(
      `SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), ? + ${LOCKOUT_WINDOW_SQL})) AS retryAfterSeconds`, [oldest]
    )
    if (retryAfterSeconds > 0) {
      res.setHeader('Retry-After', String(retryAfterSeconds))
      return res.status(429).json({
        error: `محاولات كثيرة جداً. الرجاء المحاولة بعد ${Math.ceil(retryAfterSeconds / 60)} دقيقة.`,
        code: 'LOCKED_OUT',
        retryAfterSeconds,
      })
    }
  }

  const ok = safeEqual(req.body.password || '', ADMIN_PASSWORD)
  await pool.execute('INSERT INTO admin_login_attempts (ip,success) VALUES (?,?)', [ip, ok ? 1 : 0])
  if (!ok) return res.status(401).json({ error: 'كلمة المرور غير صحيحة' })

  const token = crypto.randomBytes(32).toString('hex')
  await pool.execute(
    `INSERT INTO admin_sessions (token_hash,expires_at) VALUES (?, NOW() + ${SESSION_TTL_SQL})`,
    [hashToken(token)]
  )
  res.json({ token })
})

// Deletes the session row server-side — unlike the old deterministic token, this
// actually revokes access immediately rather than merely forgetting a token client-side.
// Always returns success (idempotent): logging out an already-expired/invalid/missing
// token is not an error from the client's point of view.
app.post('/api/admin/logout', logoutLimiter, async (req, res) => {
  const auth = req.headers.authorization || ''
  if (auth.startsWith('Bearer ')) await pool.execute('DELETE FROM admin_sessions WHERE token_hash=?', [hashToken(auth.slice(7))])
  res.json({ success: true })
})

// ─── Admin: Orders ────────────────────────────────────────────────────────────
const ORDER_STATUSES = ['new', 'in_progress', 'done']
const ORDERS_PAGE_SIZE     = 50
const ORDERS_MAX_PAGE_SIZE = 200

// Paginated + server-side filtered. Previously this returned every row with no
// LIMIT and the panel filtered/searched the whole array client-side, which meant
// the full orders table (plus a GROUP_CONCAT per row) crossed the wire on every
// load. Filtering and searching moved server-side so pagination is actually
// correct — a client-side search over one page would only ever find matches in
// that page.
//
// Response shape is { orders, total, limit, offset, counts } rather than a bare
// array: the panel needs `total` to render pagination and `counts` to keep the
// per-status tab badges accurate across pages (they can't be derived from a
// single page of rows).
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const limit  = Math.min(ORDERS_MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit) || ORDERS_PAGE_SIZE))
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : null
  const q      = String(req.query.q || '').trim().slice(0, 100)

  // Search spans the order's own columns plus its joined service names, so it has
  // to be an EXISTS subquery rather than a WHERE on the joined rows — filtering
  // the JOIN directly would drop the order's other services from GROUP_CONCAT.
  const where = []
  const args  = []
  if (status) { where.push('fr.status = ?'); args.push(status) }
  if (q) {
    where.push(`(fr.full_name LIKE ? OR fr.id_number LIKE ? OR fr.whatsapp_number LIKE ?
                 OR EXISTS (SELECT 1 FROM request_services rs2 WHERE rs2.form_request_id = fr.id AND rs2.service_name LIKE ?))`)
    const like = `%${q}%`
    args.push(like, like, like, like)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM form_requests fr ${whereSql}`, args)
  // LIMIT/OFFSET are interpolated, not bound: they're already clamped to integers
  // above, and MySQL's prepared-statement protocol rejects placeholders there.
  const [orders] = await pool.execute(`
    SELECT fr.*, GROUP_CONCAT(rs.service_name SEPARATOR '، ') AS services
    FROM form_requests fr
    LEFT JOIN request_services rs ON rs.form_request_id=fr.id
    ${whereSql}
    GROUP BY fr.id ORDER BY fr.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `, args)
  const [counts] = await pool.execute('SELECT status, COUNT(*) AS n FROM form_requests GROUP BY status')

  res.json({
    orders,
    total: Number(total),
    limit,
    offset,
    counts: Object.fromEntries(counts.map(r => [r.status, Number(r.n)])),
  })
})

// Aggregate counts for the dashboard landing tab. Replaces the previous approach
// of fetching all three tables in full just to call .length/.filter() on them —
// nine integers now cost three GROUP BY queries instead of the entire dataset.
app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  const [orderCounts]   = await pool.execute('SELECT status, COUNT(*) AS n FROM form_requests GROUP BY status')
  const [[blogCounts]]  = await pool.execute('SELECT COUNT(*) AS total, COALESCE(SUM(is_published),0) AS published FROM blog_articles')
  const [[svcCounts]]   = await pool.execute('SELECT COUNT(*) AS total, COALESCE(SUM(is_enabled),0) AS enabled FROM services_config')
  const byStatus = Object.fromEntries(orderCounts.map(r => [r.status, Number(r.n)]))
  const orderTotal = Object.values(byStatus).reduce((a, b) => a + b, 0)
  res.json({
    orders: {
      total:       orderTotal,
      new:         byStatus.new         || 0,
      in_progress: byStatus.in_progress || 0,
      done:        byStatus.done        || 0,
    },
    blogs: {
      total:     Number(blogCounts.total),
      published: Number(blogCounts.published),
      draft:     Number(blogCounts.total) - Number(blogCounts.published),
    },
    services: {
      total:    Number(svcCounts.total),
      enabled:  Number(svcCounts.enabled),
      disabled: Number(svcCounts.total) - Number(svcCounts.enabled),
    },
  })
})

app.get('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const [[order]] = await pool.execute('SELECT * FROM form_requests WHERE id=?', [req.params.id])
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود' })
  const [services]   = await pool.execute('SELECT * FROM request_services   WHERE form_request_id=? ORDER BY sort_order', [req.params.id])
  const [textFields] = await pool.execute('SELECT * FROM request_text_fields WHERE form_request_id=?', [req.params.id])
  const [files]      = await pool.execute('SELECT * FROM request_files       WHERE form_request_id=?', [req.params.id])
  res.json({ ...order, services, textFields, files })
})

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const { status, notes, price, price_note, has_shipping, shipping_cost,
          full_name, id_number, location, whatsapp_number } = req.body
  const cols = []; const vals = []
  // Validated against the same allowlist bulk-status uses. Without this an unknown
  // value reaches the ENUM column and surfaces as a 500 instead of a clean 400.
  if (status !== undefined && !ORDER_STATUSES.includes(status))
    return res.status(400).json({ error: 'حالة غير صالحة' })
  if (status          !== undefined) { cols.push('status=?');          vals.push(status) }
  if (notes           !== undefined) { cols.push('notes=?');           vals.push(notes) }
  if (price           !== undefined) { cols.push('price=?');           vals.push(price) }
  if (price_note      !== undefined) { cols.push('price_note=?');      vals.push(price_note) }
  if (has_shipping    !== undefined) { cols.push('has_shipping=?');    vals.push(has_shipping ? 1 : 0) }
  if (shipping_cost   !== undefined) { cols.push('shipping_cost=?');   vals.push(shipping_cost) }
  if (full_name       !== undefined) { cols.push('full_name=?');       vals.push(full_name) }
  if (id_number       !== undefined) { cols.push('id_number=?');       vals.push(id_number) }
  if (location        !== undefined) { cols.push('location=?');        vals.push(location) }
  if (whatsapp_number !== undefined) { cols.push('whatsapp_number=?'); vals.push(whatsapp_number) }
  if (!cols.length) return res.status(400).json({ error: 'لا بيانات للتحديث' })
  vals.push(req.params.id)
  await pool.execute(`UPDATE form_requests SET ${cols.join(',')} WHERE id=?`, vals)
  res.json({ success: true })
})

app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  await pool.execute('DELETE FROM form_requests WHERE id=?', [req.params.id])
  res.json({ success: true })
})

// Bulk endpoints build an IN (...) placeholder list from the request body, so the
// array has to be bounded and coerced to real integers first — otherwise a caller
// could post tens of thousands of entries (or non-numeric ones) and have the
// server assemble a correspondingly enormous statement.
const MAX_BULK_IDS = 200
function parseBulkIds(raw) {
  if (!Array.isArray(raw) || !raw.length) return { error: 'لا طلبات محددة' }
  if (raw.length > MAX_BULK_IDS) return { error: `لا يمكن تنفيذ العملية على أكثر من ${MAX_BULK_IDS} طلب دفعة واحدة` }
  const ids = raw.map(Number).filter(Number.isInteger)
  if (ids.length !== raw.length) return { error: 'معرّفات غير صالحة' }
  return { ids }
}

app.post('/api/admin/orders/bulk-delete', requireAdmin, async (req, res) => {
  const { ids, error } = parseBulkIds(req.body.ids)
  if (error) return res.status(400).json({ error })
  const ph = ids.map(() => '?').join(',')
  const [result] = await pool.execute(`DELETE FROM form_requests WHERE id IN (${ph})`, ids)
  res.json({ success: true, deleted: result.affectedRows })
})

app.post('/api/admin/orders/bulk-status', requireAdmin, async (req, res) => {
  const { ids, error } = parseBulkIds(req.body.ids)
  if (error) return res.status(400).json({ error })
  const { status } = req.body
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' })
  const ph = ids.map(() => '?').join(',')
  const [result] = await pool.execute(`UPDATE form_requests SET status=? WHERE id IN (${ph})`, [status, ...ids])
  res.json({ success: true, updated: result.affectedRows })
})

app.post('/api/admin/orders', requireAdmin, async (req, res) => {
  const { fullName, idNumber, location, countryCode, whatsapp, notes, services, status } = req.body
  if (!fullName || !idNumber || !location) return res.status(400).json({ error: 'الحقول المطلوبة ناقصة' })
  const [result] = await pool.execute(
    'INSERT INTO form_requests (full_name,id_number,location,country_code,whatsapp_number,notes,status) VALUES (?,?,?,?,?,?,?)',
    [fullName, idNumber, location, countryCode||'+970', whatsapp||'', notes||'', status||'new']
  )
  const requestId = result.insertId
  if (services?.length)
    for (let i = 0; i < services.length; i++)
      await pool.execute('INSERT INTO request_services (form_request_id,service_name,sort_order) VALUES (?,?,?)', [requestId, services[i], i])
  res.json({ requestId, success: true })
})

// ─── Admin: Invoice PDF ───────────────────────────────────────────────────────
app.post('/api/admin/invoice/pdf', pdfLimiter, requireAdmin, async (req, res) => {
  const { html, filename } = req.body
  if (!html) return res.status(400).json({ error: 'HTML مطلوب' })
  if (!puppeteer || !CHROMIUM_EXEC)
    return res.status(503).json({ error: 'PDF غير متاح على هذا الخادم. استخدم زر الطباعة بدلاً من ذلك.' })
  let browser
  try {
    browser = await puppeteer.launch({ executablePath: CHROMIUM_EXEC, headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    // `html` here is the admin's invoice tab reflecting order data that ultimately
    // originates from the public, unauthenticated /api/submit endpoint. Disabling JS
    // execution for this render neutralizes any script that slipped through (defense
    // in depth alongside output-side escaping — see escHtml() in invoiceHelpers.js) —
    // nothing in the static invoice layout needs script execution to render/print.
    await page.setJavaScriptEnabled(false)
    // Disabling JS is NOT sufficient on its own: Chromium still fetches <img>, <link>,
    // <iframe> and stylesheet URLs, which from the server's network position means an
    // injected tag could reach internal hosts or cloud metadata endpoints. Blocking
    // every non-data: request closes that path, and as a side effect makes rendering
    // deterministic and fast — the invoice template links Google Fonts, so without
    // this the render waits on outbound egress (or stalls until timeout on a host
    // that has none) purely for a webfont the PDF doesn't need.
    await page.setRequestInterception(true)
    page.on('request', (r) => {
      const url = r.url()
      if (url.startsWith('data:') || r.isNavigationRequest()) r.continue()
      else r.abort()
    })
    // 'domcontentloaded' rather than 'networkidle0': with all external requests
    // aborted there is no network to go idle, and networkidle0 would just burn its
    // full timeout on every invoice.
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top:'15mm', right:'20mm', bottom:'15mm', left:'20mm' } })
    const safeName = encodeURIComponent(filename || 'فاتورة.pdf')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeName}`)
    res.send(Buffer.from(pdf))
  } catch (e) {
    console.error('PDF generation failed:', e)
    res.status(500).json({ error: 'فشل إنشاء PDF' })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
})

// ─── Admin: Blogs ─────────────────────────────────────────────────────────────
app.get('/api/admin/blogs', requireAdmin, async (_req, res) => {
  const [rows] = await pool.execute('SELECT * FROM blog_articles ORDER BY created_at DESC')
  res.json(rows)
})
app.post('/api/admin/blogs', requireAdmin, async (req, res) => {
  const { title, slug, category, excerpt, html_content, css_content, is_published } = req.body
  if (!title || !slug) return res.status(400).json({ error: 'العنوان والرابط مطلوبان' })
  try {
    const [result] = await pool.execute(
      'INSERT INTO blog_articles (title,slug,category,excerpt,html_content,css_content,is_published) VALUES (?,?,?,?,?,?,?)',
      [title, slug, category||'', excerpt||'', html_content||'', css_content||'', is_published?1:0]
    )
    res.json({ id: result.insertId, success: true })
  } catch (e) {
    res.status(400).json({ error: e.code === 'ER_DUP_ENTRY' ? 'الرابط مستخدم مسبقاً' : e.message })
  }
})
app.put('/api/admin/blogs/:id', requireAdmin, async (req, res) => {
  const { title, slug, category, excerpt, html_content, css_content, is_published } = req.body
  try {
    await pool.execute(
      'UPDATE blog_articles SET title=?,slug=?,category=?,excerpt=?,html_content=?,css_content=?,is_published=? WHERE id=?',
      [title, slug, category||'', excerpt||'', html_content||'', css_content||'', is_published?1:0, req.params.id]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(400).json({ error: e.code === 'ER_DUP_ENTRY' ? 'الرابط مستخدم مسبقاً' : e.message })
  }
})
app.delete('/api/admin/blogs/:id', requireAdmin, async (req, res) => {
  await pool.execute('DELETE FROM blog_articles WHERE id=?', [req.params.id])
  res.json({ success: true })
})

// ─── Admin: Services ──────────────────────────────────────────────────────────
app.get('/api/admin/services', requireAdmin, async (_req, res) => {
  const [rows] = await pool.execute('SELECT * FROM services_config ORDER BY sort_order')
  res.json(rows)
})
app.post('/api/admin/services', requireAdmin, async (req, res) => {
  const { type, parent_value, value, label } = req.body
  if (!value || !label) return res.status(400).json({ error: 'القيمة والاسم مطلوبان' })
  const [result] = await pool.execute(
    'INSERT INTO services_config (type,parent_value,value,label,is_enabled) VALUES (?,?,?,?,1)',
    [type||'primary', parent_value||'', value, label]
  )
  res.json({ id: result.insertId, success: true })
})
app.patch('/api/admin/services/:id', requireAdmin, async (req, res) => {
  const { is_enabled, label } = req.body
  const cols = []; const vals = []
  if (is_enabled !== undefined) { cols.push('is_enabled=?'); vals.push(is_enabled?1:0) }
  if (label      !== undefined) { cols.push('label=?');      vals.push(label) }
  if (!cols.length) return res.status(400).json({ error: 'لا بيانات' })
  vals.push(req.params.id)
  await pool.execute(`UPDATE services_config SET ${cols.join(',')} WHERE id=?`, vals)
  res.json({ success: true })
})
app.delete('/api/admin/services/:id', requireAdmin, async (req, res) => {
  await pool.execute('DELETE FROM services_config WHERE id=?', [req.params.id])
  res.json({ success: true })
})

// ─── Email ────────────────────────────────────────────────────────────────────
// Escape user-supplied text before interpolating into the notification email HTML.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
}

async function sendEmail({ fullName, idNumber, location, countryCode, whatsapp, notes, services, requestId, textFields, fileLinks }) {
  // SMTP mailbox not provisioned yet (or intentionally unconfigured) — skip sending
  // rather than attempting a connection that's guaranteed to fail. Order submission
  // itself has already succeeded by the time this is called; this must never block it.
  if (!SMTP_PASS) { console.warn(`⚠ SMTP_PASS not configured — skipping notification email for #${requestId}`); return }
  const svcRows  = (services||[]).map(s => `<li style="padding:5px 0;border-bottom:1px solid #f1f5f9;">${esc(s)}</li>`).join('')
  const tfRows   = (textFields||[]).map(({ label, value }) =>
    `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f8fafc;gap:16px;">
       <span style="color:#64748b;font-size:13px;min-width:120px;">${esc(label)}</span>
       <span style="color:#1e293b;font-size:13px;font-weight:600;direction:rtl;">${esc(value)}</span>
     </div>`).join('')
  const fileRows = (fileLinks||[]).map(f =>
    `<div style="margin-bottom:8px;">
       <div style="font-size:12px;color:#64748b;">${esc(f.label)}</div>
       <a href="${f.url}" style="color:#1a56db;font-size:12px;word-break:break-all;direction:ltr;display:block;">${esc(f.url)}</a>
     </div>`).join('')
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<style>body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#f4f6f8;margin:0;padding:0;direction:rtl;}
.w{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);}
.hd{background:#0f2040;padding:28px 32px;text-align:center;}.hd h1{color:#FD5523;margin:0;font-size:22px;}
.hd p{color:rgba(255,255,255,.6);margin:6px 0 0;font-size:13px;}.bd{padding:32px;}
.rid{background:#0f2040;color:#FD5523;text-align:center;padding:16px;border-radius:8px;font-size:18px;font-weight:700;margin-top:24px;}
.ft{background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;}.ft p{color:#94a3b8;font-size:12px;margin:0;}
.stitle{font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px;border-bottom:1px solid #f1f5f9;padding-bottom:6px;}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f8fafc;gap:16px;}
.lbl{color:#64748b;font-size:13px;min-width:120px;}.val{color:#1e293b;font-size:13px;font-weight:600;}
</style></head><body><div class="w">
  <div class="hd"><h1>بيت المقدس للخدمات العامة</h1><p>بوابة الخدمات الرقمية — gs.bmexpress.co</p></div>
  <div class="bd">
    <span style="display:inline-block;background:#e8f4e8;color:#2d7a2d;font-size:13px;font-weight:600;padding:4px 14px;border-radius:20px;margin-bottom:16px;">✅ طلب جديد وصل</span>
    <div class="stitle">معلومات الزبون</div>
    <div class="row"><span class="lbl">الاسم الكامل</span><span class="val">${esc(fullName)}</span></div>
    <div class="row"><span class="lbl">رقم الهوية</span><span class="val" style="direction:ltr;">${esc(idNumber)}</span></div>
    <div class="row"><span class="lbl">الموقع</span><span class="val">${esc(location)}</span></div>
    <div class="row"><span class="lbl">الواتساب</span><span class="val" style="direction:ltr;">${esc(whatsapp)}</span></div>
    ${notes ? `<div class="row"><span class="lbl">ملاحظات</span><span class="val">${esc(notes)}</span></div>` : ''}
    <div class="stitle">الخدمات المطلوبة</div>
    <ul style="list-style:none;padding:0;margin:0;">${svcRows}</ul>
    ${tfRows  ? `<div class="stitle">معلومات إضافية</div>${tfRows}` : ''}
    ${fileRows ? `<div class="stitle">المستندات المرفقة</div><div style="background:#f8fafc;border-radius:8px;padding:12px;">${fileRows}</div>` : ''}
    <div class="rid">رقم الطلب: #${requestId}</div>
  </div>
  <div class="ft"><p>هذا البريد تم إرساله تلقائياً من بوابة gs.bmexpress.co — لا تقم بالرد عليه</p></div>
</div></body></html>`
  try {
    // NOTE: "from" display name/address is a placeholder — SMTP auth account (see transporter config
    // above) is intentionally left untouched; align this once real domain/mailbox are provisioned.
    await transporter.sendMail({
      from: '"بيت المقدس — بوابة الطلبات" <noreply@bmexpress.co>',
      to: ADMIN_EMAIL,
      subject: `📋 طلب جديد #${requestId} — ${fullName}`,
      html,
    })
    console.log(`✓ Email sent for #${requestId}`)
  } catch (e) {
    console.error('Email failed:', e.message)
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────
// Actually probes the database rather than reporting a hardcoded "ok". This
// previously returned status:'ok' even when the schema had failed to initialise and
// every real endpoint was 500-ing — which made it useless for confirming a deploy
// succeeded. 503 when the database is unreachable so uptime monitoring can see it.
// Details of the failure are logged, not returned, so this stays safe to expose.
app.get('/api/health', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    await pool.query('SELECT 1')
    return res.json({ status: 'ok', db: 'up', schema: dbReady ? 'ready' : 'initialising', version: '3.0' })
  } catch (e) {
    console.error('Health check: database unreachable:', e.message)
    return res.status(503).json({ status: 'degraded', db: 'down', schema: dbReady ? 'ready' : 'unknown', version: '3.0' })
  }
})

// ─── sitemap.xml ──────────────────────────────────────────────────────────────
// Generated rather than shipped as a static file: blog articles live in MySQL and
// are created/unpublished from the admin panel, so a checked-in sitemap would go
// stale the moment an article is published. Static routes are always emitted, so
// this still returns a valid sitemap if the DB is unreachable.
app.get('/sitemap.xml', async (_req, res) => {
  const base = BASE_URL.replace(/\/+$/, '')
  const urls = [
    { loc: `${base}/`,     changefreq: 'weekly', priority: '1.0' },
    { loc: `${base}/blog`, changefreq: 'weekly', priority: '0.8' },
  ]
  try {
    const [articles] = await pool.execute(
      'SELECT slug, updated_at, created_at FROM blog_articles WHERE is_published=1 ORDER BY created_at DESC'
    )
    for (const a of articles) {
      const stamp = a.updated_at || a.created_at
      urls.push({
        loc: `${base}/blog/${encodeURIComponent(a.slug)}`,
        lastmod: stamp ? new Date(stamp).toISOString().slice(0, 10) : undefined,
        changefreq: 'monthly',
        priority: '0.7',
      })
    }
  } catch (e) {
    console.error('sitemap: could not load articles:', e.message)
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${esc(u.loc)}</loc>${u.lastmod ? `
    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(xml)
})

// ─── Unknown API routes ───────────────────────────────────────────────────────
// Must sit after every /api handler but before the SPA catch-all below. Without
// it, GET /api/typo falls through to the catch-all and returns index.html with a
// 200, so clients calling res.json() on an API mistake get an HTML parse error
// instead of a readable 404.
app.use('/api', (_req, res) => res.status(404).json({ error: 'المسار غير موجود' }))

// ─── Serve React build (production) ──────────────────────────────────────────
const DIST = path.join(__dirname, 'bmplus-react', 'dist')
if (fs.existsSync(DIST)) {
  // Vite emits content-hashed asset filenames, so they can be cached forever.
  // index.html must NOT be cached, so a new deploy is picked up immediately.
  app.use(express.static(DIST, {
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
    },
  }))
  app.get('/{*path}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(DIST, 'index.html'))
  })
}

// ─── Error handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err && /CORS/.test(err.message)) return res.status(403).json({ error: 'مصدر غير مصرح به' })
  if (err && (err.name === 'MulterError' || /غير مسموح/.test(err.message || '')))
    return res.status(400).json({ error: err.message })
  console.error('Unhandled error:', err)
  if (res.headersSent) return
  res.status(500).json({ error: 'حدث خطأ في الخادم' })
})

// ─── Start ────────────────────────────────────────────────────────────────────
// Called synchronously during module load so Passenger detects the listening server
// immediately (it requires this file and expects listen() before its startup timeout).
// Skipped only under NODE_ENV=test, where the test suite drives `app` directly via
// supertest and binding a real port would leave the process hanging after the run.
// Production and cPanel/Passenger never set NODE_ENV=test, so their behaviour is
// byte-for-byte unchanged.
const PORT = process.env.PORT || 3000
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Server running on :${PORT}  (MySQL)`))
}

// Exported for the test suite. Harmless in production — Passenger only cares that
// listen() ran during load, and nothing else requires this file.
module.exports = app
