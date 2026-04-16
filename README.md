This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Catalog competition webhook

Notifications for `catalog_item_competition_status` only carry metadata. The handler calls `GET /items/{id}/price_to_win` and inserts a row in `catalog_competition_snapshots` **only when your derived status changed** vs the latest snapshot.

### OAuth tokens in the database (no fixed access token env)

After a successful Mercado Livre login, the app stores the seller’s `refresh_token` and `access_token` in PostgreSQL table `ml_seller_credentials`, **encrypted at rest** with **AES-256-GCM** using `ENCRYPTION_KEY` (see [`src/lib/app-secret-crypto.ts`](src/lib/app-secret-crypto.ts)).

The webhook reads the notification `user_id`, loads credentials for that seller, decrypts the refresh token, refreshes the access token when needed, then calls `price_to_win`.

Required environment variables:

- `ENCRYPTION_KEY` — long random secret (used with scrypt to derive the AES key). **Do not rotate** without a migration path to re-encrypt existing rows.
- `MERCADOLIBRE_CLIENT_ID` and `MERCADOLIBRE_CLIENT_SECRET` — required for OAuth refresh (same as the login app).

Operational notes:

- Until at least one login has persisted credentials, the webhook responds **200** with `skipped: "no_stored_credentials"`.
- If `ENCRYPTION_KEY` is missing, the webhook responds **200** with `skipped: "missing_encryption_key"`.
- If the ML API call fails temporarily, the route responds **200** with `skipped` so Mercado Livre does not retry aggressively; database write failures return **500** so the notification can be retried.

Reports use **snapshots only** (plus a baseline snapshot before the window) so timelines stay correct when you only persist on change.
