# Target matching

Every envelope carries a `target` address. A consuming session decides whether an envelope is
"for me" via one of three `target_match` modes (set in `.postbox.toml`, SPEC §10). The matching
is implemented by `matchesTarget(target, consumer)` in `src/target-match.mjs`.

## `role` (default)

The session declares the addresses it answers to in `identities`. An envelope matches if its
`target` is one of them — an exact string compare.

```toml
# .postbox.toml
target_match = "role"
identities   = ["product:foo", "session:bar"]
```

```
target: product:foo   → matches (in identities)
target: product:baz   → no match
```

This is the right default: senders address logical roles (`product:foo`, `role:writer`) and each
session opts into the roles it plays.

## `explicit-list`

A static map from `target` → the list of cwds allowed to consume it. The session matches if its
own `cwd` appears in the target's list. Use this when addressing is centrally defined rather than
self-declared.

```
target "deploy:prod" → ["/srv/app-a", "/srv/app-b"]
consumer.cwd = /srv/app-a  → matches
```

## `cwd-glob`

The `target` is itself a path glob, matched against the consumer's `cwd`. Useful when you want to
address "whichever session is running in this directory tree."

```toml
target_match = "cwd-glob"
```

```
target: projects/*        matches cwd  projects/foo      (but not projects/foo/bar)
target: projects/**        matches cwd  projects/foo/bar
target: apps/?             matches cwd  apps/a
```

Glob semantics (minimal, path-aware): `**` = any characters, `*` = any run of non-`/`,
`?` = a single non-`/`. Everything else is matched literally.

## How the CLI builds the consumer

`postbox inbox` derives the consumer from flags first, then config:

- `--identities a,b` (or `--identity a,b`) → `role` mode with those identities.
- `--cwd <path>` → `cwd-glob` mode against that path.
- otherwise, the `.postbox.toml` in (or above) the cwd supplies `identities` / `target_match`.

If no consumer can be derived and `--as-source` was not given, `inbox` prints a warning and shows
nothing — configure `identities` or pass a flag.
