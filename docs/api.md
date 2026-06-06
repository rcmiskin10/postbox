# Library API

postbox is usable as a zero-config Node library, not just a CLI. The package entry point
(`import … from 'postbox'`) re-exports everything from `src/`.

```js
import { Mailbox, loadConfig } from 'postbox';
```

All file operations are synchronous (the whole design is a thin layer over `rename(2)`), so the
API is synchronous too. There is nothing to `await`.

## `loadConfig(cwd) → config`

Walks up from `cwd` to the nearest `.postbox.toml`, merges it over the defaults, and resolves
`handoff_dir` relative to the config file's own directory.

```js
const cfg = loadConfig(process.cwd());
// → { handoffDir, tenantId, leaseTtlMs, targetMatch, identities, filenamePattern, configFile, cwd }
```

## `parseDuration(value) → ms`

`"60m"` / `"2h"` / `"1d"` / `"500"` (bare = ms) → milliseconds. Throws on a non-positive or
malformed value.

## `new Mailbox({ dir, tenantId?, leaseTtlMs? })`

Creates the state directories (`ready/ claimed/ done/ dead/` + `.tmp/`) under `dir` if missing.
`tenantId` defaults to `"default"`; `leaseTtlMs` defaults to one hour.

### `.send({ type, target, sourceRole, body?, eventType? }) → envelope`

Atomically creates a new envelope in `ready/` (tmp → fsync → rename) and returns it, including
its freshly minted `uuidv7` `id`. A half-written envelope is never visible.

### `.inbox({ consumer?, asSource?, unprocessedFor?, now?, sweep? }) → { ready, done }`

Returns the envelopes a session should see: `ready/` envelopes whose `target` matches `consumer`
(see [target-matching](./target-matching.md)), plus `done/` envelopes whose `source_role` equals
`asSource` (the return channel for the writer). Runs an opportunistic `sweep()` first unless
`sweep: false`. `unprocessedFor: <session>` hides envelopes already marked processed for that
session. Corrupt/unreadable files are skipped, not fatal.

### `.claim(id, { session, now? }) → result`

Compare-and-swap on the **source** path: renames `ready/<id>.md` → `claimed/<id>.<session>.<leaseExpMs>.md`.
Exactly one concurrent caller wins; losers get `{ ok: false, reason: 'already-claimed', id }`.
The winner gets `{ ok: true, id, session, leaseExpMs, path }` (with an optional `warning` if the
post-claim metadata write failed — the lease still holds, since it lives in the filename).

### `.report(id, { session, outcome?, now? }) → result`

Appends a `## Outcome` block + a `status_history` record (never overwriting the body), then
CAS-renames `claimed/ → done/`. Returns `{ ok: true, id, path, outcome_ref }`, or
`{ ok: false, reason }` where `reason` is `lease-not-owned` (you never held it) or `lease-expired`
(a sweep reclaimed it before you reported).

### `.sweep({ now? }) → { reclaimed }`

Renames every expired `claimed/` lease back to `ready/`, appending a reclaim record. Race-safe
(two sweepers → one wins) and resilient (a corrupt or concurrently-claimed entry can't abort it).
Returns the list of reclaimed ids.

### `.markProcessed(session, id)` / `.isProcessed(session, id)`

Write / test the idempotency sentinel at `.processed/<session>/<id>` (SPEC §7).

## Envelope helpers

- `createEnvelope({ type, target, sourceRole, tenantId?, body?, eventType? })` → a fresh envelope object.
- `serializeEnvelope(env)` → the `---\n<yaml>\n---\n\n<body>\n` text.
- `parseEnvelope(text)` → `{ ...frontmatter, body }` (tolerant of CRLF).

## `matchesTarget(target, consumer)`

The pure matching predicate behind `inbox`. See [target-matching](./target-matching.md).

## `uuidv7()`

A canonical, time-ordered, monotonic-within-a-millisecond UUIDv7 string — the envelope id and
end-to-end idempotency key.

## `STATES`

`['ready', 'claimed', 'done', 'dead']` — the four authoritative states (status-in-path).
