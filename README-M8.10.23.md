# twstock M8.10.23 — Stealth Data Completeness Repair

This release does not change Bulk Daily Snapshot, Durable Queue Recovery v2, Trading Date, Active Job Source of Truth, or the 2143-symbol market pipeline.

## Fixes

1. 5/10/20-day institutional flow is calculated from the latest valid local net-flow observations, ignoring holding-only enrichment rows with NULL flow fields. Zero remains valid. No external API retry is used.
2. Core and auxiliary Stealth gaps are separated. Auxiliary trust/holding/TDCC gaps reduce confidence/components but do not by themselves force `stealth_score = NULL`.
3. `winner25_live_scores.missing_json` is updated after Stealth scoring with the union of Winner25 and Stealth missing features, removing the old contradiction between `missing_json=[]` and `stealth_reasons_json` reporting gaps.
4. Stealth Radar performs a one-time, local-only completeness repair per release/date when coverage is below the candidate universe. The marker is stored in `app_runtime_cache`, and `daily_update_pipeline_state.stealth_scored` is synchronized to the live-score source of truth.

Observed M8.10.22 case: 9934 成霖 can be rescored from existing Turso history without restarting the full daily job.
