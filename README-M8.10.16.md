# M8.10.17 — Unified Progress Source of Truth

## Goal

Eliminate the split where Active Job Diagnostics showed real progress (for example 214/2143) while Development Center still showed 0/0.

## Changes

- Development status is now derived directly from the singleton `active_development_job` pointer row.
- The same pointer query joins `cloud_update_jobs` and `daily_update_pipeline_state`, so market progress and post-process identity share one read snapshot.
- Removed the second `getCloudStatus()` lookup from the Development Center hot status path.
- Added `pipeline_state.job_id` identity at market-job start with `INSERT OR IGNORE`, so Pipeline / Queue / Pointer can be compared before post-processing begins.
- Browser last-good cache key bumped to M8.10.17 so stale M8.10.15 0/0 snapshots are not reused.
- Status API returns `statusSource=unified_active_pointer`, `unifiedProgress=true`, and `statusSchemaVersion=M8.10.17-unified-v1`.
- Active Job Diagnostics reuses the joined pipeline identity rather than issuing an independent pipeline lookup.
- Keeps M8.10.15 trading-date resolution and empty-job recovery unchanged.

## Expected result

When Diagnostics reports `processed_symbols=214` and `total_symbols=2143`, Development Center and Global Update Progress must display the same 214/2143 snapshot.
