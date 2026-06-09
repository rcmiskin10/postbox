import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'postbox.mjs');

let root;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'postbox-unwire-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const run = (args) => execFileP(process.execPath, [BIN, ...args], { cwd: root });

// a folder wired the old way: a postbox inbox hook + an unrelated hook + a postbox.toml + allow
function seed(name, hookCommand) {
  const dir = join(root, 'projects', name);
  const sjDir = join(dir, '.claude');
  mkdirSync(sjDir, { recursive: true });
  writeFileSync(join(dir, '.postbox.toml'), `identities = ["session:${name}"]\n`);
  writeFileSync(join(sjDir, 'settings.json'), JSON.stringify({
    permissions: { allow: ['Bash(git:*)', 'Bash(postbox:*)'] },
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: hookCommand }] },
        { hooks: [{ type: 'command', command: 'echo unrelated' }] },
      ],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: hookCommand }] }],
    },
  }, null, 2));
  return dir;
}

describe('postbox unwire — strip postbox hooks when switching to the plugin', () => {
  test('removes both the vendored-path and bare-command hook forms, keeps everything else', async () => {
    seed('alpha', 'node "$CLAUDE_PROJECT_DIR/../../postbox/bin/postbox.mjs" inbox --session alpha --format pointer');
    seed('beta', 'postbox inbox --session beta --mark-processed --format pointer 2>/dev/null || true');

    await run(['unwire', '--all', './projects', '--apply']);

    for (const name of ['alpha', 'beta']) {
      const sj = JSON.parse(readFileSync(join(root, 'projects', name, '.claude', 'settings.json'), 'utf8'));
      expect(JSON.stringify(sj.hooks ?? {})).not.toContain('postbox');     // postbox hooks gone
      expect(JSON.stringify(sj.hooks ?? {})).toContain('echo unrelated');  // unrelated hook kept
      expect(sj.permissions.allow).toContain('Bash(git:*)');               // allow untouched
      expect(existsSync(join(root, 'projects', name, '.postbox.toml'))).toBe(true); // toml untouched
    }
  });

  test('dry-run reports but writes nothing', async () => {
    const dir = seed('alpha', 'postbox inbox --format pointer');
    const before = readFileSync(join(dir, '.claude', 'settings.json'), 'utf8');
    const { stdout } = await run(['unwire', './projects/alpha']);
    expect(stdout).toContain('would unwire');
    expect(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8')).toBe(before);
  });

  test('is idempotent — a second pass finds no postbox hooks', async () => {
    seed('alpha', 'postbox inbox --format pointer');
    await run(['unwire', './projects/alpha', '--apply']);
    const { stdout } = await run(['unwire', './projects/alpha', '--apply']);
    expect(stdout).toContain('no postbox hooks');
  });

  test('a folder with no settings.json is reported, not fatal', async () => {
    mkdirSync(join(root, 'projects', 'bare'), { recursive: true });
    const { stdout } = await run(['unwire', './projects/bare', '--apply']);
    expect(stdout).toContain('no settings.json');
  });
});
