import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextWeeklyReportTime } from '../src/reports/report-time.js';

test('before 00:05 on a Monday, the next report is that same Monday', () => {
  // 2026-06-29 is a Monday; 00:00 UTC is before the 00:05 fire time.
  const next = nextWeeklyReportTime('UTC', new Date('2026-06-29T00:00:00Z'));
  assert.equal(next.toISOString(), '2026-06-29T00:05:00.000Z');
});

test('after 00:05 on a Monday, the next report rolls to the following Monday', () => {
  const next = nextWeeklyReportTime('UTC', new Date('2026-06-29T08:00:00Z'));
  assert.equal(next.toISOString(), '2026-07-06T00:05:00.000Z');
});

test('mid-week, the next report is the upcoming Monday', () => {
  // Wednesday 2026-07-01.
  const next = nextWeeklyReportTime('UTC', new Date('2026-07-01T12:00:00Z'));
  assert.equal(next.toISOString(), '2026-07-06T00:05:00.000Z');
});

test('the fire time tracks local 00:05 through the zone offset (summer)', () => {
  // CEST is UTC+2, so Monday 00:05 Berlin is the previous Sunday 22:05 UTC.
  const next = nextWeeklyReportTime('Europe/Berlin', new Date('2026-06-30T12:00:00Z'));
  assert.equal(next.toISOString(), '2026-07-05T22:05:00.000Z');
});

test('the fire time tracks local 00:05 through the zone offset (winter)', () => {
  // CET is UTC+1, so Monday 00:05 Berlin is the previous Sunday 23:05 UTC.
  const next = nextWeeklyReportTime('Europe/Berlin', new Date('2026-01-06T12:00:00Z'));
  assert.equal(next.toISOString(), '2026-01-11T23:05:00.000Z');
});
