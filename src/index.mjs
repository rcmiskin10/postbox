// Public API surface for `import ... from 'postbox'`.
export { Mailbox, STATES } from './mailbox.mjs';
export { createEnvelope, serializeEnvelope, parseEnvelope } from './envelope.mjs';
export { matchesTarget } from './target-match.mjs';
export { uuidv7 } from './uuidv7.mjs';
