// The /share solver: colour scoring with duplicate letters, candidate narrowing,
// and the next-guess pick. All on a small fixed pool so the numbers are exact.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, narrow, remainingAfter, bestNextGuess } from '../src/solver/solver.js';

test('score marks greens then yellows', () => {
  assert.equal(score('crane', 'crane'), 'GGGGG');
  assert.equal(score('slate', 'crane'), 'BBGBG');
});

test('score handles a guess with more copies of a letter than the answer has', () => {
  // 'sassy' has three s, 'steps' has two: one green, one yellow, the third grey.
  assert.equal(score('sassy', 'steps'), 'GBYBB');
  // 'allee' against 'eagle': both l resolve (one yellow, one grey), both e too.
  assert.equal(score('allee', 'eagle'), 'YYBYG');
});

const POOL = ['crane', 'slate', 'plumb', 'trace', 'grace'];

test('remainingAfter keeps only candidates consistent with the row', () => {
  const rows = [{ word: 'crane', pattern: score('crane', 'grace') }];
  assert.deepEqual(remainingAfter(rows, POOL), ['trace', 'grace']);
});

test('narrow returns the candidate set after each row', () => {
  const rows = [
    { word: 'crane', pattern: score('crane', 'grace') },
    { word: 'trace', pattern: score('trace', 'grace') },
  ];
  const sets = narrow(rows, POOL);
  assert.deepEqual(sets.map((s) => s.length), [2, 1]);
  assert.deepEqual(sets[1], ['grace']);
});

test('bestNextGuess splits the set and is deterministic on ties', () => {
  assert.equal(bestNextGuess(['trace', 'grace']), 'trace'); // tie resolves to first
  assert.equal(bestNextGuess(['grace']), 'grace'); // forced
  assert.equal(bestNextGuess([]), null); // nothing left
});
