import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'postbox.mjs');

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-cli-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

async function run(args) {
  try {
    const { stdout } = await execFileP(process.execPath, [BIN, '--dir', dir, ...args]);
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('postbox CLI', () => {
  test('send → inbox round-trips an envelope as JSON', async () => {
    const sent = await run(['send', '--type', 'brief', '--target', 'product:foo', '--source', 'o', '--body', 'hi']);
    expect(sent.code).toBe(0);
    const { id } = JSON.parse(sent.stdout);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const inbox = await run(['inbox', '--identities', 'product:foo', '--format', 'json']);
    expect(inbox.code).toBe(0);
    const out = JSON.parse(inbox.stdout);
    expect(out.ready.map((e) => e.id)).toContain(id);
  });

  test('a conflicting claim exits 3 (already-claimed)', async () => {
    const { stdout } = await run(['send', '--type', 'brief', '--target', 'x', '--source', 'o']);
    const { id } = JSON.parse(stdout);
    expect((await run(['claim', id, '--session', 'a'])).code).toBe(0);
    expect((await run(['claim', id, '--session', 'b'])).code).toBe(3);
  });

  test('reporting a claim you do not own exits 4 (lease-not-owned)', async () => {
    const { stdout } = await run(['send', '--type', 'brief', '--target', 'x', '--source', 'o']);
    const { id } = JSON.parse(stdout);
    await run(['claim', id, '--session', 'a']);
    const res = await run(['report', id, '--session', 'b', '--outcome', 'nope']);
    expect(res.code).toBe(4);
  });

  test('full happy path: send → claim → report → done', async () => {
    const { stdout } = await run(['send', '--type', 'brief', '--target', 'x', '--source', 'orchestrator']);
    const { id } = JSON.parse(stdout);
    expect((await run(['claim', id, '--session', 'a'])).code).toBe(0);
    const reported = await run(['report', id, '--session', 'a', '--outcome', 'PR #1']);
    expect(reported.code).toBe(0);
    expect(JSON.parse(reported.stdout).outcome_ref).toBe('PR #1');
  });

  test('doctor exits 0 on an atomic-rename filesystem', async () => {
    expect((await run(['doctor'])).code).toBe(0);
  });

  test('unknown command exits 2 (usage)', async () => {
    expect((await run(['frobnicate'])).code).toBe(2);
  });
});
