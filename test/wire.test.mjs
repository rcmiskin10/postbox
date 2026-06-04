import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/config.mjs';

const execFileP = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'postbox.mjs');

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'postbox-wire-'));
  mkdirSync(join(root, 'projects', 'alpha'), { recursive: true });
  mkdirSync(join(root, 'projects', 'beta'), { recursive: true });
  mkdirSync(join(root, '_briefs'), { recursive: true });
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

// wire resolves --mailbox + folders relative to cwd, so run with cwd = the temp root
const run = (args) => execFileP(process.execPath, [BIN, ...args], { cwd: root });

describe('postbox wire — bulk consumer wiring', () => {
  test('--apply writes a consumer .postbox.toml per folder that round-trips through loadConfig', async () => {
    await run(['wire', './projects/alpha', './projects/beta', '--mailbox', './_briefs', '--apply']);

    const toml = readFileSync(join(root, 'projects', 'alpha', '.postbox.toml'), 'utf8');
    expect(toml).toContain('handoff_dir  = "../../_briefs"'); // relative to the folder
    expect(toml).toContain('"product:alpha"');
    expect(toml).toContain('"session:alpha"');

    const cfg = loadConfig(join(root, 'projects', 'alpha'));
    expect(cfg.identities).toEqual(['product:alpha', 'session:alpha']);
    // handoff_dir resolves back to the one shared mailbox
    expect(cfg.handoffDir).toBe(resolve(root, '_briefs'));
  });

  test('dry-run (no --apply) writes nothing', async () => {
    const { stdout } = await run(['wire', './projects/alpha', '--mailbox', './_briefs']);
    expect(stdout).toContain('would wire');
    expect(existsSync(join(root, 'projects', 'alpha', '.postbox.toml'))).toBe(false);
  });

  test('--all discovers subfolders and --exclude skips them', async () => {
    mkdirSync(join(root, 'projects', '_archived'), { recursive: true });
    const { stdout } = await run([
      'wire', '--all', './projects', '--exclude', '_archived', '--mailbox', './_briefs', '--apply',
    ]);
    expect(existsSync(join(root, 'projects', 'alpha', '.postbox.toml'))).toBe(true);
    expect(existsSync(join(root, 'projects', 'beta', '.postbox.toml'))).toBe(true);
    expect(existsSync(join(root, 'projects', '_archived', '.postbox.toml'))).toBe(false);
    expect(stdout).toContain('alpha');
  });

  test('--with-hooks merges SessionStart + UserPromptSubmit inbox hooks into settings.json', async () => {
    await run(['wire', './projects/alpha', '--mailbox', './_briefs', '--with-hooks', '--apply']);
    const sj = JSON.parse(readFileSync(join(root, 'projects', 'alpha', '.claude', 'settings.json'), 'utf8'));
    expect(JSON.stringify(sj.hooks.SessionStart)).toContain('postbox inbox');
    expect(JSON.stringify(sj.hooks.UserPromptSubmit)).toContain('postbox inbox');
    expect(sj.permissions.allow).toContain('Bash(postbox:*)');
  });

  test('--with-hooks preserves an existing settings.json and does not duplicate hooks', async () => {
    const sjPath = join(root, 'projects', 'alpha', '.claude', 'settings.json');
    mkdirSync(dirname(sjPath), { recursive: true });
    writeFileSync(sjPath, JSON.stringify({ permissions: { allow: ['Bash(git:*)'] } }, null, 2));

    await run(['wire', './projects/alpha', '--mailbox', './_briefs', '--with-hooks', '--apply']);
    await run(['wire', './projects/alpha', '--mailbox', './_briefs', '--with-hooks', '--apply']); // second pass

    const sj = JSON.parse(readFileSync(sjPath, 'utf8'));
    expect(sj.permissions.allow).toContain('Bash(git:*)'); // pre-existing kept
    expect(sj.permissions.allow).toContain('Bash(postbox:*)');
    // exactly one inbox hook per event despite two wire passes
    const count = (ev) => sj.hooks[ev].filter((h) => JSON.stringify(h).includes('postbox inbox')).length;
    expect(count('SessionStart')).toBe(1);
    expect(count('UserPromptSubmit')).toBe(1);
  });

  test('is idempotent — re-wiring an already-wired folder reports "already wired" and does not clobber', async () => {
    await run(['wire', './projects/alpha', '--mailbox', './_briefs', '--apply']);
    const before = readFileSync(join(root, 'projects', 'alpha', '.postbox.toml'), 'utf8');
    const { stdout } = await run(['wire', './projects/alpha', '--mailbox', './_briefs', '--apply']);
    const after = readFileSync(join(root, 'projects', 'alpha', '.postbox.toml'), 'utf8');
    expect(after).toBe(before);
    expect(stdout).toContain('already wired');
  });

  test('a missing folder is reported, not fatal', async () => {
    const { stdout } = await run(['wire', './projects/does-not-exist', '--mailbox', './_briefs', '--apply']);
    expect(stdout).toContain('does not exist');
  });
});
