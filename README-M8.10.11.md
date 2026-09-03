# M8.10.12 — Development Job Identity Fix

M8.10.12 keeps the M8.10.9/M8.10.10 Turso read-budget and orphan-job protections,
and fixes the remaining 0/0 display/resume bug by binding the development-center
status, watchdog, local resume and Vercel Queue continuation to the exact
`${YYYY-MM-DD}-development` job identity created by the Daily Update button.

## Key fix

- `readDevelopmentUpdateStatus()` now queries `cloud_update_jobs` by exact `job_date`.
- `getCloudStatus()` accepts explicit `jobId` / `jobDate` filters while preserving
  the generic latest-job behavior for non-development callers.
- The development UI can no longer accidentally show/resume a generic `${YYYY-MM-DD}`
  job while the real `${YYYY-MM-DD}-development` job contains the 2,143-symbol queue.
- The status hot path remains one bounded single-row Turso query.
- Existing Vercel Queue messages already carry the exact `jobId`; no changes to
  Winner25, Stealth Radar, Universe classification, or Top20 Cohort logic.
