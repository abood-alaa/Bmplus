# بيت المقدس للخدمات العامة — React + Express + MySQL

Arabic (RTL) service-office site for Bayt Al-Maqdis General Services in Ramallah:
a public request-intake portal, a blog, and a staff admin panel.

**Everything is self-hosted.** The database is MySQL running on the same server as
the app, files are written to local disk, and mail goes out over the office's own
SMTP mailbox. There is no third-party database, storage bucket, or backend-as-a-service
anywhere in the stack — nothing leaves the box except SMTP.

> Earlier revisions of this project were built on Supabase/PostgreSQL. That is gone:
> the migration to self-hosted MySQL is complete and the Supabase code, config, and
> schema have been removed from the repo.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5, React Router v7 |
| Prerendering | react-snap (static HTML for `/`, `/blog`, `/404.html`) |
| Backend | Express 5 (CommonJS), `server.js` at the repo root |
| Database | **MySQL 8** via `mysql2/promise` — on the app server (`localhost`) |
| File storage | **Local disk**, `data/uploads/`, served at `/uploads` |
| Email | SMTP via nodemailer (cPanel mailbox) |
| Admin auth | Server-side sessions in MySQL (`admin_sessions`), 30-min sliding idle timeout |
| PDF invoices | puppeteer-core (optional; falls back to browser print) |
| Hosting | cPanel + Phusion Passenger |
| Styling | Plain CSS, no framework |

Note the repo layout: **`server.js` lives at the repo root** alongside this README.
The `bmplus-react/` directory holds only the React source and its build output.

---

## Where the data lives

All schema is created at boot by `initDB()` in `server.js` — there is no migrations
folder and no migration tool. Tables are declared as `CREATE TABLE IF NOT EXISTS`, so
starting the app against an empty database is all the setup there is.

| Table | Holds |
|---|---|
| `form_requests` | One row per submitted request (customer, status, price, shipping) |
| `request_services` | Services attached to a request |
| `request_text_fields` | Per-service text answers |
| `request_files` | Uploaded document metadata (the bytes are on disk) |
| `blog_articles` | Blog CMS content (`html_content` / `css_content`) |
| `services_config` | The service tree shown on the public form |
| `admin_sessions` | Live admin sessions, keyed by SHA-256 of the token |
| `admin_login_attempts` | Per-IP login attempts, powering the lockout |

Uploaded files are stored under `data/uploads/` with generated unguessable names;
only the metadata goes in MySQL.

---

## Local development

You need a MySQL server. If you don't have one installed, Docker is the fastest route:

```bash
docker run -d --name bmplus-mysql \
  -e MYSQL_ROOT_PASSWORD=localdev \
  -e MYSQL_DATABASE=bmplus \
  -p 3306:3306 mysql:8
```

Then, **from the repo root**:

```bash
npm run setup                 # installs root + frontend dependencies
cp .env.example .env          # then edit it — see the table below
npm start                     # serves the built SPA + API on http://localhost:3000
```

`initDB()` creates every table and seeds the service list on first boot.

Minimum `.env` for local work (full list documented in `.env.example`):

```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASS=localdev
DB_NAME=bmplus
ADMIN_PASSWORD=choose-something
BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
```

The admin panel is at `/admin`. It returns 503 until `ADMIN_PASSWORD` is set —
there is deliberately no default password.

### Frontend-only dev server

```bash
cd bmplus-react
npm run dev                   # Vite on :5173, proxies /api and /uploads to :3000
```

Run `npm start` from the repo root at the same time so the API is up.

### Tests

```bash
npm test                      # from the repo root — 98 specs across 8 files
```

The suite injects a stub database, so **no MySQL is needed to run it** — it asserts
on the SQL that gets issued and the parameters bound, which is where this codebase's
real risks live. Coverage is deliberately weighted to the paths that would hurt most:

| File | Guards |
|---|---|
| `requireAdmin.test.js` | every admin route is gated; missing/malformed/expired tokens all 401 identically; the sliding-expiry update stays a *single* atomic statement |
| `submit.test.js` | magic-byte validation rejects a disguised file; transaction rollback leaves no orphaned row *or* orphaned file on disk; Arabic filenames survive as UTF-8 |
| `loginLockout.test.js` | 3-fails/15-min arithmetic; a success from another IP must not reset this IP's streak |
| `adminOrders.test.js` | PATCH updates only the fields supplied; bulk operations are bounded and integer-only; pagination clamps |
| `invoiceEscaping.test.js` | every customer-controlled field is HTML-escaped before reaching the invoice |
| `cors.test.js` | both site origins accepted, wrong scheme/trailing slash/foreign origin rejected |
| `health.test.js` | `/api/health` probes the DB rather than reporting a hardcoded "ok" |
| `seoRoutes.test.js` | sitemap stays valid XML and degrades rather than 500-ing when the DB is down |

CI (`.github/workflows/ci.yml`) runs the suite and a production build on every push,
and fails if an uploaded document or a `.env` file is ever committed.

---

## Building for production

```bash
cd bmplus-react
npm run build                 # vite build && react-snap
```

**Two things that will bite you:**

1. **Always run the full `npm run build`, never a bare `vite build`.** The build is
   `vite build && react-snap`; running Vite alone skips react-snap and deletes the
   prerendered `200.html`, `404.html`, and `blog/index.html`.
