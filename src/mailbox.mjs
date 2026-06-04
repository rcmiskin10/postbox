import {
  mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, fsyncSync, openSync, closeSync,
  existsSync, rmSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { createEnvelope, serializeEnvelope, parseEnvelope } from './envelope.mjs';
import { matchesTarget } from './target-match.mjs';

/** The four authoritative states (status-in-path). `.processed/` and `.tmp/` are bookkeeping. */
export const STATES = ['ready', 'claimed', 'done', 'dead'];

/**
 * A filesystem mailbox: a directory whose subdirectories are the queue states.
 * Every transition is an atomic rename on one filesystem (SPEC §2–§6).
 */
export class Mailbox {
  /** @param {{dir:string, tenantId?:string, leaseTtlMs?:number}} opts */
  constructor({ dir, tenantId = 'default', leaseTtlMs = 60 * 60 * 1000 } = {}) {
    if (!dir) throw new Error('postbox: Mailbox requires a dir');
    this.dir = dir;
    this.tenantId = tenantId;
    this.leaseTtlMs = leaseTtlMs;
    for (const s of STATES) mkdirSync(join(dir, s), { recursive: true });
    mkdirSync(join(dir, '.tmp'), { recursive: true });
  }

  _state(state, file) {
    return join(this.dir, state, file);
  }

  /** List the `.md` filenames in a state dir. */
  list(state) {
    return readdirSync(join(this.dir, state)).filter((f) => f.endsWith('.md'));
  }

  /** Parse a claimed/ filename `<uuid>.<session>.<leaseMs>.md` → its parts, or null. */
  _parseClaim(file) {
    const m = file.match(/^([0-9a-f-]{36})\.(.+)\.(\d+)\.md$/);
    return m ? { id: m[1], session: m[2], leaseMs: Number(m[3]), file } : null;
  }

  /**
   * A session name becomes a path segment in the claimed/ filename (`<id>.<session>.<ms>.md`),
   * so a `/`, `\`, or NUL would escape the directory and make rename(2) throw ENOENT (read as a
   * spurious "already-claimed"). Reject those up front with a clear error.
   */
  _validateSession(session) {
    if (/[/\\\0]/.test(session)) {
      throw new Error(`postbox: invalid session '${session}' — must not contain / \\ or NUL`);
    }
  }

  /** Read + parse an envelope from a state dir. */
  _read(state, file) {
    return parseEnvelope(readFileSync(join(this.dir, state, file), 'utf8'));
  }

  /**
   * Read + parse an envelope, returning null instead of throwing on a corrupt/half-written/
   * non-envelope `.md` file. Keeps one bad file from making the whole inbox unreadable.
   */
  _readSafe(state, file) {
    try {
      return this._read(state, file);
    } catch (e) {
      process.stderr.write(`postbox: skipping unreadable ${state}/${file} (${e.code ?? e.message})\n`);
      return null;
    }
  }

  /** Mark an envelope surfaced-to a session (idempotency sentinel, SPEC §7). */
  markProcessed(session, id) {
    mkdirSync(join(this.dir, '.processed', session), { recursive: true });
    writeFileSync(join(this.dir, '.processed', session, id), '');
  }

  isProcessed(session, id) {
    return existsSync(join(this.dir, '.processed', session, id));
  }

  /**
   * List what a session should see: ready/ envelopes addressed to `consumer`, plus done/
   * envelopes for the writer (`asSource`). Opportunistically sweeps expired leases first
   * (SPEC §6/§9). `unprocessedFor` hides envelopes already surfaced to that session.
   */
  inbox({ consumer = null, asSource = null, unprocessedFor = null, now = Date.now(), sweep = true } = {}) {
    if (sweep) this.sweep({ now });
    const fresh = (e) => !unprocessedFor || !this.isProcessed(unprocessedFor, e.id);
    const ready = consumer
      ? this.list('ready').map((f) => this._readSafe('ready', f)).filter(Boolean).filter((e) => matchesTarget(e.target, consumer)).filter(fresh)
      : [];
    const done = asSource
      ? this.list('done').map((f) => this._readSafe('done', f)).filter(Boolean).filter((e) => e.source_role === asSource).filter(fresh)
      : [];
    return { ready, done };
  }

  /**
   * Atomically create a new envelope in ready/ (write tmp → fsync → rename).
   * A half-written envelope is never visible in ready/.
   * @returns the created envelope object (with its uuidv7 id)
   */
  send({ type, target, sourceRole, body = '', eventType } = {}) {
    const env = createEnvelope({ type, target, sourceRole, tenantId: this.tenantId, body, eventType });
    const text = serializeEnvelope(env);
    const tmp = join(this.dir, '.tmp', `${env.id}.tmp`);
    const fd = openSync(tmp, 'w');
    try {
      writeFileSync(fd, text);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this._state('ready', `${env.id}.md`));
    return env;
  }

  /**
   * Atomically replace a file this process exclusively owns (tmp → fsync → rename). Guards
   * against the rename(2) "create if missing" semantic: if a sweeper reclaimed `path` out from
   * under us between our read and now, recreating it would ghost-resurrect a file in two states.
   * We refuse and throw ENOENT so the caller can treat it as a lost race.
   */
  _rewrite(path, env) {
    const tmp = join(this.dir, '.tmp', `${basename(path)}.tmp`);
    const fd = openSync(tmp, 'w');
    try {
      writeFileSync(fd, serializeEnvelope(env));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (!existsSync(path)) {
      rmSync(tmp, { force: true });
      throw Object.assign(new Error(`postbox: ${path} vanished before rewrite`), { code: 'ENOENT' });
    }
    renameSync(tmp, path);
  }

  /**
   * Claim a ready envelope. The CAS is the rename of the SOURCE (ready/<id>.md): exactly
   * one racer's rename(2) succeeds; losers get ENOENT (SPEC §5). The winner owns a uniquely
   * named claimed/ file, so the subsequent read-modify-write is race-free.
   * @returns {{ok:true,id,session,leaseExpMs,path}|{ok:false,reason:'already-claimed',id}}
   */
  claim(id, { session, now = Date.now() } = {}) {
    if (!session) throw new Error('postbox: claim requires a session');
    this._validateSession(session);
    const src = this._state('ready', `${id}.md`);
    const leaseExpMs = now + this.leaseTtlMs;
    const dst = this._state('claimed', `${id}.${session}.${leaseExpMs}.md`);
    try {
      renameSync(src, dst); // ← THE CAS. ENOENT ⇒ already claimed or never existed.
    } catch (e) {
      if (e.code === 'ENOENT') return { ok: false, reason: 'already-claimed', id };
      throw e;
    }
    // The CAS is already won — this session owns dst. The metadata rewrite below is a
    // best-effort body update; if it fails (disk full, etc.) the claim still stands (the lease
    // is encoded in the filename, which is authoritative), so report success with a warning
    // rather than throwing and leaving the caller unsure whether they hold the lease.
    const result = { ok: true, id, session, leaseExpMs, path: dst };
    try {
      const env = parseEnvelope(readFileSync(dst, 'utf8'));
      const leaseIso = new Date(leaseExpMs).toISOString();
      env.status = 'claimed';
      env.lease_exp = leaseIso;
      env.status_history = [
        ...(env.status_history ?? []),
        { at: new Date(now).toISOString(), from: 'ready', to: 'claimed', by: session, lease_exp: leaseIso },
      ];
      this._rewrite(dst, env);
    } catch (e) {
      result.warning = `claim won but metadata update failed: ${e.code ?? e.message}`;
      process.stderr.write(`postbox: ${result.warning}\n`);
    }
    return result;
  }

  /**
   * Report an outcome on a claim this session owns: append a `## Outcome` block + a
   * status_history record (never overwriting the body), then CAS rename claimed/ → done/.
   * @returns {{ok:true,id,path,outcome_ref}|{ok:false,reason:'lease-not-owned',id}}
   */
  report(id, { session, outcome = null, now = Date.now() } = {}) {
    if (!session) throw new Error('postbox: report requires a session');
    this._validateSession(session);
    const claimedDir = join(this.dir, 'claimed');
    const file = readdirSync(claimedDir)
      .map((f) => this._parseClaim(f))
      .find((c) => c && c.id === id && c.session === session)?.file;
    if (!file) return { ok: false, reason: 'lease-not-owned', id };

    const src = join(claimedDir, file);
    const dst = this._state('done', `${id}.md`);
    // A sweeper can reclaim our claimed/ file (lease expired) between the readdir scan above and
    // the writes below. If so, src is gone: report a structured lease-expired result instead of
    // crashing or ghost-recreating the file in two states. _rewrite already guards the rename.
    let env;
    try {
      env = parseEnvelope(readFileSync(src, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return { ok: false, reason: 'lease-expired', id };
      throw e;
    }
    env.status = 'done';
    env.outcome_ref = outcome;
    env.status_history = [
      ...(env.status_history ?? []),
      { at: new Date(now).toISOString(), from: 'claimed', to: 'done', by: session, outcome_ref: outcome },
    ];
    env.body = `${env.body.replace(/\s+$/, '')}\n\n## Outcome\n\n${outcome ?? '(none)'}\n`;
    try {
      this._rewrite(src, env); // we own this file; safe in-place update (guards ENOENT)
      renameSync(src, dst);
    } catch (e) {
      if (e.code === 'ENOENT') return { ok: false, reason: 'lease-expired', id };
      throw e;
    }
    return { ok: true, id, path: dst, outcome_ref: outcome };
  }

  /**
   * Reclaim every claimed/ envelope whose lease has expired back to ready/. The reclaim is
   * itself a CAS rename (two sweepers race → one wins, the other gets ENOENT). No timer,
   * no daemon — callers run this opportunistically (SPEC §6).
   * @returns {{reclaimed:string[]}} ids moved back to ready/
   */
  sweep({ now = Date.now() } = {}) {
    const claimedDir = join(this.dir, 'claimed');
    const reclaimed = [];
    for (const f of readdirSync(claimedDir)) {
      const c = this._parseClaim(f);
      if (!c || c.leaseMs >= now) continue;
      const src = join(claimedDir, f);
      const dst = this._state('ready', `${c.id}.md`);
      try {
        renameSync(src, dst); // CAS — loser sweeper gets ENOENT
      } catch (e) {
        if (e.code === 'ENOENT') continue;
        throw e;
      }
      // The file is back in ready/ and counts as reclaimed regardless of what happens next.
      reclaimed.push(c.id);
      try {
        const env = parseEnvelope(readFileSync(dst, 'utf8'));
        env.status = 'ready';
        env.lease_exp = null;
        env.status_history = [
          ...(env.status_history ?? []),
          { at: new Date(now).toISOString(), from: 'claimed', to: 'ready', by: c.session, reason: 'lease-expired' },
        ];
        this._rewrite(dst, env);
      } catch (e) {
        // A concurrent claimer grabbed the just-reclaimed file (ENOENT), or it is corrupt. The
        // reclaim itself stands (path is authoritative); only the bookkeeping rewrite is lost.
        // Either way, don't let one file crash the whole sweep (which inbox() runs on every call).
        if (e.code !== 'ENOENT') {
          process.stderr.write(`postbox: sweep could not update ${c.id} after reclaim (${e.code ?? e.message})\n`);
        }
      }
    }
    return { reclaimed };
  }
}
