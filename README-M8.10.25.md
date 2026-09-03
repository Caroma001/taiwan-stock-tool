# twstock M8.10.25 — Risk Intelligence Type Safety

This release preserves the M8.10.24 Risk & Margin Intelligence design and fixes
a compile-time TypeScript inference regression in `lib/smart-selection/service.ts`.

## Root cause

The `riskRows` conditional/catch expression caused the value type of
`new Map(riskRows.rows.map(...))` to be inferred as `{}`.  All 29 TS2339 errors
were downstream symptoms of that single inference point.

## Fix

`riskMap` is now explicitly `Map<string, DatabaseRow>` and populated in a typed
loop.  No scoring formula, API source, Turso schema, Queue logic, or Bulk daily
pipeline is changed.

Migration 33 remains the current database migration; M8.10.25 adds no migration.
