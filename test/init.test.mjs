import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/config.mjs';

const execFileP = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'postbox.mjs');

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-init-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// init writes .postbox.toml into the cwd, so run with cwd = the temp dir
const run = (args) => execFileP(process.execPath, [BIN, ...args], { cwd: dir });

describe('postbox init — consumer scaffolding', () => {
  test('bare init writes a default .postbox.toml the config loader accepts', async () => {
    await run(['init']);
    expect(existsSync(join(dir, '.postbox.toml'))).toBe(true);
    const cfg = loadConfig(dir);
    expect(cfg.targetMatch).toBe('role');
  });

  test('--identity and --mailbox scaffold a consumer config (round-trips through loadConfig)', async () => {
    const { stdout } = await run([
      'init', '--identity', 'product:vibedraft,session:vibedraft', '--mailbox', '../../_briefs', '--match', 'role',
    ]);
    const toml = readFileSync(join(dir, '.postbox.toml'), 'utf8');
    expect(toml).toContain('handoff_dir  = "../../_briefs"');
    expect(toml).toContain('"product:vibedraft"');
    expect(toml).toContain('"session:vibedraft"');

    const cfg = loadConfig(dir);
    expect(cfg.identities).toEqual(['product:vibedraft', 'session:vibedraft']);
    // handoff_dir resolves relative to the config file's dir
    expect(cfg.handoffDir).toBe(join(dir, '../../_briefs'));

    // it also prints the SessionStart hook the consumer must paste into settings.json
    expect(stdout).toContain('SessionStart');
    expect(stdout).toContain('inbox --format pointer');
  });

  test('is idempotent — a second init does not clobber an existing config', async () => {
    await run(['init', '--identity', 'product:foo']);
    const before = readFileSync(join(dir, '.postbox.toml'), 'utf8');
    const { stderr } = await run(['init', '--identity', 'product:bar']).catch((e) => e);
    const after = readFileSync(join(dir, '.postbox.toml'), 'utf8');
    expect(after).toBe(before);
    expect(after).toContain('product:foo');
  });
});
