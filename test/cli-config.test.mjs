import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'postbox.mjs');

let root;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'postbox-cli-cfg-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

async function runIn(cwd, args) {
  try {
    const { stdout } = await execFileP(process.execPath, [BIN, ...args], { cwd });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('CLI config integration', () => {
  test('inbox derives the consumer + mailbox dir from .postbox.toml (no flags)', async () => {
    writeFileSync(join(root, '.postbox.toml'), 'handoff_dir = "_briefs"\nidentities = ["product:foo"]\n');

    const sent = await runIn(root, ['send', '--type', 'brief', '--target', 'product:foo', '--source', 'o']);
    const { id } = JSON.parse(sent.stdout);
    await runIn(root, ['send', '--type', 'brief', '--target', 'product:bar', '--source', 'o']); // not addressed to us

    const inbox = await runIn(root, ['inbox', '--format', 'json']);
    const out = JSON.parse(inbox.stdout);
    expect(out.ready.map((e) => e.id)).toEqual([id]); // only product:foo, derived from config
  });

  test('pointer format stays silent when nothing is addressed to this session', async () => {
    writeFileSync(join(root, '.postbox.toml'), 'identities = ["product:foo"]\n');
    await runIn(root, ['send', '--type', 'brief', '--target', 'product:other', '--source', 'o']);
    const res = await runIn(root, ['inbox', '--format', 'pointer']);
    expect(res.stdout.trim()).toBe('');
  });

  test('init writes a .postbox.toml into the cwd', async () => {
    expect(existsSync(join(root, '.postbox.toml'))).toBe(false);
    const res = await runIn(root, ['init']);
    expect(res.code).toBe(0);
    expect(existsSync(join(root, '.postbox.toml'))).toBe(true);
  });
});
