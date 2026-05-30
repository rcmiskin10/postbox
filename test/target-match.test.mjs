import { describe, test, expect } from 'vitest';
import { matchesTarget } from '../src/target-match.mjs';

describe('matchesTarget', () => {
  describe('role mode (consumer answers to a set of addresses)', () => {
    const consumer = { mode: 'role', identities: ['product:content-workspace', 'role:writer'] };
    test('matches an address the consumer answers to', () => {
      expect(matchesTarget('product:content-workspace', consumer)).toBe(true);
    });
    test('does not match an address it does not answer to', () => {
      expect(matchesTarget('product:vibedraft', consumer)).toBe(false);
    });
  });

  describe('explicit-list mode (config maps target → cwds)', () => {
    const consumer = {
      mode: 'explicit-list',
      cwd: '/home/u/work/projects/foo',
      map: { 'product:foo': ['/home/u/work/projects/foo'], 'product:bar': ['/home/u/work/projects/bar'] },
    };
    test('matches when the consumer cwd is listed for the target', () => {
      expect(matchesTarget('product:foo', consumer)).toBe(true);
    });
    test('does not match when the cwd is not listed', () => {
      expect(matchesTarget('product:bar', consumer)).toBe(false);
    });
  });

  describe('cwd-glob mode (target is a path glob over the consumer cwd)', () => {
    const consumer = { mode: 'cwd-glob', cwd: '/home/u/work/projects/content-workspace' };
    test('** matches across path separators', () => {
      expect(matchesTarget('**/projects/content-workspace', consumer)).toBe(true);
    });
    test('* does not cross a path separator', () => {
      expect(matchesTarget('/home/u/*/content-workspace', consumer)).toBe(false);
    });
    test('exact glob matches', () => {
      expect(matchesTarget('/home/u/work/projects/*', consumer)).toBe(true);
    });
  });

  test('unknown mode never matches', () => {
    expect(matchesTarget('anything', { mode: 'bogus' })).toBe(false);
  });
});
