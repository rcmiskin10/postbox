import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mailbox } from '../src/mailbox.mjs';
import { parseEnvelope, serializeEnvelope, createEnvelope } from '../src/envelope.mjs';
import { uuidv7 } from '../src/uuidv7.mjs';
import { parseDuration } from '../src/config.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-fix-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// ── MEDIUM-3: one corrupt file must not break the whole inbox ────────────────────────────
describe('inbox parse-error isolation (MEDIUM-3)', () => {
  test('a corrupt .md in ready/ is skipped, not fatal', () => {
    const mb = new Mailbox({ dir });
    const good = mb.send({ type: 'brief', target: 'product:foo', sourceRole: 'o' });
    writeFileSync(join(dir, 'ready', 'garbage.md'), 'not an envelope, no frontmatter');

    const res = mb.inbox({ consumer: { mode: 'role', identities: ['product:foo'] } });
    expect(res.ready.map((e) => e.id)).toEqual([good.id]); // good one surfaces; corrupt skipped
  });
});

// ── HIGH-1 / HIGH-2: sweep + report must not crash on a vanished or corrupt reclaim ───────
describe('sweep is resilient (HIGH-1)', () => {
  test('a corrupt-but-expired claimed file is reclaimed without throwing', () => {
    const mb = new Mailbox({ dir });
    const id = uuidv7();
    // valid claimed filename (parses), expired lease (ms=1), corrupt body
    writeFileSync(join(dir, 'claimed', `${id}.sess.1.md`), 'totally corrupt, no frontmatter');

    let r;
    expect(() => { r = mb.sweep({ now: 1000 }); }).not.toThrow();
    expect(r.reclaimed).toContain(id);
    expect(readdirSync(join(dir, 'ready'))).toContain(`${id}.md`);
  });
});

describe('report after the lease was swept (HIGH-2 family)', () => {
  test('reporting a claim that sweep already reclaimed returns a structured failure, never a ghost file', () => {
    const mb = new Mailbox({ dir, leaseTtlMs: 1000 });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });
    mb.claim(env.id, { session: 'a', now: 1000 });   // lease_exp = 2000
    mb.sweep({ now: 5000 });                          // reclaims claimed/ → ready/

    const res = mb.report(env.id, { session: 'a', now: 5000 });
    expect(res.ok).toBe(false);
    expect(['lease-not-owned', 'lease-expired']).toContain(res.reason);
    // single-owner invariant: the envelope is in exactly one state dir (ready/), not done/
    expect(readdirSync(join(dir, 'done'))).toHaveLength(0);
    expect(readdirSync(join(dir, 'ready'))).toEqual([`${env.id}.md`]);
  });
});

describe('_rewrite refuses to recreate a vanished destination (HIGH-2 core)', () => {
  test('throws ENOENT instead of creating the file', () => {
    const mb = new Mailbox({ dir });
    const env = createEnvelope({ type: 'brief', target: 'x', sourceRole: 'o' });
    const ghost = join(dir, 'claimed', 'does-not-exist.md');
    expect(() => mb._rewrite(ghost, env)).toThrow(/vanished/);
    expect(readdirSync(join(dir, 'claimed'))).toHaveLength(0); // nothing created
  });
});

// ── LOW-8: a session name with a path separator is rejected, not silently mis-claimed ─────
describe('session validation (LOW-8)', () => {
  test('claim rejects a session containing /', () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'x', sourceRole: 'o' });
    expect(() => mb.claim(env.id, { session: 'a/b' })).toThrow(/invalid session/);
  });
});

// ── MEDIUM-5: CRLF-encoded envelopes parse instead of failing as "missing frontmatter" ────
describe('CRLF tolerance (MEDIUM-5)', () => {
  test('parseEnvelope handles \\r\\n line endings', () => {
    const env = createEnvelope({ type: 'brief', target: 'x', sourceRole: 'o', body: 'hello' });
    const crlf = serializeEnvelope(env).replace(/\n/g, '\r\n');
    const parsed = parseEnvelope(crlf);
    expect(parsed.type).toBe('brief');
    expect(parsed.body).toContain('hello');
  });
});

// ── LOW-7: uuidv7 is monotonic within a millisecond ───────────────────────────────────────
describe('uuidv7 monotonicity (LOW-7)', () => {
  test('a tight burst sorts in generation order', () => {
    const ids = Array.from({ length: 500 }, () => uuidv7());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted); // lexicographic order == creation order, even sub-ms
    expect(new Set(ids).size).toBe(ids.length); // no collisions
  });
});

// ── LOW-9: a zero-length lease is rejected ────────────────────────────────────────────────
describe('parseDuration rejects non-positive (LOW-9)', () => {
  test("'0' throws", () => { expect(() => parseDuration('0')).toThrow(); });
  test('0 (number) throws', () => { expect(() => parseDuration(0)).toThrow(); });
  test("'60m' still parses", () => { expect(parseDuration('60m')).toBe(3600000); });
});
