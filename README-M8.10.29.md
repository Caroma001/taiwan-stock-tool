# twstock M8.10.29 — Swing10 Test Position UI Guard

M8.10.29 is a narrow UI safety hotfix over M8.10.28.

## Fixed

When an A-grade Swing10 candidate already has an open **test** position, the candidate row now shows:

```text
✅ 已加入測試    實際買入
```

The test button is disabled and cannot open another test-entry modal. The real-buy button intentionally remains available so a paper-tested candidate can later be entered with a small real position.

The server-side same-type `alreadyExists` protection remains unchanged, so duplicate test positions are guarded both in the UI and in the trade API/service.

## Scope

No strategy formula changes, no Exit Alert changes, no Queue/Bulk changes, no database migration, and no Turso schema changes.
