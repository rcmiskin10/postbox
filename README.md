# 📮 postbox

> A **mailbox** for your agent sessions. Two Claude Code sessions (or any agents) running in
> different folders hand work off to each other through files — race-free, server-free —
> and the results flow back on their own.

**Status:** early / pre-1.0. The spec ([`SPEC.md`](./SPEC.md)) is stable; the CLI is being
built. Files-only, no server, MIT licensed.

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

## Install (Claude Code plugin)

```bash
# dev mode (until published to a marketplace)
claude --plugin-dir /path/to/postbox
```

Then in any workspace:

```bash
postbox init          # writes .postbox.toml + prints the settings.json boundary snippet
/postbox:send         # (in the orchestrator) address a task to a worker session
/postbox:inbox        # (in the worker) read what's addressed to you — also auto-surfaced on session start
/postbox:claim <id>   # take it (race-free)
/postbox:report <id>  # finish it; the outcome flows back to the sender
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
