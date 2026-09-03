# twstock M8.11.2 — Swing10 Position Continuity Type Safety

Build-only hotfix on top of M8.11.1.

- Removes three `implicit any` paths introduced by `catch(... as any)`.
- Makes monitored-symbol set construction explicitly `string` typed.
- Makes Top20 and previous-alert maps explicitly typed.
- Normalizes the held-position fallback row so every `current_*` field exists even when a current smart-selection row is unavailable.
- No strategy formula changes, no database migration, no Queue/Bulk changes.
