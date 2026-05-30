import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mailbox } from '../src/mailbox.mjs';
import { parseEnvelope } from '../src/envelope.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('Mailbox.sweep (lease reclaim)', () => {
  test('leaves an unexpired lease alone', () => {
    const mb = new Mailbox({ dir, leaseTtlMs: 1000 });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });
    mb.claim(env.id, { session: 'a', now: 1000 }); // lease_exp = 2000

    const r = mb.sweep({ now: 1500 });

    expect(r.reclaimed).toEqual([]);
    expect(readdirSync(join(dir, 'claimed'))).toHaveLength(1);
    expect(readdirSync(join(dir, 'ready'))).toHaveLength(0);
  });

  test('reclaims an expired lease back to ready/ with a reclaim record', () => {
    const mb = new Mailbox({ dir, leaseTtlMs: 1000 });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });
    mb.claim(env.id, { session: 'a', now: 1000 }); // lease_exp = 2000

    const r = mb.sweep({ now: 2500 });

    expect(r.reclaimed).toEqual([env.id]);
    expect(readdirSync(join(dir, 'ready'))).toEqual([`${env.id}.md`]);
    expect(readdirSync(join(dir, 'claimed'))).toHaveLength(0);

    const back = parseEnvelope(readFileSync(join(dir, 'ready', `${env.id}.md`), 'utf8'));
    expect(back.status).toBe('ready');
    expect(back.lease_exp).toBeNull();
    expect(back.status_history.at(-1)).toMatchObject({ from: 'claimed', to: 'ready', reason: 'lease-expired' });
  });

  test('a reclaimed envelope can be claimed again', () => {
    const mb = new Mailbox({ dir, leaseTtlMs: 1000 });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });
    mb.claim(env.id, { session: 'a', now: 1000 });
    mb.sweep({ now: 9000 });
    expect(mb.claim(env.id, { session: 'b', now: 9000 }).ok).toBe(true);
  });
});
