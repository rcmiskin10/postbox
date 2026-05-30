import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Mailbox } from '../src/mailbox.mjs';

const execFileP = promisify(execFile);
const WORKER = join(dirname(fileURLToPath(import.meta.url)), 'helpers', 'claim-worker.mjs');

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-race-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('claim race — N concurrent OS processes (SPEC §5 load-bearing guarantee)', () => {
  test('exactly one of 16 simultaneous claimants wins; ready/ empties; one claimed file', async () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });

    const N = 16;
    const startAt = Date.now() + 400; // shared start gate for tight simultaneity
    const results = (
      await Promise.all(
        Array.from({ length: N }, (_, i) =>
          execFileP(process.execPath, [WORKER, dir, env.id, `sess-${i}`, String(startAt)]),
        ),
      )
    ).map((o) => JSON.parse(o.stdout));

    const winners = results.filter((r) => r.ok === true);
    const losers = results.filter((r) => r.ok === false && r.reason === 'already-claimed');

    expect(winners).toHaveLength(1);          // ← no double-claim
    expect(losers).toHaveLength(N - 1);        // ← everyone else cleanly loses
    expect(readdirSync(join(dir, 'ready'))).toHaveLength(0);
    expect(readdirSync(join(dir, 'claimed'))).toHaveLength(1);
  }, 20000);
});
