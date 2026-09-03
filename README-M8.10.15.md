# M8.10.15 — Trading-Date Job Recovery & Empty-Job Repair

## Core changes

- Daily update job identity now uses the **effective Taiwan trading date**, not the raw calendar date.
- TWSE official holiday OpenAPI is used to recognize exchange holidays.
- Saturday/Sunday automatically walk back to the latest trading session.
- Before 15:00 Asia/Taipei, the system uses the latest completed session instead of representing a partially-open day.
- If the TWSE holiday API is temporarily unavailable, the update button falls back to weekend/pre-close calendar logic instead of failing.
- Existing 0/0 or no-item jobs are treated as corrupt even when their header says `completed`.
- Corrupt jobs are rebuilt in-place: job counters, `cloud_update_items`, and stale postprocess state are reconstructed without creating a second competing Job ID.
- Status/Worker hot paths no longer recompute a date on every poll. They trust the persisted Active Job pointer established by Start.
- Diagnostics shows calendar date, effective trading date, date source, reason, Active/Queue/Pipeline/Pointer IDs, and whether queue items exist.

## Expected behavior on 2026-08-15 (Saturday)

The Daily Update entry resolves to `2026-08-14-development`. If an old empty 8/14 job exists, it is rebuilt. A stray 8/15 empty header will no longer become the active source of truth simply because the calendar date is 8/15.
