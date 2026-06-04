# 📮 postbox

> A **mailbox** for your agent sessions. Two Claude Code sessions (or any agents) running in
> different folders hand work off to each other through files — race-free, server-free —
> and the results flow back on their own.

**Status:** early / pre-1.0, but working — the spec ([`SPEC.md`](./SPEC.md)) is stable and the
CLI ships green (89 tests, incl. a 32-process claim race). Files-only, no server, MIT licensed.

---

## The idea in ten seconds

A directory is the queue. Sending a task = writing a Markdown file into `ready/`. Claiming
it = atomically *renaming* that file into `claimed/`. Finishing it = renaming into `done/`
with the outcome appended. The rename **is** the lock — so two sessions can never grab the
same task, with no database, no daemon, and no lock files.

```
_briefs/
  ready/    ◄── outgoing, unclaimed
  claimed/  ◄── someone's working on it (lease encoded in the filename)
  done/     ◄── finished, with the outcome appended
  dead/     ◄── expired / abandoned
```

This is the qmail **Maildir** pattern (atomic-rename-between-directories) applied to agent
handoff. postbox is a concrete **mailbox**; Maildir is the **mechanism**; an
orchestrator-worker **message bus** is the job it does.

## Why it exists

When you run separate agent sessions — an orchestrator that plans and workers that
implement — handoff is manual: write a brief, copy-paste "go do this" into the other
session, then relay the result back by hand. postbox automates the delivery **and** the
return trip, while keeping the boundary real: it *moves* envelopes, it does not write across
your permission boundary (that stays in your `settings.json`).

## Install

### As a Claude Code plugin (recommended)

The repo is its own plugin marketplace. From any Claude Code session:

```
/plugin marketplace add rcmiskin10/postbox
/plugin install postbox
```

That gives every session the `/postbox:*` commands and a SessionStart/UserPromptSubmit hook
that auto-surfaces handoffs addressed to it. The `bin/postbox.mjs` it runs is a self-contained
zero-dependency bundle, so there's nothing to `npm install`.

*Dev mode* (try it before installing): `claude --plugin-dir /path/to/postbox`.

### As a CLI / library (npm)

```bash
npm install -g postbox        # the `postbox` command
# or
npx postbox doctor            # one-off
```

```js
import { Mailbox } from 'postbox';   // programmatic use
```

*Dev mode* and `--plugin-dir` point at the **repo root** (which contains the
`.claude-plugin/plugin.json` manifest), not at the `.claude-plugin/` dir itself.

### Library API

`import … from 'postbox'` exposes:

| export | kind | purpose |
|---|---|---|
| `Mailbox` | class | the state machine: `.send()`, `.inbox()`, `.claim()`, `.report()`, `.sweep()`, `.markProcessed()` |
| `STATES` | const | `['ready','claimed','done','dead']` |
| `createEnvelope` / `serializeEnvelope` / `parseEnvelope` | fn | build / write / read the envelope format |
| `matchesTarget` | fn | does an envelope `target` match a consumer (role / explicit-list / cwd-glob) |
| `uuidv7` | fn | mint a time-ordered, monotonic uuidv7 |
| `loadConfig` / `parseDuration` | fn | resolve `.postbox.toml` for a cwd / parse a `60m`-style duration |

```js
import { Mailbox, loadConfig } from 'postbox';
const { handoffDir, tenantId, leaseTtlMs } = loadConfig(process.cwd());
const mb = new Mailbox({ dir: handoffDir, tenantId, leaseTtlMs });
const env = mb.send({ type: 'brief', target: 'product:foo', sourceRole: 'orchestrator', body: '# do X' });
```

## Wire your folders onto one shared mailbox

Each participating folder needs a `.postbox.toml` pointing at the shared mailbox. Do one folder
with `init`, or all of them at once with `wire`:

```bash
postbox init                                            # scaffold THIS folder's config
postbox wire --all ./projects --mailbox ./_briefs --apply   # bulk-wire every subfolder
postbox wire ./apps/web ./apps/api --mailbox ./_briefs --apply   # or name them explicitly
```

`wire` is dry-run until `--apply`, never clobbers an existing `.postbox.toml`, and takes
`--exclude a,b` to skip folders. Add `--with-hooks` only for **non-plugin** installs (the
plugin already ships the inbox hooks) to also merge the SessionStart/UserPromptSubmit pointer
into each folder's `.claude/settings.json`.

## The verbs

```bash
/postbox:send         # (in the orchestrator) address a task to a worker session
/postbox:inbox        # (in the worker) read what's addressed to you — also auto-surfaced on session start
/postbox:claim <id>   # take it (race-free; exit 3 = already taken)
/postbox:report <id>  # finish it; the outcome flows back to the sender
```

## Build from source

```bash
pnpm install          # also builds bin/postbox.mjs via the prepare script
pnpm build            # rebuild the zero-dep bundle (src/cli.mjs → bin/postbox.mjs)
pnpm test             # builds, then runs the suite
```

## Design contract (5 axes)

| axis | value |
|---|---|
| **layer** | cross-cutting coordination tooling (not an app/scraper/data-plane/skill) |
| **tenancy** | multi-tenant-ready (`tenant_id` from day one; no schema change to go multi) |
| **deployment** | local POSIX CLI + Claude Code plugin shell; **no server** |
| **identity** | every envelope has a `uuidv7` id = the end-to-end idempotency key |
| **envelope** | frontmatter is a projection of the EventEnvelope — mirrorable to a data plane |

## What postbox is deliberately **not**

It is not a message-broker server, a dashboard, a scheduler, a file-watching daemon, a
state store, or an agent registry — the agent platform is shipping all of those. postbox
owns the one thing the platform isn't standardizing: **the envelope schema + the
status-in-path convention + the return-channel protocol.** When native agent mailboxes
(e.g. `agent-teams`) mature, postbox adds a one-way bridge *into* them rather than competing.

Full design rationale: [`SPEC.md`](./SPEC.md).

## License

[MIT](./LICENSE) © 2026 Ricky Miskin
