# Plugin & workspace setup

postbox ships as a Claude Code plugin (slash commands + auto-surfacing hooks) and as a plain
CLI/library. This guide covers wiring it into a multi-folder workspace.

## Install the plugin

```
/plugin marketplace add rcmiskin10/postbox
/plugin install postbox
```

This gives every session the `/postbox:send|inbox|claim|report` commands and a
`SessionStart` + `UserPromptSubmit` hook that surfaces handoffs addressed to it. The bundled
`bin/postbox.mjs` is zero-dependency, so there is nothing to `npm install`.

To try before installing, point `--plugin-dir` at the **repo root** (which contains
`.claude-plugin/plugin.json`), not at the `.claude-plugin/` directory:

```
claude --plugin-dir /path/to/postbox
```

## `.postbox.toml` — the only per-workspace surface

Each participating folder needs a `.postbox.toml` that points at the shared mailbox and declares
the addresses the session answers to. Scaffold one with `init`:

```bash
postbox init --mailbox ./_briefs --identity product:foo,session:foo
```

```toml
handoff_dir  = "_briefs"      # the shared mailbox, relative to this file's dir
tenant_id    = "default"
lease_ttl    = "60m"          # must be > 0
target_match = "role"         # role | explicit-list | cwd-glob
identities   = ["product:foo", "session:foo"]
```

See [target-matching](./target-matching.md) for the three matching modes.

## Wire many folders at once

```bash
postbox wire --all ./projects --mailbox ./_briefs --apply       # every subfolder
postbox wire ./apps/web ./apps/api --mailbox ./_briefs --apply  # or name them
```

`wire` is a dry run until `--apply`, never clobbers an existing `.postbox.toml`, and accepts
`--exclude a,b`. Add `--with-hooks` **only for non-plugin installs** — it merges the inbox
pointer hook and the matching allow-rules into each folder's `.claude/settings.json`. (The
plugin already ships those hooks, so you don't need `--with-hooks` when installed as a plugin.)

## The surfacing hook

The shipped `hooks/hooks.json` runs, on `SessionStart` and `UserPromptSubmit`:

```
postbox inbox --session "$CLAUDE_PROJECT_DIR" --mark-processed --format pointer 2>/dev/null || true
```

- consumer matching comes from the folder's `.postbox.toml`;
- `--session "$CLAUDE_PROJECT_DIR" --mark-processed` advances the `.processed/` idempotency
  sentinel (SPEC §7) so an envelope is surfaced once per folder, not on every prompt;
- it emits a **pointer**, never the envelope body, framed as context to verify — not an
  instruction to execute;
- it ends in `2>/dev/null || true`, so a broken mailbox can never stall a session.

## The write boundary is yours to enforce

postbox **moves** envelopes; it cannot widen or gate your permissions. `postbox init` prints the
exact `.claude/settings.json` `"ask"` snippet to paste so writes across a session boundary
require confirmation. postbox mediates the handoff; your `settings.json` enforces the boundary.

## Filesystem check

Run `postbox doctor` once on the mailbox's filesystem. It verifies atomic rename and warns on
NFS/overlayfs/SMB, where the guarantee does not hold. See [atomicity](./atomicity.md).
