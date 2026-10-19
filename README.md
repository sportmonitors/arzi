# Arz Calculator + Cloudflare Time Tracker

Next.js app for currency/earnings calculation (Firebase Auth + Firestore payments) and work-time tracking on **Cloudflare D1**.

- `/` — calculator (payments from Firestore, work logs from D1)
- `/timer` — Clockify-like start/stop timer + CRUD (admin only)

## Local time DB

```bash
npm run db:migrate:local
npm run db:import:local
npm run dev
```

## Deploy to Cloudflare Workers

Preferred path (especially from restricted networks): push to `main` or run **Deploy to Cloudflare Workers** in GitHub Actions.

Required repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Details: [docs/CLOUDFLARE_DEPLOY.md](docs/CLOUDFLARE_DEPLOY.md).