2. **`bmplus-react/dist/` is committed to git and served directly in production —
   there is no build step on the server.** Any change under `bmplus-react/src/`
   does nothing in production until you rebuild *and commit the regenerated `dist/`*.
   Check `git status` on `dist/` after every frontend change.

Changes to `server.js` need no rebuild — just deploy and restart.

---

## Deployment (cPanel + Passenger)

1. `git pull` on the server.
2. **Setup Node.js App** → Node 18+, application startup file `app.cjs` → *Run NPM Install*.
3. Set the environment variables below in that same panel. Secrets live there, never
   in the repo — `server.js` has no fallback values and will disable the affected
   feature loudly if one is missing.
4. Restart: `touch tmp/restart.txt`, or the panel's *Restart* button.
5. Verify: `curl https://gs.bmexpress.co/api/health` →
   `{"status":"ok","db":"up","schema":"ready"}`. A `503 degraded` means the database
   variables are wrong.

| Variable | Value | Required? |
|---|---|---|
| `DB_USER` | cPanel-prefixed MySQL user | **yes** — admin panel and API fail without it |
| `DB_PASS` | that user's password | **yes** |
| `DB_NAME` | cPanel-prefixed database name | **yes** |
| `DB_HOST` | `localhost` | no (defaults to `localhost`) |
| `ADMIN_PASSWORD` | admin panel password | **yes** — `/admin` returns 503 until set |
| `BASE_URL` | `https://gs.bmexpress.co` | strongly recommended |
| `ALLOWED_ORIGINS` | `https://gs.bmexpress.co,https://www.gs.bmexpress.co` | **yes, both** — see below |
| `ADMIN_EMAIL` | where new-order notifications go | recommended |
| `SMTP_PASS` | mailbox password | no — email is skipped until set |

**`ALLOWED_ORIGINS` is the one that causes a total outage if wrong.** Both the apex
and the `www` hostname serve this site, and browsers treat them as different origins.
Matching is an exact string compare, and browsers send an `Origin` header on
same-origin POSTs — so if a visitor's hostname isn't listed, *every* order submission
and admin login returns 403, which looks like a broken form rather than a config
error. Three ways to get it wrong, each failing the same way:

- wrong scheme — `http://` instead of `https://`
- a trailing slash — `https://gs.bmexpress.co/`
- listing only the apex and assuming `www` is implied — it never is

If you later redirect `www` → apex at the DNS/host level, you can drop `ALLOWED_ORIGINS`
entirely and let it fall back to `BASE_URL`. The allowlist is covered by
`test/cors.test.js`.

The database is created through cPanel's **MySQL® Databases** page:

1. Create a database (cPanel prefixes it, e.g. `youracct_bmplus`).
2. Create a user, then **Add User To Database** with *All Privileges*.
3. Put those exact prefixed names in `DB_NAME` / `DB_USER`, and leave
   `DB_HOST=localhost` — the app and MySQL are on the same machine, so no remote
   access needs to be enabled.

Passenger idle-respawns worker processes frequently; this is normal. Nothing in the
app keeps important state in memory — sessions live in MySQL specifically so they
survive a respawn.

---

## Project structure

```
server.js                     # Express API + static SPA host + schema (initDB)
app.cjs                       # crash-logging wrapper around server.js
vitest.config.js              # test runner config (one process per file)
data/uploads/                 # uploaded documents (gitignored)
test/                         # vitest suite (98 specs)
.github/workflows/ci.yml      # tests + build + "no secrets committed" guard
bmplus-react/
├── index.html                # SPA shell: meta, Open Graph, JSON-LD
├── public/                   # copied verbatim to dist/
│   ├── robots.txt            #   crawler + AI-crawler policy
│   └── llms.txt              #   summary for AI answer engines
├── dist/                     # BUILT OUTPUT — committed, served in production
└── src/
    ├── components/           # Navbar, Footer, ServiceSelector, WAModal, …
    ├── pages/
    │   ├── HomePage.jsx      # hero + about + request-intake form
    │   ├── BlogPage.jsx      # article index
    │   ├── BlogArticlePage.jsx
    │   └── admin/            # admin panel (lazy-loaded as its own chunk)
    │       ├── AdminPage.jsx         # shell + providers
    │       ├── AdminAuthContext.jsx  # token, authFetch, global 401 handling
    │       ├── OrdersPanel.jsx       # paginated orders + detail + invoice
    │       ├── BlogsPanel.jsx        # blog CMS
    │       ├── ServicesPanel.jsx     # service tree editor
    │       ├── DashboardPanel.jsx    # counts from /api/admin/stats
    │       ├── invoiceHelpers.js     # invoice HTML (escaped) + WhatsApp text
    │       ├── adminStyles.js        # inline style factory
    │       └── admin.css             # focus rings + keyframes only
    └── lib/
        ├── api.js            # public form submission
        ├── seo.js            # per-route title/canonical/OG/JSON-LD
        └── data.js           # countries, service map, validation
```

---

## Managing content

Everything is edited from the admin panel at `/admin` — no database client needed.

- **الطلبات** — incoming requests: filter, search, edit, price, print an invoice,
  share a summary over WhatsApp.
- **المدونة** — create and edit articles. `html_content` is rendered as raw HTML on
  the public site, so only trusted staff should have the admin password.
- **الخدمات** — enable/disable and rename entries in the service tree that the
  public form is built from.
