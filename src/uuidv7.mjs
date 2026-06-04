import { randomBytes } from 'node:crypto';

// Monotonic state (RFC 9562 §6.2 "fixed-length dedicated counter"): within one millisecond,
// successive ids share the 48-bit timestamp prefix and increment a 12-bit counter held in the
// `rand_a` field (byte 6 low nibble + byte 7). This makes lexicographic sort == creation order
// even for sub-millisecond bursts. The counter seeds from random each new ms to avoid a
// predictable sequence; on overflow we borrow a millisecond so ordering is never violated.
let _lastMs = 0;
let _seq = 0;

/**
 * Generate a UUIDv7 (RFC 9562): 48-bit big-endian Unix-ms timestamp prefix + 12-bit monotonic
 * counter (rand_a) + random. Time-ordered AND monotonic within a millisecond, so lexicographic
 * sort == creation order.
 * @returns {string} canonical hyphenated UUIDv7
 */
export function uuidv7() {
  let ts = Date.now();
  if (ts > _lastMs) {
    _lastMs = ts;
    _seq = randomBytes(2).readUInt16BE(0) & 0x0fff; // random 12-bit seed for this ms
  } else {
    // same ms (or a backwards clock step): bump the counter to stay monotonic
    _seq = (_seq + 1) & 0x0fff;
    if (_seq === 0) _lastMs += 1; // 12-bit overflow → borrow a ms to preserve ordering
    ts = _lastMs;
  }

  const b = randomBytes(16);

  // bytes 0..5: 48-bit timestamp, big-endian
  b[0] = (ts / 2 ** 40) & 0xff;
  b[1] = (ts / 2 ** 32) & 0xff;
  b[2] = (ts / 2 ** 24) & 0xff;
  b[3] = (ts / 2 ** 16) & 0xff;
  b[4] = (ts / 2 ** 8) & 0xff;
  b[5] = ts & 0xff;

  // byte 6 high nibble = version (7); low nibble + byte 7 = 12-bit monotonic counter (rand_a)
  b[6] = 0x70 | ((_seq >> 8) & 0x0f);
  b[7] = _seq & 0xff;
  // byte 8 high bits = variant (10xxxxxx)
  b[8] = (b[8] & 0x3f) | 0x80;

  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
