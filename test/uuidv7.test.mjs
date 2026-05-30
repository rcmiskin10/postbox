import { describe, test, expect } from 'vitest';
import { uuidv7 } from '../src/uuidv7.mjs';

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  test('generates a syntactically valid v7 UUID (version 7, RFC variant)', () => {
    expect(uuidv7()).toMatch(V7);
  });
});
