import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mailbox } from '../src/mailbox.mjs';
import { parseEnvelope } from '../src/envelope.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('Mailbox.claim (sequential CAS-on-source)', () => {
  test('moves ready → claimed and records the transition', () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o', body: 'hi' });

    const res = mb.claim(env.id, { session: 'sess-1' });

    expect(res.ok).toBe(true);
    expect(readdirSync(join(dir, 'ready'))).toHaveLength(0);

    const claimed = readdirSync(join(dir, 'claimed'));
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatch(new RegExp(`^${env.id}\\.sess-1\\.\\d+\\.md$`));

    const back = parseEnvelope(readFileSync(join(dir, 'claimed', claimed[0]), 'utf8'));
    expect(back.status).toBe('claimed');
    expect(back.lease_exp).toBeTruthy();
    expect(back.status_history).toHaveLength(1);
    expect(back.status_history[0]).toMatchObject({ from: 'ready', to: 'claimed', by: 'sess-1' });
  });

  test('a second claim of the same id reports already-claimed', () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });
    expect(mb.claim(env.id, { session: 'a' }).ok).toBe(true);
    const second = mb.claim(env.id, { session: 'b' });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('already-claimed');
  });

  test('claiming a non-existent id reports already-claimed (ENOENT, not a throw)', () => {
    const mb = new Mailbox({ dir });
    const res = mb.claim('00000000-0000-7000-8000-000000000000', { session: 'a' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('already-claimed');
  });
});
