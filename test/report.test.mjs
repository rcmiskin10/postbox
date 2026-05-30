import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mailbox } from '../src/mailbox.mjs';
import { parseEnvelope } from '../src/envelope.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('Mailbox.report (return channel)', () => {
  test('appends outcome and moves claimed → done', () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o', body: 'do the thing' });
    mb.claim(env.id, { session: 'a' });

    const res = mb.report(env.id, { session: 'a', outcome: 'https://github.com/x/y/pull/1' });

    expect(res.ok).toBe(true);
    expect(readdirSync(join(dir, 'claimed'))).toHaveLength(0);
    expect(readdirSync(join(dir, 'done'))).toEqual([`${env.id}.md`]);

    const back = parseEnvelope(readFileSync(join(dir, 'done', `${env.id}.md`), 'utf8'));
    expect(back.status).toBe('done');
    expect(back.outcome_ref).toBe('https://github.com/x/y/pull/1');
    expect(back.status_history).toHaveLength(2); // ready→claimed, claimed→done
    expect(back.status_history.at(-1)).toMatchObject({ from: 'claimed', to: 'done', by: 'a' });
    expect(back.body).toContain('## Outcome');
    expect(back.body).toContain('pull/1');
  });

  test('refuses to report a claim owned by a different session', () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });
    mb.claim(env.id, { session: 'a' });
    const res = mb.report(env.id, { session: 'b', outcome: 'nope' });
    expect(res).toEqual({ ok: false, reason: 'lease-not-owned', id: env.id });
    expect(readdirSync(join(dir, 'done'))).toHaveLength(0);
  });

  test('refuses to report something never claimed', () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });
    expect(mb.report(env.id, { session: 'a', outcome: 'x' }).ok).toBe(false);
  });
});
