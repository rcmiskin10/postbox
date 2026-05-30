import { randomBytes } from 'node:crypto';

/**
 * Generate a UUIDv7 (RFC 9562): 48-bit big-endian Unix-ms timestamp prefix +
 * version/variant bits + random. Time-ordered, so lexicographic sort ≈ creation order.
 * @returns {string} canonical hyphenated UUIDv7
 */
export function uuidv7() {
  const ts = Date.now();
  const b = randomBytes(16);

  // bytes 0..5: 48-bit timestamp, big-endian
  b[0] = (ts / 2 ** 40) & 0xff;
  b[1] = (ts / 2 ** 32) & 0xff;
  b[2] = (ts / 2 ** 24) & 0xff;
  b[3] = (ts / 2 ** 16) & 0xff;
  b[4] = (ts / 2 ** 8) & 0xff;
  b[5] = ts & 0xff;

  // byte 6 high nibble = version (7)
  b[6] = (b[6] & 0x0f) | 0x70;
  // byte 8 high bits = variant (10xxxxxx)
  b[8] = (b[8] & 0x3f) | 0x80;

  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
