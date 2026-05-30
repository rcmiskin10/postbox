import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, parseDuration } from '../src/config.mjs';

let root;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'postbox-cfg-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('parseDuration', () => {
  test.each([
    ['60m', 3600000],
    ['2h', 7200000],
    ['30s', 30000],
    ['1d', 86400000],
    ['500', 500],
  ])('%s → %d ms', (input, ms) => {
    expect(parseDuration(input)).toBe(ms);
  });
});

describe('loadConfig', () => {
  test('returns defaults when no .postbox.toml exists', () => {
    const cfg = loadConfig(root);
    expect(cfg.tenantId).toBe('default');
    expect(cfg.targetMatch).toBe('role');
    expect(cfg.leaseTtlMs).toBe(3600000);
    expect(cfg.handoffDir).toBe(join(root, '_briefs'));
    expect(cfg.identities).toEqual([]);
  });

  test('reads values from .postbox.toml and resolves handoff_dir to the config location', () => {
    writeFileSync(join(root, '.postbox.toml'), [
      'handoff_dir = "mail"',
      'tenant_id = "acme"',
      'lease_ttl = "15m"',
      'target_match = "role"',
      'identities = ["product:foo", "role:writer"]',
    ].join('\n'));

    const cfg = loadConfig(root);
    expect(cfg.handoffDir).toBe(join(root, 'mail'));
    expect(cfg.tenantId).toBe('acme');
    expect(cfg.leaseTtlMs).toBe(15 * 60 * 1000);
    expect(cfg.identities).toEqual(['product:foo', 'role:writer']);
  });

  test('walks up parent directories to find the nearest .postbox.toml', () => {
    writeFileSync(join(root, '.postbox.toml'), 'tenant_id = "root-level"');
    const deep = join(root, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });

    const cfg = loadConfig(deep);
    expect(cfg.tenantId).toBe('root-level');
    // handoff_dir resolves against the config's own directory, not the deep cwd
    expect(cfg.handoffDir).toBe(join(root, '_briefs'));
  });

  test('an absolute handoff_dir is used verbatim', () => {
    writeFileSync(join(root, '.postbox.toml'), `handoff_dir = "/var/mailbox"`);
    expect(loadConfig(root).handoffDir).toBe('/var/mailbox');
  });
});
