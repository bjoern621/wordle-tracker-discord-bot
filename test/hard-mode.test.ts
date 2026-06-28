import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gridIsHardModeConsistent,
  effectiveHardMode,
  parseStoredGrid,
} from '../src/domain/hard-mode.js';

test('a grid with persisting greens and non-falling colour count is consistent', () => {
  assert.equal(gridIsHardModeConsistent(['BBYBB', 'BGBBB', 'GGGGG']), true);
  assert.equal(gridIsHardModeConsistent(['GGGGG']), true); // a one-guess solve
  assert.equal(gridIsHardModeConsistent(['BBBBB', 'YBBBB', 'GGGGG']), true);
});

test('a green that regresses to non-green rules out hard mode', () => {
  assert.equal(gridIsHardModeConsistent(['BGBBB', 'BBBBB', 'GGGGG']), false);
});

test('a dropped revealed letter (colour count falls) rules out hard mode', () => {
  assert.equal(gridIsHardModeConsistent(['YYBBB', 'GBBBB', 'GGGGG']), false);
});

test('parseStoredGrid reads the JSON array and rejects anything else', () => {
  assert.deepEqual(parseStoredGrid(JSON.stringify(['GGGGG'])), ['GGGGG']);
  assert.equal(parseStoredGrid(null), null);
  assert.equal(parseStoredGrid('not json'), null);
  assert.equal(parseStoredGrid(JSON.stringify({ a: 1 })), null);
});

test('reported sources are authoritative, regardless of the grid', () => {
  const violating = JSON.stringify(['BGBBB', 'BBBBB', 'GGGGG']);
  const compliant = JSON.stringify(['BBBBB', 'YBBBB', 'GGGGG']);
  // A reported-on game counts even if its grid would not pass inference.
  assert.equal(effectiveHardMode({ source: 'share-text', hardMode: true, grid: violating }), true);
  // A reported-off game does not count even if its grid is consistent.
  assert.equal(effectiveHardMode({ source: 'share-text', hardMode: false, grid: compliant }), false);
});

test('non-reporting sources fall back to grid inference', () => {
  const compliant = JSON.stringify(['BBBBB', 'YBBBB', 'GGGGG']);
  const violating = JSON.stringify(['BGBBB', 'BBBBB', 'GGGGG']);
  assert.equal(effectiveHardMode({ source: 'activity', hardMode: false, grid: compliant }), true);
  assert.equal(effectiveHardMode({ source: 'activity', hardMode: false, grid: violating }), false);
  assert.equal(effectiveHardMode({ source: 'activity', hardMode: false, grid: null }), false);
});
