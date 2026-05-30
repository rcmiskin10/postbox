import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooks = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'));

describe('plugin hooks.json', () => {
  test('registers SessionStart and UserPromptSubmit (the two surfacing events)', () => {
    expect(hooks.hooks.SessionStart).toBeDefined();
    expect(hooks.hooks.UserPromptSubmit).toBeDefined();
  });

  test('runs `postbox inbox` in pointer format, resolved via the plugin root', () => {
    const s = JSON.stringify(hooks);
    expect(s).toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(s).toContain('inbox');
    expect(s).toContain('pointer');
  });

  test('never stalls a session — always exits 0', () => {
    expect(JSON.stringify(hooks)).toContain('|| true');
  });
});
