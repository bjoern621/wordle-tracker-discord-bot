import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoToNumber,
  numberToIso,
  shiftISO,
  numberForTimestamp,
  periodRange,
} from '../src/domain/wordle.js';

test('the anchor maps puzzle 1835 to 2026-06-28', () => {
  assert.equal(isoToNumber('2026-06-28'), 1835);
  assert.equal(numberToIso(1835), '2026-06-28');
});

test('isoToNumber and numberToIso round-trip', () => {
  for (let n = 1800; n <= 1870; n += 1) {
    assert.equal(isoToNumber(numberToIso(n)), n);
  }
});

test('shiftISO moves whole days', () => {
  assert.equal(shiftISO('2026-06-28', -1), '2026-06-27');
  assert.equal(shiftISO('2026-06-28', 3), '2026-07-01');
});

test('a daily summary uses yesterday\'s puzzle in the group timezone', () => {
  assert.equal(numberForTimestamp(new Date('2026-06-28T08:00:00Z'), 'Europe/Berlin', -1), 1834);
});

test('timezone decides the puzzle near midnight', () => {
  const ts = new Date('2026-06-27T23:30:00Z'); // already 2026-06-28 in Berlin (+2)
  assert.equal(numberForTimestamp(ts, 'Europe/Berlin'), 1835);
  assert.equal(numberForTimestamp(ts, 'UTC'), 1834);
});

test('the all-time period is unbounded', () => {
  assert.deepEqual(periodRange('all'), ['0000-01-01', '9999-12-31']);
});

test('a week period is Monday through Sunday', () => {
  const [from, to] = periodRange('week', 'UTC');
  assert.equal(new Date(`${from}T00:00:00Z`).getUTCDay(), 1); // Monday
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  assert.equal(days, 6);
});

test('a month period spans the first to the last day of one month', () => {
  const [from, to] = periodRange('month', 'UTC');
  assert.ok(from.endsWith('-01'));
  assert.equal(from.slice(0, 7), to.slice(0, 7));
});
