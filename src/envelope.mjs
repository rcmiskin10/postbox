import YAML from 'yaml';
import { uuidv7 } from './uuidv7.mjs';

/**
 * Build a fresh envelope object (frontmatter fields + `body`) per SPEC §4.
 * @param {{type:string,target:string,sourceRole:string,tenantId?:string,body?:string,eventType?:string}} opts
 */
export function createEnvelope({ type, target, sourceRole, tenantId = 'default', body = '', eventType } = {}) {
  return {
    schema_version: 1,
    id: uuidv7(),
    event_type: eventType ?? `handoff.${type}.created`,
    type,
    tenant_id: tenantId,
    created: new Date().toISOString(),
    source_role: sourceRole,
    target,
    status: 'ready',
    lease_exp: null,
    blocked_by: [],
    supersedes: [],
    related: [],
    outcome_ref: null,
    status_history: [],
    body,
  };
}

/** Serialize an envelope object to `--- yaml --- \n body` text. */
export function serializeEnvelope(env) {
  const { body = '', ...front } = env;
  const yaml = YAML.stringify(front).trimEnd();
  return `---\n${yaml}\n---\n\n${body}\n`;
}

/**
 * Parse envelope text into `{ ...frontmatter, body }`. The non-greedy match stops at the
 * FIRST closing delimiter (the frontmatter terminator), so a `---` rule inside the body
 * is left untouched.
 */
export function parseEnvelope(text) {
  // Tolerate CRLF (Windows tooling / git core.autocrlf) so a `\r\n`-encoded envelope is not
  // mis-reported as "missing frontmatter". Normalize before matching the `\n`-anchored fence.
  const normalized = text.replace(/\r\n/g, '\n');
  const m = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error('postbox: not a valid envelope (missing frontmatter)');
  const front = YAML.parse(m[1]) ?? {};
  return { ...front, body: normalized.slice(m[0].length) };
}
