# twstock M8.10.21 — Durable Queue Heartbeat

## Purpose

Replace the old browser-side "自動續傳中" guess with server-side proof that the
Vercel Queue message was published, consumed and remains alive.

## Durable chain

1. Work message is published and persisted to `daily_queue_runtime`.
2. Queue callback records `consumed_at` immediately.
3. The callback arms a delayed 360-second safety-net message.
4. Bulk download and local analysis write periodic `heartbeat_at` / `phase`.
5. Before the callback returns successfully it publishes exactly one successor,
   keyed from the current continuation ID.
6. If the main chain advanced, the delayed safety message is a no-op.
7. If the main chain failed to advance, the safety message becomes the recovery
   consumer and continues the same persisted job.
8. Callback errors are re-thrown so Vercel Queue can retry delivery.

## Legacy in-flight job bootstrap

An M8.10.20 job may exist without a Queue runtime row. The status API reports
`queueHeartbeat.needsBootstrap=true`. The global progress controller may call
`/api/development/update/resume` once, and the server obtains a short recovery
lease before publishing. After that first handoff, the browser is no longer
responsible for continuation.

## UI truth

The Daily Update page now distinguishes:

- 等待 Queue Consumer 啟動
- Queue Consumer 執行中
- Safety-net Recovery 執行中
- 資料源冷卻等待
- Queue 停滯，準備 Durable Recovery
- Queue 已完成

It also displays publish / consume / heartbeat timestamps and safety-net state.
