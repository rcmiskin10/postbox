import { describe, test, expect } from 'vitest';
import { createEnvelope, serializeEnvelope, parseEnvelope } from '../src/envelope.mjs';

describe('envelope', () => {
  test('createEnvelope stamps required fields with sane defaults', () => {
    const env = createEnvelope({ type: 'brief', target: 'product:foo', sourceRole: 'orchestrator' });
    expect(env.schema_version).toBe(1);
    expect(env.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.type).toBe('brief');
    expect(env.target).toBe('product:foo');
    expect(env.source_role).toBe('orchestrator');
    expect(env.tenant_id).toBe('default');
    expect(env.status).toBe('ready');
    expect(env.outcome_ref).toBeNull();
    expect(env.status_history).toEqual([]);
  });

  test('round-trips frontmatter and body through serialize → parse', () => {
    const env = createEnvelope({
      type: 'brief',
      target: 'product:foo',
      sourceRole: 'orchestrator',
      body: '# Title\n\nbody line with: a colon and a - dash',
    });
    const back = parseEnvelope(serializeEnvelope(env));
    expect(back.id).toBe(env.id);
    expect(back.target).toBe('product:foo');
    expect(back.status).toBe('ready');
    expect(back.blocked_by).toEqual([]);
    expect(back.body.trim()).toBe('# Title\n\nbody line with: a colon and a - dash');
  });

  test('parse tolerates a body that itself contains a --- horizontal rule', () => {
    const env = createEnvelope({ type: 'brief', target: 'x', sourceRole: 'o', body: 'a\n\n---\n\nb' });
    const back = parseEnvelope(serializeEnvelope(env));
    expect(back.body.trim()).toBe('a\n\n---\n\nb');
  });
});
