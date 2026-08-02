
## TSDE M2

### POST `/api/sync/price-foundation-start`

Create test or full-market queue. Use `{ "testMode": false, "maxAttempts": 5 }` for the full market.

### POST `/api/sync/price-foundation-run`

Run one batch. Use `{ "useSavedSettings": true }` to load M2 settings from Supabase.

### GET / POST `/api/sync/price-foundation-control`

Read or update `enabled`, `batchSize`, `delayMs`, `pollIntervalSeconds`, and `maxAttempts`.

### GET `/api/sync/price-foundation-status`

Return progress, recent tasks, speed metrics, ETA, and saved execution settings.

### GET / POST `/api/cron/price-foundation`

Run one saved-settings batch when automatic synchronization is enabled. In production, requires `Authorization: Bearer <CRON_SECRET>`.
