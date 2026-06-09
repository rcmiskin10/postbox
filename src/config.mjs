import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';

const DEFAULTS = {
  handoff_dir: '_briefs',
  tenant_id: 'default',
  lease_ttl: '60m',
  target_match: 'role',
  identities: [],
  session: null,
  source_role: null,
  filename_pattern: '<uuid>.md',
  retention: '30d',
};

/**
 * The session name a generic hook should dedup against. Explicit `session` key wins; otherwise
 * fall back to the `session:<name>` identity convention, so a folder wired the normal way needs
 * no extra key for `postbox inbox` (no flags) to behave like a hand-wired `--session` hook.
 */
function deriveSession(merged) {
  if (merged.session) return merged.session;
  for (const id of merged.identities ?? []) {
    const m = /^session:(.+)$/.exec(id);
    if (m) return m[1];
  }
  return null;
}

const UNIT_MS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };

/** Parse a duration like `60m` / `2h` / `1d` / `500` (bare = ms) → milliseconds. */
export function parseDuration(value) {
  if (typeof value === 'number') {
    if (value <= 0) throw new Error(`postbox: duration must be positive, got ${value}`);
    return value;
  }
  const m = String(value).match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!m) throw new Error(`postbox: invalid duration '${value}'`);
  const ms = Number(m[1]) * (m[2] ? UNIT_MS[m[2]] : 1);
  // A zero lease expires the instant it is claimed — the first opportunistic sweep reclaims it
  // before the owner can report. Reject it rather than silently breaking every claim.
  if (ms <= 0) throw new Error(`postbox: lease duration '${value}' resolves to 0ms; use a positive duration`);
  return ms;
}

/** Find the nearest `.postbox.toml` walking up from `start`, or null. */
function findConfigFile(start) {
  let dir = resolve(start);
  for (;;) {
    const p = join(dir, '.postbox.toml');
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve effective config for a working directory. The only per-workspace surface
 * (SPEC §10): all keys optional, merged over defaults. `handoff_dir` resolves relative to
 * the config file's own directory (so a deep cwd still points at the right mailbox).
 */
export function loadConfig(cwd) {
  const configFile = findConfigFile(cwd);
  const raw = configFile ? parseToml(readFileSync(configFile, 'utf8')) : {};
  const base = configFile ? dirname(configFile) : resolve(cwd);
  const merged = { ...DEFAULTS, ...raw };
  const handoffDir = isAbsolute(merged.handoff_dir) ? merged.handoff_dir : join(base, merged.handoff_dir);
  return {
    handoffDir,
    tenantId: merged.tenant_id,
    leaseTtlMs: parseDuration(merged.lease_ttl),
    targetMatch: merged.target_match,
    identities: merged.identities ?? [],
    session: deriveSession(merged),
    sourceRole: merged.source_role ?? null,
    filenamePattern: merged.filename_pattern,
    configFile,
    cwd: resolve(cwd),
  };
}
