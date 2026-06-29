import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoToNumber,
  numberToIso,
  shiftISO,
  numberForTimestamp,
  periodRange,
  lastWeekRange,
  currentNumber,
  rejectFuturePuzzles,
  isValidISODate,
  resolvePeriod,
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

test('currentNumber is the puzzle for the current day in the timezone', () => {
  assert.equal(currentNumber('UTC', new Date('2026-06-28T12:00:00Z')), 1835);
  // 23:30 UTC on the 27th is already the 28th in Berlin (+2), so a day ahead of UTC.
  assert.equal(currentNumber('Europe/Berlin', new Date('2026-06-27T23:30:00Z')), 1835);
  assert.equal(currentNumber('UTC', new Date('2026-06-27T23:30:00Z')), 1834);
});

test('rejectFuturePuzzles keeps today and earlier, drops later puzzles', () => {
  const now = new Date('2026-06-28T12:00:00Z'); // today is #1835
  const { kept, dropped } = rejectFuturePuzzles(
    [{ number: 1834 }, { number: 1835 }, { number: 1836 }, { number: 9999 }],
    'UTC',
    now,
  );
  assert.deepEqual(kept.map((g) => g.number), [1834, 1835]);
  assert.deepEqual(dropped.map((g) => g.number), [1836, 9999]);
});

test('rejectFuturePuzzles handles empty input and preserves the game objects', () => {
  const now = new Date('2026-06-28T12:00:00Z');
  assert.deepEqual(rejectFuturePuzzles([], 'UTC', now), { kept: [], dropped: [] });
  const game = { number: 1835, guesses: 3, solved: true };
  const { kept } = rejectFuturePuzzles([game], 'UTC', now);
  assert.equal(kept[0], game); // same reference, extra fields intact
});

test('the all-time period is unbounded', () => {
  assert.deepEqual(periodRange('all'), ['0000-01-01', '9999-12-31']);
});

test('a day period is the single current day', () => {
  const [from, to] = periodRange('day', 'UTC');
  assert.equal(from, to);
});

test('a year period spans Jan 1 to Dec 31 of one year', () => {
  const [from, to] = periodRange('year', 'UTC');
  assert.ok(from.endsWith('-01-01'));
  assert.ok(to.endsWith('-12-31'));
  assert.equal(from.slice(0, 4), to.slice(0, 4));
});

test('a week period is Monday through Sunday', () => {
  const [from, to] = periodRange('week', 'UTC');
  assert.equal(new Date(`${from}T00:00:00Z`).getUTCDay(), 1); // Monday
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  assert.equal(days, 6);
});

test('lastWeekRange is the Monday-Sunday before the current week', () => {
  // 2026-06-29 is a Monday; the week that just ended is Jun 22 (Mon) - Jun 28 (Sun).
  assert.deepEqual(lastWeekRange('UTC', new Date('2026-06-29T00:05:00Z')), [
    '2026-06-22',
    '2026-06-28',
  ]);
  // Mid-week still points at the previous calendar week.
  assert.deepEqual(lastWeekRange('UTC', new Date('2026-07-01T12:00:00Z')), [
    '2026-06-22',
    '2026-06-28',
  ]);
});

test('a month period spans the first to the last day of one month', () => {
  const [from, to] = periodRange('month', 'UTC');
  assert.ok(from.endsWith('-01'));
  assert.equal(from.slice(0, 7), to.slice(0, 7));
});

test('isValidISODate accepts real dates and rejects malformed or impossible ones', () => {
  assert.equal(isValidISODate('2026-06-15'), true);
  assert.equal(isValidISODate('2026-02-30'), false); // no Feb 30
  assert.equal(isValidISODate('2026-13-01'), false); // no month 13
  assert.equal(isValidISODate('2026-6-1'), false); // not zero-padded
  assert.equal(isValidISODate('06/15/2026'), false);
  assert.equal(isValidISODate('not-a-date'), false);
});

test('resolvePeriod falls back to the preset period when no custom dates are given', () => {
  const res = resolvePeriod('week', null, null, 'UTC');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.range.label, 'This week');
    assert.deepEqual([res.range.from, res.range.to], periodRange('week', 'UTC'));
  }
});

test('resolvePeriod uses custom from/to bounds and overrides the dropdown', () => {
  const res = resolvePeriod('week', '2026-06-01', '2026-06-15', 'UTC');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.range.from, '2026-06-01');
    assert.equal(res.range.to, '2026-06-15');
    assert.equal(res.range.label, 'Jun 1, 2026 - Jun 15, 2026');
  }
});

test('resolvePeriod labels a single-day custom range with one date', () => {
  const res = resolvePeriod(null, '2026-06-15', '2026-06-15', 'UTC');
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.range.label, 'Jun 15, 2026');
});

test('resolvePeriod requires both custom bounds', () => {
  assert.equal(resolvePeriod(null, '2026-06-01', null).ok, false);
  assert.equal(resolvePeriod(null, null, '2026-06-15').ok, false);
});

test('resolvePeriod rejects invalid or reversed custom dates', () => {
  assert.equal(resolvePeriod(null, '2026-13-01', '2026-06-15').ok, false);
  assert.equal(resolvePeriod(null, 'June 1', '2026-06-15').ok, false);
  assert.equal(resolvePeriod(null, '2026-06-15', '2026-06-01').ok, false);
});
