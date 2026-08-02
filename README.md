<!-- M78_CURRENT -->
## Current Release: M7.8.5

M7.8 uses one canonical command: `npm run check`. GitHub Push runs the same check, deploys Vercel Production, then verifies health/readiness. Turso and Daily Cron continue without the developer Mac.

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

<!-- TWSTOCK_RELEASE_START -->
## Current Release

- Version: M7.8.5
- Status: Release Candidate
- Check: `npm run check`
- Build: included in `npm run check`
<!-- TWSTOCK_RELEASE_END -->

## M7.8.5 validation flow

```bash
npm run doctor      # Local only: reads .env.local
npm run check       # CI-safe: tests, typecheck, build; no .env.local required
npm run check:prod  # Production only: validates real runtime variables
```

Real production secrets belong in Vercel Environment Variables. GitHub CI requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. The non-secret Vercel Team slug is pinned in the workflow for deterministic deployment.
