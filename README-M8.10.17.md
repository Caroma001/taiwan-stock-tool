# M8.10.17 — Unified Progress Source of Truth Type Safety

M8.10.17 continues M8.10.16 and fixes the TypeScript inference failure in `app/api/development/update/status/route.ts`.

## Fix

The unified status payload is explicitly typed as `StatusPayload` before reading dynamic status fields such as `id`, `jobId`, `total_symbols`, and `error`. This preserves the M8.10.16 Source-of-Truth behavior while allowing `npm run typecheck` to validate the route.

## Expected verification

```bash
npm ci
npm run typecheck
npm run verify
```

Then deploy the same Vercel project with:

```bash
npx vercel link
npx vercel --prod
```
