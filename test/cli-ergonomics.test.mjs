import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'postbox.mjs');

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-erg-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

async function run(args) {
  try {
    const { stdout, stderr } = await execFileP(process.execPath, [BIN, '--dir', dir, ...args]);
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}
// help/bare don't take --dir cleanly; run BIN directly
async function runRaw(args) {
  try {
    const { stdout } = await execFileP(process.execPath, [BIN, ...args]);
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('postbox CLI ergonomics', () => {
  test('--help and bare invocation print usage and exit 0 (H-1)', async () => {
    const h = await runRaw(['--help']);
    expect(h.code).toBe(0);
    expect(h.stdout).toMatch(/Usage: postbox/);
    const bare = await runRaw([]);
    expect(bare.code).toBe(0);
    expect(bare.stdout).toMatch(/Usage: postbox/);
    const sub = await runRaw(['help', 'send']);
    expect(sub.stdout).toMatch(/postbox send --type/);
  });

  test('inbox --json is an alias for --format json (H-2)', async () => {
    const { stdout } = await run(['send', '--type', 'brief', '--target', 'product:foo', '--source', 'o']);
    const { id } = JSON.parse(stdout);
    const res = await run(['inbox', '--identities', 'product:foo', '--json']);
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).ready.map((e) => e.id)).toContain(id);
  });

  test('--mark-processed without --session is a usage error (H-3)', async () => {
    const res = await run(['inbox', '--identities', 'product:foo', '--mark-processed']);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/--mark-processed requires --session/);
  });

  test('--body with no value is a usage error, not a silent empty body (M-1)', async () => {
    const res = await run(['send', '--type', 'brief', '--target', 'x', '--body']);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/--body requires a value/);
  });

  test('--key=value form parses (N-2)', async () => {
    const res = await run(['send', '--type=brief', '--target=product:foo', '--source=o']);
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('claim accepts --id as an alias for the positional (L-2)', async () => {
    const { stdout } = await run(['send', '--type', 'brief', '--target', 'x', '--source', 'o']);
    const { id } = JSON.parse(stdout);
    const res = await run(['claim', '--id', id, '--session', 'a']);
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).ok).toBe(true);
  });

  test('--session dedup advances the sentinel: a marked envelope does not resurface (H-3 / SPEC §7)', async () => {
    const { stdout } = await run(['send', '--type', 'brief', '--target', 'product:foo', '--source', 'o']);
    const { id } = JSON.parse(stdout);
    const first = await run(['inbox', '--identities', 'product:foo', '--session', 's1', '--mark-processed', '--json']);
    expect(JSON.parse(first.stdout).ready.map((e) => e.id)).toContain(id);
    const second = await run(['inbox', '--identities', 'product:foo', '--session', 's1', '--mark-processed', '--json']);
    expect(JSON.parse(second.stdout).ready).toHaveLength(0); // already processed → suppressed
  });
});

describe('postbox migrate --apply (MEDIUM-4)', () => {
  test('writes atomically and is idempotent across re-runs', async () => {
    const from = join(dir, 'legacy');
    mkdirSync(from, { recursive: true });
    writeFileSync(join(from, 'brief-1.md'), '---\ntarget_product: foo\nstatus: ready\n---\n\n# Do X\n');

    const to = join(dir, 'mb');
    const first = await runRaw(['migrate', '--from', from, '--to', to, '--apply']);
    expect(first.code).toBe(0);
    expect(JSON.parse(first.stdout).written).toBe(1);
    expect(readdirSync(join(to, 'ready'))).toHaveLength(1);

    // re-run: already-migrated, nothing new written, no duplicate envelope
    const second = await runRaw(['migrate', '--from', from, '--to', to, '--apply']);
    expect(JSON.parse(second.stdout).written).toBe(0);
    expect(JSON.parse(second.stdout).alreadyMigrated).toBe(1);
    expect(readdirSync(join(to, 'ready'))).toHaveLength(1); // still exactly one
  });
});
