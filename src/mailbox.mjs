import {
  mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, fsyncSync, openSync, closeSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { createEnvelope, serializeEnvelope, parseEnvelope } from './envelope.mjs';

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

  /** Atomically replace a file this process exclusively owns (tmp → fsync → rename). */
  _rewrite(path, env) {
    const tmp = join(this.dir, '.tmp', `${basename(path)}.tmp`);
    const fd = openSync(tmp, 'w');
    try {
      writeFileSync(fd, serializeEnvelope(env));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
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
    const src = this._state('ready', `${id}.md`);
    const leaseExpMs = now + this.leaseTtlMs;
    const dst = this._state('claimed', `${id}.${session}.${leaseExpMs}.md`);
    try {
      renameSync(src, dst); // ← THE CAS. ENOENT ⇒ already claimed or never existed.
    } catch (e) {
      if (e.code === 'ENOENT') return { ok: false, reason: 'already-claimed', id };
      throw e;
    }
    const env = parseEnvelope(readFileSync(dst, 'utf8'));
    const leaseIso = new Date(leaseExpMs).toISOString();
    env.status = 'claimed';
    env.lease_exp = leaseIso;
    env.status_history = [
      ...(env.status_history ?? []),
      { at: new Date(now).toISOString(), from: 'ready', to: 'claimed', by: session, lease_exp: leaseIso },
    ];
    this._rewrite(dst, env);
    return { ok: true, id, session, leaseExpMs, path: dst };
  }
}
