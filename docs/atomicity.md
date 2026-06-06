# Atomicity: how postbox is race-free without locks

postbox has no server, no database, no lock files, and no daemon. Correctness rests entirely on
one POSIX guarantee: **`rename(2)` is atomic within a single filesystem.** This note explains how
that one primitive is enough. (SPEC §5–§6 is the normative version.)

## CAS-on-source, never CAS-on-target

A claim is: rename the single `ready/<uuid>.md` to a uniquely-named `claimed/<uuid>.<session>.<leaseMs>.md`.

```
rename( ready/<uuid>.md , claimed/<uuid>.<session>.<leaseMs>.md )
  success → this session owns the lease
  ENOENT  → someone else already claimed it (the source is gone); back off
```

The compare-and-swap is on the **source**'s existence. When N sessions race, the kernel lets
exactly one `rename` of that source succeed; every loser gets `ENOENT`. Because each winner picks
a *distinct* destination name, there is no contention on the target and no read-modify-write of a
shared field.

The tempting alternative — "fail if the target exists" — is broken on real filesystems:

| approach | with a pre-occupied target | verdict |
|---|---|---|
| `mv -n src dst` | exit 0 but does nothing; **src remains** | ✗ double-claim |
| `mv src dst` | silently clobbers dst | ✗ data loss |
| `rename(src, uniqueDst)` racing on the same src | one wins, losers `ENOENT` | ✓ |

This is exercised by `test/claim-race.test.mjs` (16 processes) and `test/qa.test.mjs` (32).

## Crash-safe writes: tmp → fsync → rename

Creating (`send`) and rewriting (`claim`/`report`/`sweep` metadata) never write a destination
file in place. They write into `.tmp/`, `fsync`, then `rename` into position. A crash mid-write
leaves a stray `.tmp` file, never a half-written envelope visible in a state directory.

`_rewrite` additionally refuses to recreate a destination that has vanished (e.g. a sweeper
reclaimed the file): rather than letting `rename` re-create it — `rename(2)` happily creates a
missing target — it throws `ENOENT` so the caller treats it as a lost race. This is what keeps a
single envelope from ever occupying two state directories at once.

## Leases, not locks

A claim is a **lease** with an expiry encoded in the filename (`<uuid>.<session>.<leaseExpMs>.md`,
where `leaseExpMs` is a Unix epoch-millisecond integer). A crashed session never wedges a mutex:
any later `sweep()` renames the expired `claimed/` file back to `ready/`. Sweep is itself a
CAS rename, so two sweepers racing is safe, and one corrupt or concurrently-claimed entry can't
abort the rest of the sweep. There is no timer and no daemon — callers sweep opportunistically
(every `inbox` call and the surfacing hook do).

## The one hard requirement: a single POSIX filesystem

All four state directories are siblings under `handoff_dir`, so a claim/report rename stays on
one filesystem by construction. The guarantee **does not hold on NFS, overlayfs, SMB, or some
FUSE mounts**, where `rename` atomicity is not promised. Run `postbox doctor` — it performs a
real rename in the mailbox and warns loudly if the filesystem looks unsafe. Do not host a mailbox
on a network or union filesystem.
