# Current Release

- Current Version: M7.8.5
- Package Version: 7.8.5
- Status: Release Candidate
- Focus: Stable Production Health Gate URL handling
- Base: M7.8.4 deployment runtime stabilization

## Local validation

```bash
npm install
cp ../twstock-M7.8.4/.env.local ./.env.local
npm run doctor
npm run ci-check
```

## Cloud validation

A push to `main` runs:

```text
Verify and Build
Wait for Vercel Git Deployment
Production Health Gate
```

M7.8.5 removes cross-job URL output propagation. Each cloud job reads
`TWSTOCK_PRODUCTION_URL` directly from GitHub Repository Secrets.
