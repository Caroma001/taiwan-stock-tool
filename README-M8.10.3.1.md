# M8.10.3.1 Winner25 Turso Stability Hotfix

- Winner25 sample writes use small Turso chunks (8 statements).
- If a libSQL batch fails, automatically falls back to single-row writes.
- Winner25 scan runs 5 symbols per HTTP step to reduce request payload and Turso pressure.
- Error messages now include the underlying Turso/libSQL cause and symbol.
- UI refreshes run status after a failure so `last_error` can be inspected.
