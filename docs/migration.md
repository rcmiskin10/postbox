# Migrating a legacy `_briefs/` directory

If you already keep handoff briefs as a flat directory of Markdown files (the pre-postbox
convention), `postbox migrate` converts them into the postbox schema without losing anything.

## What it does

For each `*.md` in the source directory it:

1. parses the file's YAML frontmatter + body;
2. maps it onto a postbox envelope (`migrateLegacyBrief` in `src/migrate.mjs`) — stamping the
   fields the legacy format lacks (`id`, `created`, `source_role`, `type`, `schema_version`) and
   normalizing the legacy `status`/`target_product` into postbox `status` + `target`;
3. writes the envelope into `<to>/<status>/<uuid>.md`.

It **never deletes the source files** — migration is reversible.

## Dry run first (the default)

```bash
postbox migrate --from ./_briefs
```

Prints a JSON summary — how many files are migratable, how many were skipped (no frontmatter),
and a breakdown by status/target — but writes nothing.

## Apply

```bash
postbox migrate --from ./_briefs --to ./mailbox --apply
```

- Writes atomically (tmp → fsync → rename), so a crash mid-migration never leaves a half-written
  envelope.
- **Idempotent:** a per-source sentinel under `<to>/.migrated/` means re-running `--apply` skips
  files it already migrated instead of minting fresh UUIDs and accumulating duplicates. The
  output reports `written` vs `alreadyMigrated`.
- If you omit `--to`, migration happens **in place** — envelopes are written into
  `<from>/ready/` and `<from>/done/` alongside the untouched legacy files — and the CLI warns you
  it is doing so. Pass `--to <dir>` to write elsewhere.

## Status mapping

| legacy status (prose tolerated) | postbox status |
|---|---|
| `completed`, `done` | `done` |
| `abandoned`, `dead` | `dead` |
| anything else (`ready`, `in-progress`, `queued`, …) | `ready` |

`target_product: "brain (new sibling)"` → `product:brain`; if there is no `target_product`,
`target_session` becomes `session:<value>`; otherwise the target is `unknown`.
