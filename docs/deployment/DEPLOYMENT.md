# M7.8.5 Deployment Guide

## Runtime separation

M7.8.5 uses three separate checks:

- `npm run doctor`: local computer, `.env.local`, toolchain and project structure.
- `npm run ci-check`: GitHub CI, tests, TypeScript and production build. It does not read `.env.local`.
- `npm run check:prod`: Vercel Production environment variables.

## GitHub Repository Secrets

Required:

- `TWSTOCK_PRODUCTION_URL` — `https://taiwan-stock-tool-sable.vercel.app`
- `CLOUD_ADMIN_SECRET`
- `MONITORING_SECRET`

Required only when guarded rollback is enabled:

- `VERCEL_TOKEN`

The Vercel project must remain connected to `Caroma001/taiwan-stock-tool`, with Production Branch set to `main`. Vercel Git Integration performs the deployment. GitHub Actions verifies the commit and observes `/api/health` and `/api/ready`; it does not run `vercel deploy`.

## Local startup

```bash
npm install
cp ../twstock-M7.8.3/.env.local ./.env.local
npm run doctor
npm run ci-check
```

## First push from a new version folder

```bash
git init
git branch -M main
git remote add origin https://github.com/Caroma001/taiwan-stock-tool.git
git add .
git commit -m "Release twstock M7.8.5 deployment runtime stabilization"
git fetch origin
git push -u origin main --force-with-lease
```

Later updates use normal `git push`.

## Expected cloud flow

```text
Git push to main
→ GitHub Verify and Build
→ Vercel Git Integration deploys Production
→ GitHub waits for propagation
→ /api/health and /api/ready
→ scheduled monitoring and guarded rollback
```

## M7.8.5 URL handling

The production URL is never passed through a GitHub job output. Both
`wait-for-vercel` and `production-health-gate` read
`TWSTOCK_PRODUCTION_URL` directly from Repository Secrets. This avoids GitHub
secret masking suppressing the URL between jobs.
