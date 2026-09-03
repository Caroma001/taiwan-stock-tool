# Bruce TWST-AI Release SOP

## Daily development

```bash
node scripts/link-shared-env.mjs
npm install
npm run dev
```

Use localhost for functional testing. Stop the development server before a clean production build when troubleshooting.

## Release verification

```bash
npm run verify
```

This runs automation safety checks, TypeScript checking, and the optimized Next.js production build. Deployment must not proceed when any step fails.

## Production deployment

The project is deployed manually during M8 development. The first time a new version folder is used:

```bash
npx vercel link
```

After the folder is linked:

```bash
npm run deploy
```

`npm run deploy` verifies the project before calling `vercel --prod`.

## Production smoke test

```bash
TWSTOCK_PRODUCTION_URL=https://taiwan-stock-tool-sable.vercel.app npm run production:verify
```

## Release publication

```bash
npm run release:check
npm run release:prepare
npm run release:publish
```

The publish command requires a clean Git working tree. It deploys production and creates an annotated local Git tag when Git is configured.

## Rollback

Rollback is never automatic during M8 development.

```bash
npm run rollback -- <last-known-good-deployment-url-or-id>
TWSTOCK_PRODUCTION_URL=https://taiwan-stock-tool-sable.vercel.app npm run production:verify
```
