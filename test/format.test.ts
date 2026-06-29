import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duration } from '../src/stats/format.js';

test('duration formats seconds, minutes and hours compactly', () => {
  assert.equal(duration(null), '-');
  assert.equal(duration(0), '0s');
  assert.equal(duration(45), '45s');
  assert.equal(duration(59.4), '59s'); // rounds to whole seconds
  assert.equal(duration(60), '1m');
  assert.equal(duration(125), '2m 5s');
  assert.equal(duration(3600), '1h');
  assert.equal(duration(3780), '1h 3m');
  assert.equal(duration(-5), '0s'); // never negative
});
