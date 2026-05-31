import { describe, test, expect } from 'vitest';
import { migrateLegacyBrief } from '../src/migrate.mjs';

describe('migrateLegacyBrief (legacy _briefs/ → postbox envelope)', () => {
  const legacy = {
    date: '2026-05-14',
    target_product: 'vibedraft',
    target_session: '~/workspace/projects/vibedraft/',
    status: 'ready',
    blocked_by: null,
    body: '# Brief: do X\n\nbody',
  };

  test('maps the core fields and stamps the missing schema fields', () => {
    const env = migrateLegacyBrief(legacy);
    expect(env.schema_version).toBe(1);
    expect(env.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.type).toBe('brief');
    expect(env.source_role).toBe('orchestrator');
    expect(env.target).toBe('product:vibedraft');
    expect(env.created).toBe('2026-05-14T00:00:00Z');
    expect(env.status).toBe('ready');
    expect(env.blocked_by).toEqual([]);
    expect(env.body).toContain('do X');
  });

  test('collapses lifecycle status into postbox states (path is truth)', () => {
    expect(migrateLegacyBrief({ ...legacy, status: 'completed' }).status).toBe('done');
    expect(migrateLegacyBrief({ ...legacy, status: 'in-progress' }).status).toBe('ready');
    expect(migrateLegacyBrief({ ...legacy, status: undefined }).status).toBe('ready');
  });

  test('preserves a real blocked_by list', () => {
    expect(migrateLegacyBrief({ ...legacy, blocked_by: ['other-brief'] }).blocked_by).toEqual(['other-brief']);
  });

  test('falls back to a session: target when no target_product', () => {
    const env = migrateLegacyBrief({ ...legacy, target_product: undefined, target_session: 'projects/foo/' });
    expect(env.target).toBe('session:projects/foo/');
  });

  // --- hardening against real _briefs/ data (surfaced by the Phase 4 dry-run) ---
  test('slugifies a prose target_product into a clean address', () => {
    expect(migrateLegacyBrief({ ...legacy, target_product: 'scraper-daemon → harness successor' }).target).toBe('product:scraper-daemon');
    expect(migrateLegacyBrief({ ...legacy, target_product: 'brain (new sibling project)' }).target).toBe('product:brain');
    expect(migrateLegacyBrief({ ...legacy, target_product: 'founder_context (data plane) — infra' }).target).toBe('product:founder_context');
  });

  test('normalizes prose status suffixes; maps completed→done, abandoned→dead', () => {
    expect(migrateLegacyBrief({ ...legacy, status: 'queued (critical path)' }).status).toBe('ready');
    expect(migrateLegacyBrief({ ...legacy, status: 'ready (blocked on schema)' }).status).toBe('ready');
    expect(migrateLegacyBrief({ ...legacy, status: 'completed (shipped 5/20)' }).status).toBe('done');
    expect(migrateLegacyBrief({ ...legacy, status: 'abandoned' }).status).toBe('dead');
  });
});
