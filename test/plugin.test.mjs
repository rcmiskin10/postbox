import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('plugin packaging', () => {
  test('plugin.json is valid and names postbox with a semver', () => {
    const m = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    expect(m.name).toBe('postbox');
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('ships the four operator slash commands', () => {
    for (const c of ['send', 'claim', 'report', 'inbox']) {
      expect(existsSync(join(ROOT, 'commands', `${c}.md`))).toBe(true);
    }
  });

  test('ships an overview skill', () => {
    expect(existsSync(join(ROOT, 'skills', 'postbox', 'SKILL.md'))).toBe(true);
  });

  test('commands invoke the CLI via the plugin root', () => {
    const send = readFileSync(join(ROOT, 'commands', 'send.md'), 'utf8');
    expect(send).toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(send).toContain('postbox.mjs');
  });
});
