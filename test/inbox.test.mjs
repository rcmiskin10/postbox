import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mailbox } from '../src/mailbox.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const consumer = { mode: 'role', identities: ['product:foo'] };

describe('Mailbox.inbox', () => {
  test('returns only ready envelopes addressed to the consumer', () => {
    const mb = new Mailbox({ dir });
    const mine = mb.send({ type: 'brief', target: 'product:foo', sourceRole: 'o' });
    mb.send({ type: 'brief', target: 'product:bar', sourceRole: 'o' }); // not mine

    const res = mb.inbox({ consumer });

    expect(res.ready.map((e) => e.id)).toEqual([mine.id]);
  });

  test('returns done envelopes for the writer (asSource), closing the loop', () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'product:foo', sourceRole: 'orchestrator' });
    mb.claim(env.id, { session: 'a' });
    mb.report(env.id, { session: 'a', outcome: 'PR #9' });

    const res = mb.inbox({ asSource: 'orchestrator' });

    expect(res.done.map((e) => e.id)).toEqual([env.id]);
    expect(res.done[0].outcome_ref).toBe('PR #9');
  });

  test('unprocessedFor hides envelopes already marked processed for that session', () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'product:foo', sourceRole: 'o' });

    expect(mb.inbox({ consumer, unprocessedFor: 's1' }).ready).toHaveLength(1);
    mb.markProcessed('s1', env.id);
    expect(mb.inbox({ consumer, unprocessedFor: 's1' }).ready).toHaveLength(0);
    // a different session still sees it
    expect(mb.inbox({ consumer, unprocessedFor: 's2' }).ready).toHaveLength(1);
  });

  test('opportunistically sweeps expired leases so they resurface in ready', () => {
    const mb = new Mailbox({ dir, leaseTtlMs: 1000 });
    const env = mb.send({ type: 'brief', target: 'product:foo', sourceRole: 'o' });
    mb.claim(env.id, { session: 'a', now: 1000 }); // lease_exp 2000

    const res = mb.inbox({ consumer, now: 5000 }); // sweep runs, reclaims, then lists

    expect(res.ready.map((e) => e.id)).toEqual([env.id]);
  });
});
