# Aurelia Dental — Full-Stack Site

A luxury dental clinic site with a real backend behind it: the
reservation form and the "Dr. AI" concierge chat both talk to live API
endpoints instead of faking it in the browser.

## What's new vs. the original file

- **Hero visual**: the flat placeholder box is now a hand-built layered
  SVG tooth (proper crown, roots, enamel shading, and specular highlight)
  that still rotates in 3D and tilts with your mouse — real anatomical
  shape instead of a rounded rectangle.
- **Polish**: navbar shrinks and gains a shadow on scroll, sections
  fade/slide in as you scroll (respects `prefers-reduced-motion`),
  visible keyboard focus states, refined glow layering behind the hero
  model.
- **Real backend**, shipped two ways (pick one — see below):
  - `server.js` — a plain Node/Express server, for running locally or
    on any Node host (Render, Railway, a VPS, Google Cloud Run…).
  - `functions/` — the same API rewritten as **Cloudflare Pages
    Functions**, so the whole site (frontend + backend) deploys as a
    single Cloudflare Pages project, on one domain, with no CORS to
    manage. Bookings persist in **Cloudflare D1** (real SQLite,
    not an ephemeral file).
- **Reservation form** now actually submits — validated server-side,
  persisted, with inline success/error banners and a loading spinner.
- **Dr. AI chat** calls the backend. Out of the box it answers from a
  small knowledge base (pricing, whitening, implants, veneers,
  Invisalign, symptoms, hours, booking). Add an Anthropic API key and
  it answers with real Claude responses instead.

## Project structure

```
aurelia-dental/
├── server.js              Express API (Option A: any Node host)
├── functions/              Cloudflare Pages Functions (Option B: all-Cloudflare)
│   ├── api/health.js
│   ├── api/chat.js
│   ├── api/bookings.js
│   ├── api/bookings/[id].js
│   └── _lib/                shared validation + Dr. AI reply logic
├── schema.sql               D1 table definition (Option B only)
├── wrangler.toml             local dev config for Pages Functions
├── Dockerfile                for Option A on Google Cloud Run
├── package.json
├── .env.example              copy to .env to configure (all optional)
├── data/
│   └── bookings.json         Option A's storage
└── public/
    └── index.html             the site (frontend, used by both options)
```

## Option B (recommended): deploy everything on Cloudflare

One repo, one Cloudflare Pages project, no separate backend service,
no CORS setup, real persistent storage via D1.

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages →
   Connect to Git** → pick the repo.
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: **public**
3. Before your first deploy (or right after), create the database:
   **Workers & Pages → D1 → Create database** → name it
   `aurelia-dental-db` → open it → **Console** tab → paste the contents
   of `schema.sql` → run it.
4. Bind the database to your Pages project: **your Pages project →
   Settings → Functions → D1 database bindings → Add binding** →
   variable name `DB` → select `aurelia-dental-db`.
5. (Optional) **Settings → Environment variables** → add `ADMIN_KEY`
   (for the admin bookings endpoint) and, if you want live Claude
   replies instead of the rule-based ones, `ANTHROPIC_API_KEY` +
   `ANTHROPIC_MODEL`.
6. Redeploy (Settings changes need a fresh deployment to take effect —
   trigger one from the Deployments tab, or just push a commit).

Test locally first if you want:

```bash
npm install
npm run pages:schema   # applies schema.sql to a local D1 database
npm run pages:dev      # serves the site + functions at http://localhost:8788
```

## Option A: Node backend anywhere + static frontend on Cloudflare Pages

Use this if you'd rather run a conventional Node server (e.g. on
Google Cloud Run, Render, or your own VPS) and keep the frontend on
Cloudflare Pages as a separate static site.

```bash
npm install
npm start
```

Open **http://localhost:3000** — bookings save to
`data/bookings.json`, Dr. AI runs on built-in rules.

When you deploy the frontend separately from this backend, open
`public/index.html`, set `API_BASE_URL` (near the top of the main
`<script>` block) to your backend's live URL, and make sure
`CORS_ORIGIN` in the backend's `.env` includes your frontend's domain.

**Known limitation:** Cloud Run (and most serverless Node hosts) has
an ephemeral filesystem — `data/bookings.json` can reset on redeploy
or scale-to-zero. Fine for a demo; for real traffic, swap in Option B
or point `readBookings`/`writeBookings` in `server.js` at a real
database.

## Optional configuration (`.env`, Option A only)

Copy `.env.example` to `.env` to customize:

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | server port | `3000` |
| `CORS_ORIGIN` | comma-separated allowed frontend origins | *(all origins)* |
| `ADMIN_KEY` | required header to view bookings | `aurelia-admin` |
| `ANTHROPIC_API_KEY` | if set, Dr. AI uses live Claude instead of rules | *(unset)* |
| `ANTHROPIC_MODEL` | which model to call | `claude-sonnet-5` |

For Option B, the same variable names (`ADMIN_KEY`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) are set as environment
variables in the Cloudflare Pages dashboard instead of a `.env` file.

## API reference (same for both options)

- `POST /api/bookings` — create a reservation
  ```json
  { "name": "Ada Lovelace", "phone": "+1 555 123 4567", "email": "ada@example.com",
    "date": "2026-09-01", "treatment": "Laser Whitening", "notes": "" }
  ```
  Returns `400` with an `errors[]` array if validation fails.

- `GET /api/bookings` — list all reservations. Requires header
  `x-admin-key: <ADMIN_KEY>`.

- `PATCH /api/bookings/:id` — update a booking's status
  (`pending` | `confirmed` | `cancelled`), same admin header required.

- `POST /api/chat` — `{ "message": "...", "history": [...] }` → Dr. AI's
  reply.

- `GET /api/health` — quick status check, also reports which AI mode is
  active.

```bash
curl -H "x-admin-key: aurelia-admin" https://your-site/api/bookings
```

