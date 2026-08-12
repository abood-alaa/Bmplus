/**
 * test-smtp.mjs — diagnose SMTP sending for noreply@bmexpress.co
 *
 * Run on the server:   node test-smtp.mjs
 * It verifies the connection/auth and sends one test email to ADMIN_EMAIL,
 * printing the exact error if anything fails.
 *
 * Env vars (fall back to the same defaults as server.js). SMTP_PASS and
 * ADMIN_EMAIL have no built-in fallback — set them in the environment (or a
 * local .env, if you load one) before running this script.
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, ADMIN_EMAIL
 */
import nodemailer from 'nodemailer'

const HOST   = process.env.SMTP_HOST   || 'mail.bmexpress.co'
const PORT   = Number(process.env.SMTP_PORT || 465)
const SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : PORT === 465
const USER   = process.env.SMTP_USER   || 'noreply@bmexpress.co'
const PASS   = process.env.SMTP_PASS
const TO     = process.env.ADMIN_EMAIL

if (!PASS) { console.error('✗ SMTP_PASS is not set. Set it in the environment before running this script.'); process.exit(1) }
if (!TO)   { console.error('✗ ADMIN_EMAIL is not set. Set it in the environment before running this script.'); process.exit(1) }

console.log(`Testing SMTP → host=${HOST} port=${PORT} secure=${SECURE} user=${USER}`)

const transporter = nodemailer.createTransport({
  host: HOST, port: PORT, secure: SECURE,
  auth: { user: USER, pass: PASS },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 10000,
})

try {
  await transporter.verify()
  console.log('✓ verify() OK — connection + auth succeeded')
  const info = await transporter.sendMail({
    from: `"اختبار" <${USER}>`,
    to: TO,
    subject: 'SMTP test — مكتب الزاهد',
    text: 'If you received this, SMTP works.',
  })
  console.log('✓ Sent. messageId:', info.messageId, '| response:', info.response)
} catch (e) {
  console.error('✗ SMTP FAILED')
  console.error('  message:', e.message)
  console.error('  code:', e.code, '| command:', e.command, '| responseCode:', e.responseCode)
  if (e.response) console.error('  response:', e.response)
}
