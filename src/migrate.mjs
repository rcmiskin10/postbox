import { uuidv7 } from './uuidv7.mjs';

/**
 * Normalize a legacy status (which may carry prose suffixes like "ready (blocked on…)")
 * to a postbox state. completed/done → done, abandoned → dead, everything else → ready.
 */
function mapStatus(s) {
  const word = String(s ?? '').trim().toLowerCase().match(/^[a-z-]+/)?.[0] ?? '';
  if (word === 'completed' || word === 'done') return 'done';
  if (word === 'abandoned' || word === 'dead') return 'dead';
  return 'ready';
}

/** Extract the leading slug from a (possibly prose) target_product, e.g. "brain (new …)" → "brain". */
function slugifyProduct(v) {
  return String(v).trim().match(/^[A-Za-z0-9._-]+/)?.[0] ?? null;
}

/**
 * Convert a parsed legacy `_briefs/` doc (frontmatter + body) into a postbox envelope,
 * stamping the schema fields the legacy format lacks (id, created, source_role, type).
 */
export function migrateLegacyBrief(legacy = {}) {
  const slug = legacy.target_product ? slugifyProduct(legacy.target_product) : null;
  const target = slug
    ? `product:${slug}`
    : legacy.target_session
      ? `session:${legacy.target_session}`
      : 'unknown';
  return {
    schema_version: 1,
    id: uuidv7(),
    event_type: 'handoff.brief.created',
    type: 'brief',
    tenant_id: 'default',
    created: legacy.date ? `${legacy.date}T00:00:00Z` : new Date().toISOString(),
    source_role: 'orchestrator',
    target,
    status: mapStatus(legacy.status),
    lease_exp: null,
    blocked_by: Array.isArray(legacy.blocked_by) ? legacy.blocked_by : [],
    supersedes: Array.isArray(legacy.supersedes) ? legacy.supersedes : [],
    related: Array.isArray(legacy.related) ? legacy.related : [],
    outcome_ref: null,
    status_history: [],
    body: legacy.body ?? '',
  };
}
