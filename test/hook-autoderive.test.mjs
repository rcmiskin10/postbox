import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/config.mjs';

const execFileP = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'postbox.mjs');

let root;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'postbox-autoderive-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const runIn = (cwd, args) =>
  execFileP(process.execPath, [BIN, ...args], { cwd })
    .then(({ stdout }) => ({ code: 0, stdout }))
    .catch((e) => ({ code: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }));

describe('config derivation (lets one generic hook replace per-folder wiring)', () => {
  test('session derives from the session:<name> identity when no explicit session key', () => {
    writeFileSync(join(root, '.postbox.toml'), 'identities = ["product:foo", "session:foo"]\n');
    expect(loadConfig(root).session).toBe('foo');
  });

  test('an explicit session key wins over the identity convention', () => {
    writeFileSync(join(root, '.postbox.toml'), 'identities = ["session:foo"]\nsession = "bar"\n');
    expect(loadConfig(root).session).toBe('bar');
  });

  test('source_role is exposed for the orchestrator return channel', () => {
    writeFileSync(join(root, '.postbox.toml'), 'source_role = "orchestrator"\n');
    const cfg = loadConfig(root);
    expect(cfg.sourceRole).toBe('orchestrator');
    expect(cfg.session).toBe(null); // no session identity, no key
  });
});

describe('inbox with NO flags behaves like a hand-wired --session --mark-processed hook', () => {
  test('a consumer pointer surfaces a brief once, then stays silent (auto dedup)', async () => {
    writeFileSync(join(root, '.postbox.toml'), 'identities = ["product:foo", "session:foo"]\n');
    await runIn(root, ['send', '--type', 'brief', '--target', 'product:foo', '--source', 'orchestrator']);

    const first = await runIn(root, ['inbox', '--format', 'pointer']);
    expect(first.stdout).toContain('postbox:'); // surfaced

    const second = await runIn(root, ['inbox', '--format', 'pointer']);
    expect(second.stdout.trim()).toBe(''); // already marked processed → silent
  });

  test('an orchestrator pointer surfaces its return channel from source_role alone', async () => {
    // root config: source-side only (no consumer identities), names itself the orchestrator
    writeFileSync(join(root, '.postbox.toml'), 'source_role = "orchestrator"\nsession = "orchestrator"\n');

    const sent = await runIn(root, ['send', '--type', 'brief', '--target', 'product:x', '--source', 'orchestrator']);
    const { id } = JSON.parse(sent.stdout);
    await runIn(root, ['claim', id, '--session', 'x']);
    await runIn(root, ['report', id, '--session', 'x', '--outcome', 'PR #1']);

    const ptr = await runIn(root, ['inbox', '--format', 'pointer']); // no flags
    expect(ptr.stdout).toContain('completed handoff');
  });
});
