# Deployment Guide

## Environments

- Local: `http://localhost:3000`
- Production: Vercel project `taiwan-stock-tool`
- Database: Turso
- Shared local environment: `~/Projects/GN.data/.env.local`
- Vercel environment variables must be configured separately in Vercel Project Settings.

## Required sequence

1. `npm run dev` — functional test.
2. `npm run verify` — safety, typecheck, production build.
3. Commit and push the version to GitHub when a repository is configured.
4. `npm run deploy` — manual Vercel production deployment.
5. `npm run production:verify` — smoke test the production URL.

## Important rules

- `npx vercel link` is required only once per new version folder.
- A successful `npm run dev` does not prove that production build will pass.
- Do not enable GitHub schedule or Vercel Cron during M8 development.
- Do not store secrets in Git.
- Production rollback is a manual decision.
