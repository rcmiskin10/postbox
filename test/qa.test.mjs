import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Mailbox } from '../src/mailbox.mjs';

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '..', 'bin', 'postbox.mjs');
const WORKER = join(HERE, 'helpers', 'claim-worker.mjs');

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-qa-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('QA gate', () => {
  test('32 concurrent claimants → exactly one winner, ready/ empty (stress)', async () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });

    const N = 32;
    const startAt = Date.now() + 500;
    const results = (
      await Promise.all(
        Array.from({ length: N }, (_, i) =>
          execFileP(process.execPath, [WORKER, dir, env.id, `s-${i}`, String(startAt)]),
        ),
      )
    ).map((o) => JSON.parse(o.stdout));

    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(readdirSync(join(dir, 'ready'))).toHaveLength(0);
    expect(readdirSync(join(dir, 'claimed'))).toHaveLength(1);
  }, 30000);

  test('full lifecycle via the CLI with the Claude environment stripped (cron/CI-safe)', async () => {
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith('CLAUDE')) delete env[k];

    const run = async (args) => {
      try {
        const { stdout } = await execFileP(process.execPath, [BIN, '--dir', dir, ...args], { env });
        return { code: 0, stdout };
      } catch (e) {
        return { code: e.code, stdout: e.stdout ?? '' };
      }
    };

    const sent = await run(['send', '--type', 'brief', '--target', 'x', '--source', 'orchestrator', '--body', 'hi']);
    const { id } = JSON.parse(sent.stdout);
    expect((await run(['claim', id, '--session', 'w'])).code).toBe(0);
    expect((await run(['report', id, '--session', 'w', '--outcome', 'done-ref'])).code).toBe(0);

    const writer = await run(['inbox', '--as-source', 'orchestrator', '--format', 'json']);
    const out = JSON.parse(writer.stdout);
    expect(out.done.map((e) => e.id)).toContain(id);
    expect(out.done[0].outcome_ref).toBe('done-ref');
  }, 20000);
});
