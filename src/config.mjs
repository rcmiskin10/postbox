import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';

const DEFAULTS = {
  handoff_dir: '_briefs',
  tenant_id: 'default',
  lease_ttl: '60m',
  target_match: 'role',
  identities: [],
  filename_pattern: '<uuid>.md',
  retention: '30d',
};

const UNIT_MS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };

/** Parse a duration like `60m` / `2h` / `1d` / `500` (bare = ms) → milliseconds. */
export function parseDuration(value) {
  if (typeof value === 'number') return value;
  const m = String(value).match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!m) throw new Error(`postbox: invalid duration '${value}'`);
  return Number(m[1]) * (m[2] ? UNIT_MS[m[2]] : 1);
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
    filenamePattern: merged.filename_pattern,
    configFile,
    cwd: resolve(cwd),
  };
}
