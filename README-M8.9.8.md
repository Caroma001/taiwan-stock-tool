# twstock-M8.9.8 — Development Stability Recovery

M8.9.8 is based on the uploaded, working M8.9.7 source tree. It does not inherit the broken M8.9.7.1 `.next` output.

## Fixes

- Development server now cleans `.next` **before** startup and runs Next.js dev with webpack for stability.
- Never delete `.next` while `npm run dev` is still running.
- Added a shared JSON fetch helper that detects HTTP 500 and non-JSON responses before parsing.
- Global update status polling is tolerant of temporary API failures.
- Daily Lab loads market, smart selection, and hot-stock data independently so one failed API does not blank the entire page.
- Added `/api/health` and a route error boundary.
- Development status reads no longer run all Turso migrations on every 2.2-second status poll.

## Start

```bash
cd ~/Projects/twstock-M8.9.8
node scripts/link-shared-env.mjs
npm install
npm run verify
npm run dev
```

Do not run `rm -rf .next` after the dev server has started. The M8.9.8 dev command clears stale cache before startup automatically.
