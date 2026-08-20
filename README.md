# بيت المقدس للخدمات العامة — Bayt Al-Maqdis General Services

An Arabic (RTL) platform that lets Palestinians living abroad file official paperwork
back home without flying in. A customer selects the services they need, fills in their
details, uploads identity documents from whatever country they're in, and submits the
request; office staff pick it up, price it, process it, and return the finished document.
One codebase serves three surfaces: the public request-intake portal, a blog, and a
staff admin panel for working the queue.

![The public homepage — hero, service list, and the three-step explanation of how a request is handled](docs/screenshots/homepage.png)

<!-- Still to add: docs/screenshots/admin-dashboard.png and docs/screenshots/request-form.png -->

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5, React Router v7 |
| Prerendering | react-snap — static HTML for `/`, `/blog`, and the 404 shell |
| Backend | Express 5 (CommonJS), a single `server.js` at the repo root |
| Database | MySQL 8 via `mysql2/promise` |
| File storage | Local disk |
| Email | SMTP via nodemailer |
| PDF invoices | puppeteer-core (optional dependency — falls back to browser print) |
| Styling | Plain CSS, no framework |
| Tests | vitest + supertest — 98 specs, no database required |

**Fully self-hosted.** No third-party database, storage bucket, or backend-as-a-service
anywhere in the stack — the only outbound connection the server itself makes is SMTP. An
earlier revision ran on Supabase/PostgreSQL; that migration is finished and the Supabase
code and schema are gone from the repo.

Schema is created at boot by `initDB()` with `CREATE TABLE IF NOT EXISTS`. There is no
migration tool and no migrations folder: pointing the app at an empty database is the
whole setup.

---

## Engineering notes

### Database-backed sessions instead of JWTs

Login issues a `crypto.randomBytes(32)` token and stores only its SHA-256 hash; the raw
value exists in the login response and the client's `Authorization` header, never in the
database or the logs. This replaced a deterministic-HMAC scheme because the host
idle-respawns worker processes constantly — anything held in process memory dies at
unpredictable times, and a per-boot signing secret would invalidate every live session on
every respawn. Session state lives in MySQL, so a respawn is a non-event.

Expiry slides forward on each authenticated request, and that slide is deliberately the
*same* `UPDATE` that authenticates the request — one atomic statement, not a read
followed by a write. `affectedRows !== 1` collapses "no such session", "expired", and
"malformed token" into one identical 401, so a client can't tell them apart.

### Magic-byte validation on uploads

`Content-Type` on a multipart part is attacker-supplied and trivially spoofed, so every
upload is checked against the real file signature for JPEG, PNG, and PDF before a single
byte is written to disk. Files that fail are reported back to the customer by name rather
than silently dropped — the earlier behaviour let the order succeed with an attachment
quietly missing, which nobody noticed until staff went looking for the document.

### Boot resilience, and a health check that tells the truth

`initDB()` is retried with exponential backoff. This fixes a real failure, not a
hypothetical one: a single failed attempt used to leave a worker running permanently
against a schema-less database, 500ing on every request until someone restarted it by
hand — while the health endpoint cheerfully reported `ok`, because it was hardcoded to.
The health endpoint now actually probes the database and reports a degraded status when
the probe fails, which is the only way it's useful as a deploy check. Boot failure still
doesn't kill the process: the static site keeps serving while the database is unreachable.

### Uploads are transactional across disk *and* database

A submission writes rows across four tables and files to disk. On any failure the handler
rolls back the transaction **and** unlinks every file it had already written, so a
half-failed submission leaves no orphaned rows pointing at missing files and no orphaned
files pointing at nothing.

### Arabic filenames survive the upload

multer/busboy decodes the filename out of the multipart header as latin1, so a UTF-8
name arrives with each byte reinterpreted as its own character — `هوية.jpg` becomes
`ÙÙÙØ©.jpg`. Nearly every document this office receives is named in Arabic and staff see
the original filename on the order detail view, so names are re-decoded to UTF-8, with a
round-trip check that leaves plain ASCII names untouched.

### Tests: 98 specs, no MySQL

The suite runs against an injected stub database and asserts on the SQL actually issued
and the parameters bound to it — that's where this codebase's real risk lives, so that's
what's pinned. Covered: every admin route is gated and the sliding-expiry update stays a
single statement; a disguised file is rejected by the magic-byte check; a failed
submission leaves no orphaned row *or* file; the login lockout arithmetic, including
that a success from one IP can't reset another's streak; every customer-controlled field
is HTML-escaped before it reaches an invoice; the health endpoint probes rather than
assumes; the sitemap degrades instead of 500ing when the database is down.

The stub is injected through an explicit seam rather than a module mock. `server.js` is
CommonJS and pulls in `mysql2` with a plain `require()`, which vitest's module mocking
cannot intercept — verified, a mocked `mysql2/promise` still hands back a real pool. CI
runs the suite and a production build on every push to `main` and every pull request
against it.

---

## Project structure

```
server.js                     # Express API + static SPA host + schema (initDB)
app.cjs                       # crash-logging wrapper around server.js
test/                         # vitest suite; helpers/ holds the stub database
.github/workflows/ci.yml      # runs the suite and a production build
bmplus-react/
├── index.html                # SPA shell: meta, Open Graph, JSON-LD
├── public/                   # copied verbatim to dist/ (robots.txt, llms.txt, assets)
├── dist/                     # BUILT OUTPUT — committed, served in production
└── src/
    ├── components/           # Navbar, Footer, ServiceSelector, CountryPicker, …
    ├── pages/
    │   ├── HomePage.jsx      # hero + about + request-intake form
    │   ├── BlogPage.jsx      # article index
    │   └── admin/            # admin panel — lazy-loaded as its own chunk
    │       ├── OrdersPanel.jsx    # paginated orders, detail view, invoice
    │       ├── BlogsPanel.jsx     # blog CMS
    │       ├── ServicesPanel.jsx  # editor for the public form's service tree
    │       └── …                  # auth context, dashboard, invoice + styling helpers
    └── lib/                  # api client, per-route SEO metadata, form validation
```

---

## Running it locally

```bash
git clone https://github.com/abood-alaa/Bmplus.git && cd Bmplus
npm run setup                 # installs root + frontend dependencies
cp .env.example .env          # fill in the values it lists
npm start                     # serves the built SPA + API on http://localhost:3000
npm test                      # 98 specs, no database needed
```

You need a reachable MySQL server for `npm start`; `initDB()` creates the tables and
seeds the service list on first boot.

> **One footgun:** `bmplus-react/dist/` is committed and served directly — there is no
> build step on the server. Frontend changes need the full `npm run build`
> (`vite build && react-snap`; a bare `vite build` skips react-snap and deletes the
> prerendered HTML), and the regenerated `dist/` has to be committed or the change simply
> isn't live.
