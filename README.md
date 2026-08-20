# shopping1a1-erp

Internal ERP for Mercado Livre operations: inventory, purchasing, catalog competition reporting, and optional browser alerts.

Stack: **Next.js**, **PostgreSQL**, **Prisma**, Mercado Livre OAuth.

---

## Architecture

Cross-cutting design, SaaS migration plans, and feature impact tracking live in **[docs/](docs/README.md)**.

Key documents:

- [SaaS multi-tenant migration](docs/architecture/saas-migration.md) — current single-tenant state, target model, roadmap
- [Tenant data model (proposal)](docs/architecture/tenant-data-model.md) — `Organization`, `User`, ML linkage

When adding features that touch data, APIs, or auth, update the feature registry in the SaaS migration doc (see [AGENTS.md](AGENTS.md)).

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
```

### Mercado Livre (dev)

In the ML app, register this Redirect URI:

```
http://localhost:3000/api/auth/mercadolibre/callback
```

It must match `MERCADOLIBRE_REDIRECT_URI` in `.env` **exactly**.

Login requests `scope=offline_access read write` to obtain a `refresh_token` and persist credentials in `ml_seller_credentials` (encrypted with `ENCRYPTION_KEY`).

### Cron in dev (optional)

In production, the catalog cron runs via [cron-job.org](https://cron-job.org). Locally you can:

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
| `MERCADOLIBRE_AUTH_BASE` | — | — | Override (default: Brazil) |
| `MERCADOLIBRE_API_BASE` | — | — | Override (default: `api.mercadolibre.com`) |

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

### 4. First login in production

Open the deployed app and log in with Mercado Livre. This writes tokens to `ml_seller_credentials`. Without it, the cron returns a token error.

### 5. cron-job.org (catalog poll ~every 10 min)

Create a job at [cron-job.org](https://console.cron-job.org) that calls your deployed app:

| Field | Value |
|-------|--------|
| URL | `https://YOUR-DOMAIN.vercel.app/api/cron/catalog-competition` |
| Method | `POST` |
| Schedule | Every 10 minutes |
| Header | `Authorization: Bearer YOUR_CRON_SECRET` (same value as on Vercel) |
| Header | `Content-Type: application/json` |
| Body | `{}` or empty |
| Timeout | 60s or higher (poll may take a while with many listings) |

Use **Execute now** once and confirm a JSON response like `{"ok":true,"checked":N,"changed":M}`.

Enable failure notifications in cron-job.org (email) so you know if a run fails.

Confirm on `/dashboard/catalog-report` that **Coletas hoje** increments after a successful run.

---

## Catalog competition report

Primary data source: **cron** (cron-job.org) or the manual button on the dashboard.

Each poll:

1. Calls `GET /items/{id}/price_to_win` for every catalog listing.
2. **Always** updates `listings` (`catalogStatus`, prices, `catalogPolledAt`).
3. Inserts into `catalog_competition_snapshots` when **any** of:
   - first observation for the item
   - **status changed** vs latest snapshot
   - **no snapshot today** in `America/Sao_Paulo` (daily heartbeat)
   - **seller or price-to-win changed** vs latest snapshot (even if status is the same)

Timelines at `/dashboard/catalog-report/[itemId]` use snapshots plus a baseline before the selected window.

---

## npm scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:migrate` | Dev migrations (`prisma migrate dev`) |
| `npm run db:generate` | Regenerate Prisma client after `schema.prisma` changes |
| `npm run seed:catalog-demo` | Seed timeline snapshots + mock sales for local catalog report UI |
| `npm run seed:sql` | Run SQL from `prisma/seeds/seed.sql` (optional `-- --conflict=<pk>`) |

### Local catalog report demo

To preview timeline + per-status sales without real ML orders:

```bash
npm run seed:catalog-demo
# optional: npm run seed:catalog-demo -- MLB1234567890
```

Then run `npm run seed:catalog-demo` and restart `npm run dev`. Open `/dashboard/catalog-report/<ITEM_ID>` (default: `MLB4561866095`).

Mock sales load automatically in development when `.mock/catalog-report-sales.json` exists. Set `CATALOG_MOCK_SALES=0` to use the real Mercado Livre orders API instead.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Prisma `Unknown field …` | Run `npm run db:generate` and restart the dev server |
| ML login fails | `MERCADOLIBRE_REDIRECT_URI` matches DevCenter |
| Cron 401 | `CRON_SECRET` in cron-job.org Authorization header matches Vercel |
| Cron 503 / no token | ML login done in that environment; stable `ENCRYPTION_KEY` |
| Empty snapshots after poll | First poll creates a baseline; same status as before does not create a new snapshot |
| **Coletas hoje** not increasing | cron-job.org execution history + JSON response from the cron endpoint |
