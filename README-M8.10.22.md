# twstock M8.10.22 — Durable Queue Recovery v2

## Problem fixed

M8.10.21 could reach this state:

- successor B was **published**
- successor B was **never consumed**
- safety A saw that the continuation ID changed from A to B
- safety A incorrectly treated "newer continuation exists" as "queue is healthy"

The market job then stayed at the same processed count forever.

## New rule

**Published is not Alive.**

A successor is healthy only when one of these is true:

1. its own `consumed_continuation_id` proves it was consumed recently;
2. its own `heartbeat_continuation_id` has a fresh heartbeat;
3. the same generation has already advanced beyond that successor, proving it ran far enough to publish the next continuation;
4. the market job is complete.

## Generation fencing

Each queue chain has an integer `generation`.

If a successor is orphaned:

1. Safety-net atomically claims a recovery lease.
2. A recovery work message is published as Generation N+1.
3. The old continuation is recorded as superseded.
4. Any late Generation N work message is ACK/NO-OP before market work starts.
5. Recovery count / reason are displayed in Development Center.

This prevents a late old queue message and a new recovery queue message from processing the same job concurrently.

## Successor Safety-net

M8.10.22 arms Safety-net for the **next work continuation** before publishing
that successor.

Example:

A is running
→ compute successor B
→ arm Safety(B)
→ publish B
→ return / acknowledge A

Safety(B) checks B itself after 150 seconds.

If B is only published but has no B-specific consumed/heartbeat evidence, it is
declared orphaned and Generation N+1 recovery is published.

## Preserved M8.10.20/M8.10.21 behavior

- Bulk daily price snapshot
- Bulk institutional snapshot
- Bulk foreign accumulation
- Active Job Source of Truth
- Trading-date resolution
- Empty-job recovery
- Low Turso Rows Read status polling
- Vercel Queue asynchronous continuation


## Recovery classification

Safety-net records the exact reason:

- `successor_not_published` — predecessor is still current after the successor should have been published.
- `successor_not_consumed` — successor is current/published but no successor-specific Consume evidence exists.
- `successor_heartbeat_stale` — successor was consumed, but its own heartbeat died and the chain did not advance.

All three cases use the same generation fence before publishing recovery.
