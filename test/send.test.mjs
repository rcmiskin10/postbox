import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mailbox } from '../src/mailbox.mjs';
import { parseEnvelope } from '../src/envelope.mjs';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'postbox-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('Mailbox.send', () => {
  test('writes an envelope into ready/ and returns it', () => {
    const mb = new Mailbox({ dir });
    const env = mb.send({ type: 'brief', target: 'product:foo', sourceRole: 'orchestrator', body: 'hi' });

    const files = readdirSync(join(dir, 'ready'));
    expect(files).toEqual([`${env.id}.md`]);

    const back = parseEnvelope(readFileSync(join(dir, 'ready', files[0]), 'utf8'));
    expect(back.id).toBe(env.id);
    expect(back.status).toBe('ready');
    expect(back.target).toBe('product:foo');
    expect(back.body.trim()).toBe('hi');
  });

  test('leaves only final .md files in ready/ (no temp/partial)', () => {
    const mb = new Mailbox({ dir });
    mb.send({ type: 'brief', target: 'x', sourceRole: 'o', body: 'a' });
    mb.send({ type: 'brief', target: 'x', sourceRole: 'o', body: 'b' });
    const files = readdirSync(join(dir, 'ready'));
    expect(files).toHaveLength(2);
    expect(files.every((f) => /^[0-9a-f-]{36}\.md$/.test(f))).toBe(true);
  });
});
