# twstock M8.10.15

## Active Job Source of Truth stabilization

M8.10.15 supersedes M8.10.13. It keeps the M8.10.13 Job Source of Truth architecture and includes the TypeScript nullability correction required by the release verification/build path.

### Included
- Single Active Job source-of-truth resolution
- Active Job diagnostics and pointer repair
- Job/item counter reconciliation safeguards
- Vercel Queue / pipeline / pointer cross-checks
- Daily Lab diagnostics integration
- Turso read-budget guard
- CI rules aligned with Vercel Queue + browser watchdog architecture
- Version raised consistently to 8.10.15 / M8.10.15
- `DatabaseStatement | null` typing correction in `lib/cloud/jobs.ts`

### Local verification
```bash
npm ci
npm run typecheck
npm run verify
```

Only deploy after verification succeeds:
```bash
npx vercel link
npx vercel --prod
```
