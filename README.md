# shopping1a1-erp

Internal ERP for Mercado Livre operations: inventory, purchasing, catalog competition reporting, and optional browser alerts.

Stack: **Next.js**, **PostgreSQL**, **Prisma**, Mercado Livre OAuth.

---

## Prerequisites

- Node.js 20+
- Docker (local Postgres only)
- App created in the [Mercado Livre DevCenter](https://developers.mercadolivre.com.br/)

---

## Local development

From-scratch checklist:

```bash
# 1. Dependencies
npm install

# 2. Environment variables
cp .env.example .env
# Fill in MERCADOLIBRE_* and ENCRYPTION_KEY (see below)

# 3. Local database
docker compose up -d

# 4. Database schema
npm run db:migrate

# 5. App
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in with Mercado Livre, and use the dashboard.

### Local Postgres (Docker)

| Field    | Value         |
|----------|---------------|
| Host     | `localhost`   |
| Port     | `5433`        |
| User     | `erp`         |
| Password | `erp`         |
| Database | `shopping1a1` |

```bash
docker compose up -d      # start
docker compose down       # stop (keeps data)
docker compose down -v    # stop and wipe data
```

Default `DATABASE_URL` (already in `.env.example`):

```
postgresql://erp:erp@localhost:5433/shopping1a1?schema=public
```

### Generate local secrets

```bash
# ENCRYPTION_KEY and CRON_SECRET (can differ in dev; use distinct values in prod)
openssl rand -base64 32

# VAPID (optional — only if testing browser push)
npx web-push generate-vapid-keys
```

### Mercado Livre (dev)

In the ML app, register this Redirect URI:

```
http://localhost:3000/api/auth/mercadolibre/callback
```

It must match `MERCADOLIBRE_REDIRECT_URI` in `.env` **exactly**.

Login requests `scope=offline_access read write` to obtain a `refresh_token` and persist credentials in `ml_seller_credentials` (encrypted with `ENCRYPTION_KEY`).

### Cron in dev (optional)

The catalog cron runs via GitHub Actions against your public app URL. Locally you can:

- use the **Coletar snapshot agora** button on `/dashboard/catalog-report`, or
- call the endpoint manually (if `CRON_SECRET` is in `.env`):

```bash
curl -X POST "http://localhost:3000/api/cron/catalog-competition" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Environment variables

Copy `.env.example` → `.env`. Full reference is in that file.

| Variable | Dev | Prod | Description |
|----------|:---:|:---:|-------------|
| `DATABASE_URL` | ✓ | ✓ | PostgreSQL |
| `MERCADOLIBRE_CLIENT_ID` | ✓ | ✓ | ML OAuth |
| `MERCADOLIBRE_CLIENT_SECRET` | ✓ | ✓ | ML OAuth |
| `MERCADOLIBRE_REDIRECT_URI` | ✓ | ✓ | OAuth callback (environment URL) |
| `ENCRYPTION_KEY` | ✓ | ✓ | Encrypts ML tokens in the database |
| `CRON_SECRET` | optional | ✓ | Protects `/api/cron/catalog-competition` |
| `CRON_ML_USER_ID` | — | optional | Fixed seller for cron (multiple sellers) |
| `VAPID_*` | optional | optional | Browser push (dashboard bell icon) |
| `MERCADOLIBRE_AUTH_BASE` | — | — | Override (default: Brazil) |
| `MERCADOLIBRE_API_BASE` | — | — | Override (default: `api.mercadolibre.com`) |

**GitHub Actions** (not in `.env` — repository secrets):

| Secret | Value |
|--------|-------|
| `APP_URL` | Public app URL, e.g. `https://your-app.vercel.app` |
| `CRON_SECRET` | Same value as on Vercel |

---

## Production (Vercel)

From-scratch checklist:

### 1. PostgreSQL

Create a managed Postgres instance (Neon, Supabase, Vercel Postgres, etc.) and note the connection string.

### 2. Deploy to Vercel

Connect the repository and set **Environment Variables** (Production):

- `DATABASE_URL`
- `MERCADOLIBRE_CLIENT_ID`, `MERCADOLIBRE_CLIENT_SECRET`
- `MERCADOLIBRE_REDIRECT_URI` → `https://YOUR-DOMAIN.vercel.app/api/auth/mercadolibre/callback`
- `ENCRYPTION_KEY` → generate **before** the first prod login
- `CRON_SECRET`
- `VAPID_*` → only if you want browser push

**Build:** the project runs `prisma generate` on `postinstall`. Migrations do **not** run automatically. After the first deploy, apply the schema:

```bash
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

Or set the Vercel Build Command to:

```
prisma migrate deploy && next build
```

(with `DATABASE_URL` already configured on the project).

### 3. Mercado Livre (prod)

In the DevCenter, add the production Redirect URI (same as `MERCADOLIBRE_REDIRECT_URI`).

Optional webhook (supplement to cron):

- URL: `https://YOUR-DOMAIN.vercel.app/api/ml/notifications/catalog-competition`
- Topic: `catalog_item_competition_status`

### 4. First login in production

Open the deployed app and log in with Mercado Livre. This writes tokens to `ml_seller_credentials`. Without it, the cron returns a token error.

### 5. GitHub Actions (cron every 10 min)

Workflow: [`.github/workflows/catalog-competition-cron.yml`](.github/workflows/catalog-competition-cron.yml)

**Repository → Settings → Secrets and variables → Actions → New repository secret:**

- `APP_URL` — Vercel app URL
- `CRON_SECRET` — same value as on Vercel

Run manually: **Actions → Catalog competition cron → Run workflow**.

Confirm on `/dashboard/catalog-report` that **Coletas hoje** increments.

---

## Catalog competition report

Primary data source: **cron** (GitHub Actions) or the manual button on the dashboard.

Each poll:

1. Calls `GET /items/{id}/price_to_win` for every catalog listing.
2. **Always** updates `listings` (`catalogStatus`, prices, `catalogPolledAt`).
3. Inserts into `catalog_competition_snapshots` when there is **no snapshot yet** or when **status changed**.

Timelines at `/dashboard/catalog-report/[itemId]` use snapshots plus a baseline before the selected window.

### ML webhook (optional)

The handler at `/api/ml/notifications/catalog-competition` also stores snapshots when status changes. Tokens come from the database (same OAuth flow). Useful as a supplement; cron is the primary source.

### Browser push (optional)

With `VAPID_*` configured, the dashboard bell enables OS-level alerts (e.g. listing started losing catalog competition). Pushes are triggered by the catalog **webhook**, not the cron.

---

## npm scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:migrate` | Dev migrations (`prisma migrate dev`) |
| `npm run db:generate` | Regenerate Prisma client after `schema.prisma` changes |

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Prisma `Unknown field …` | Run `npm run db:generate` and restart the dev server |
| ML login fails | `MERCADOLIBRE_REDIRECT_URI` matches DevCenter |
| Cron 401 | `CRON_SECRET` matches on Vercel and GitHub |
| Cron 503 / no token | ML login done in that environment; stable `ENCRYPTION_KEY` |
| Empty snapshots after poll | First poll creates a baseline; same status as before does not create a new snapshot |
| **Coletas hoje** not increasing | GitHub Actions log + JSON response from the cron endpoint |
