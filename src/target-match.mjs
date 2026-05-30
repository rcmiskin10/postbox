/**
 * Does an envelope's `target` address this consumer? Three modes (SPEC §10):
 *  - role          consumer.identities[] — the addresses this session answers to
 *  - explicit-list consumer.map{target → cwd[]} — match if consumer.cwd is listed
 *  - cwd-glob      target is a path glob matched against consumer.cwd
 * @param {string} target
 * @param {{mode?:string, identities?:string[], cwd?:string, map?:Record<string,string[]>}} consumer
 */
export function matchesTarget(target, consumer = {}) {
  switch (consumer.mode ?? 'role') {
    case 'role':
      return (consumer.identities ?? []).includes(target);
    case 'explicit-list':
      return (consumer.map?.[target] ?? []).includes(consumer.cwd);
    case 'cwd-glob':
      return consumer.cwd != null && globToRegExp(target).test(consumer.cwd);
    default:
      return false;
  }
}

/** Minimal path-glob → RegExp: `**` = any, `*` = any non-`/`, `?` = one non-`/`. */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; }
      else re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}
