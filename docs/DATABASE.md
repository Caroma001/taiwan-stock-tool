# Database Release Rules

- Turso is the system of record.
- Every schema change must be idempotent.
- A release must identify whether a database migration is required.
- Never delete two-year price history during routine deployment.
- Back up or export critical data before destructive migrations.
- Release M8.7.1 introduces no destructive database migration.
