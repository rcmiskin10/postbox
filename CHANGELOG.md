# Changelog

All notable changes to postbox are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions track `package.json`.

`schema_version` (the envelope wire contract, SPEC §14) is independent of the package version —
it is currently **1** and has not changed.

## [Unreleased]

Lets a single generic inbox hook replace per-folder hook wiring — so the installed plugin's
hooks match a hand-wired setup, with no regression to dedup or the orchestrator return channel.
Backward compatible; no envelope schema change.

### Added
- **Config-derived inbox identity.** `inbox` now falls back to `.postbox.toml` for the session
  (`session` key, or the `session:<name>` identity convention) and source role (`source_role`),
  and auto-marks-processed when the session is derived. So `postbox inbox --format pointer` with
  no flags dedups like `--session X --mark-processed` and surfaces an orchestrator's return
  channel like `--as-source X` — exactly what a generic plugin hook needs.
- **`postbox unwire`** — inverse of `wire --with-hooks`: strips postbox inbox hooks from each
  folder's `.claude/settings.json` (for switching from hand-wired hooks to the installed plugin).
  Dry-run until `--apply`; leaves `.postbox.toml` and allow-rules intact.
- `wire` now writes an explicit `session` key into each consumer `.postbox.toml`.

## [0.1.2] — 2026-06-06

Packaging-only release. No code, API, or envelope schema change.

### Changed
- Published to npm under the scoped name **`@rcmiskin10/postbox`** (the unscoped `postbox` name is
  owned by an unrelated package). The installed CLI command is unchanged — still `postbox` — and
  the GitHub repo and Claude Code plugin are still named `postbox`. Only the npm package and the
  `import` specifier carry the scope. Added `publishConfig.access = "public"` so the scoped
  package publishes publicly.

## [0.1.1] — 2026-06-05

Bug-fix and documentation release. No envelope schema change; fully backward compatible.

### Fixed
- **Race safety (the core guarantee).** `sweep()` no longer crashes `inbox()` when a concurrent
  claimer grabs a just-reclaimed file, and `_rewrite()` refuses to recreate a destination that a
  sweeper removed out from under it — closing a window where an envelope could appear in two
  state directories at once. `report()` now returns a structured `lease-expired` result instead
  of throwing or ghost-resurrecting the file.
- `inbox()` isolates a corrupt/half-written `.md` file instead of letting it make the whole
  mailbox unreadable.
- `parseEnvelope` tolerates CRLF line endings (Windows tooling / `core.autocrlf`).
- `claim()` survives a failed post-CAS metadata write (the lease, encoded in the filename, still
  stands) and reports a warning rather than throwing.
- `uuidv7` is now monotonic within a millisecond (RFC 9562 `rand_a` counter), so lexicographic
  sort matches creation order even for sub-millisecond bursts.
- Session names containing `/`, `\`, or NUL are rejected up front instead of producing a
  misleading `ENOENT`.
- Zero-length lease durations are rejected (they would expire the instant a claim was made).
- `postbox migrate --apply` writes atomically (tmp → fsync → rename) and is idempotent across
  re-runs (a per-source sentinel prevents duplicate envelopes); it warns when writing in place.
- **Plugin hooks** now pass `--session "$CLAUDE_PROJECT_DIR" --mark-processed`, so the SPEC §7
  idempotency sentinel actually advances — envelopes no longer re-surface on every prompt.

### Added
- `--help` / `-h` and `postbox help <command>`; a bare `postbox` prints usage.
- Universal `--json` flag; `inbox --json` is an alias for `--format json`.
- `--key=value` argument form; `claim`/`report` accept `--id <id>` as well as the positional.
- `--identity`/`--identities` accepted interchangeably across `inbox` and `init`.
- `loadConfig` and `parseDuration` are now exported from the library entry point.
- `docs/` directory: API reference, plugin setup, migration, target-matching, and atomicity guides.
- This `CHANGELOG.md`.

### Changed
- `--mark-processed` now errors without `--session`; `send --body` with no value is now a usage
  error instead of a silent empty body.
- SPEC and README reconciled with the implementation: `identities` (not `roles`), the
  epoch-millisecond claim-filename format, the real hook command and pointer text, documented
  `POSTBOX_DIR`/`--dir`, the `.tmp/` staging dir, and `send --source` / `migrate` in the CLI table.

### Not changed (deliberately deferred)
- The machine commands (`send`/`claim`/`report`/`sweep`/`doctor`/`migrate`) still emit JSON by
  default. Flipping them to human-readable-by-default is a breaking change to the slash-commands
  and is deferred to a future major release; `--json` is accepted everywhere in the meantime.

## [0.1.0] — 2026-05-30

Initial release: the envelope schema (`schema_version: 1`), the status-in-path state machine
(`ready`/`claimed`/`done`/`dead`), CAS-on-source claims, leases + opportunistic sweep, the
return channel, the `postbox` CLI, the Claude Code plugin (commands + surfacing hooks),
`postbox wire`, and `postbox migrate`.

[0.1.2]: https://github.com/rcmiskin10/postbox/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/rcmiskin10/postbox/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/rcmiskin10/postbox/releases/tag/v0.1.0
