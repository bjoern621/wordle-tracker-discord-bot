// Conflict resolution for the results table. The headline case is the backfill
// grid-loss bug: backfill walks history newest-to-oldest, so the next-day summary
// (no grid) is stored before the same-day activity image (grid). The image must
// still be able to fill the missing grid instead of being dropped as stale.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planResultWrite } from '../src/db/results-merge.js';
import type { ExistingRow, ResultRecord } from '../src/db/results-merge.js';
import type { ResultSource } from '../src/types.js';

const T_DAY = new Date('2026-06-27T20:00:00Z'); // image, posted on the puzzle day
const T_NEXT = new Date('2026-06-28T08:00:00Z'); // summary, posted the next day

function incoming(over: Partial<ResultRecord> = {}): ResultRecord {
  return {
    guildId: 'g1',
    userId: 'u1',
    puzzleNumber: 1834,
    puzzleDate: '2026-06-27',
    guesses: 4,
    solved: true,
    grid: null,
    hardMode: false,
    source: 'summary' as ResultSource,
    messageTs: T_NEXT,
    username: 'alice',
    messageId: 'm1',
    ...over,
  };
}

function existingRow(over: Partial<ExistingRow> = {}): ExistingRow {
  return {
    guesses: 4,
    solved: true,
    grid: null,
    hard_mode: false,
    message_ts: T_NEXT,
    ...over,
  };
}

test('first sighting of a puzzle is inserted', () => {
  const plan = planResultWrite(undefined, incoming({ source: 'activity', grid: 'GGGGG', messageTs: T_DAY }));
  assert.deepEqual(plan, { kind: 'upsert', grid: 'GGGGG', hardMode: false, status: 'inserted' });
});

// The reported bug: summary stored first (newer, no grid), image reached later
// (older, has grid). Before the fix this returned 'stale' and the grid was lost.
test('an older activity image backfills the grid onto a gridless summary row', () => {
  const existing = existingRow({ grid: null, message_ts: T_NEXT });
  const plan = planResultWrite(existing, incoming({ source: 'activity', grid: 'BYGGB', messageTs: T_DAY }));
  assert.deepEqual(plan, { kind: 'enrich-grid', grid: 'BYGGB', status: 'updated' });
});

test('an older grid does not overwrite a grid already stored', () => {
  const existing = existingRow({ grid: 'GGGGG', message_ts: T_NEXT });
  const plan = planResultWrite(existing, incoming({ source: 'activity', grid: 'BYGGB', messageTs: T_DAY }));
  assert.equal(plan.kind, 'skip');
  assert.equal(plan.status, 'stale');
});

test('an older message with no grid is ignored as stale', () => {
  const existing = existingRow({ message_ts: T_NEXT });
  const plan = planResultWrite(existing, incoming({ source: 'summary', grid: null, messageTs: T_DAY }));
  assert.deepEqual(plan, { kind: 'skip', status: 'stale' });
});

// Live ingestion order: the image arrives first (same day) and is stored with its
// grid, then the next-day summary (no grid) must not erase it.
test('a newer gridless summary preserves the grid of an existing image row', () => {
  const existing = existingRow({ grid: 'GGGGG', message_ts: T_DAY });
  const plan = planResultWrite(existing, incoming({ source: 'summary', grid: null, messageTs: T_NEXT }));
  assert.deepEqual(plan, { kind: 'upsert', grid: 'GGGGG', hardMode: false, status: 'unchanged' });
});

test('a newer message with its own grid overrides the stored grid', () => {
  const existing = existingRow({ grid: 'BBBBB', message_ts: T_DAY });
  const plan = planResultWrite(existing, incoming({ source: 'share-text', grid: 'GGGGG', messageTs: T_NEXT }));
  assert.equal(plan.kind, 'upsert');
  assert.equal(plan.kind === 'upsert' && plan.grid, 'GGGGG');
});

test('a newer message with a changed score reports updated', () => {
  const existing = existingRow({ guesses: 5, message_ts: T_DAY });
  const plan = planResultWrite(existing, incoming({ guesses: 3, messageTs: T_NEXT }));
  assert.equal(plan.status, 'updated');
});

test('a newer message with the same score reports unchanged', () => {
  const existing = existingRow({ guesses: 4, solved: true, message_ts: T_DAY });
  const plan = planResultWrite(existing, incoming({ guesses: 4, solved: true, messageTs: T_NEXT }));
  assert.equal(plan.status, 'unchanged');
});

// A failed game (X/6) recorded as solved=false changes outcome even at equal guesses.
test('a newer message flipping solved reports updated', () => {
  const existing = existingRow({ guesses: 6, solved: false, message_ts: T_DAY });
  const plan = planResultWrite(existing, incoming({ guesses: 6, solved: true, messageTs: T_NEXT }));
  assert.equal(plan.status, 'updated');
});

// The unfinished-game lifecycle: a partial grid is stored as a loss with its real
// row count (3/false), then the player finishes and the edited message re-ingests
// newer (5/true). The finishing score wins and the row becomes a solve.
test('a finishing edit overrides an unfinished partial-count loss', () => {
  const existing = existingRow({ guesses: 3, solved: false, message_ts: T_DAY });
  const plan = planResultWrite(existing, incoming({ source: 'activity', guesses: 5, solved: true, messageTs: T_NEXT }));
  assert.equal(plan.kind, 'upsert');
  assert.equal(plan.status, 'updated');
});

// Equal timestamps are not stale; the incoming row wins (edited message re-ingest).
test('an equal-timestamp message overwrites rather than being treated as stale', () => {
  const existing = existingRow({ guesses: 5, message_ts: T_NEXT });
  const plan = planResultWrite(existing, incoming({ guesses: 2, messageTs: T_NEXT }));
  assert.equal(plan.kind, 'upsert');
  assert.equal(plan.status, 'updated');
});

test('hard mode is preserved when a non-reporting source updates the row', () => {
  const existing = existingRow({ hard_mode: true, message_ts: T_DAY });
  const plan = planResultWrite(existing, incoming({ source: 'summary', hardMode: false, messageTs: T_NEXT }));
  assert.equal(plan.kind === 'upsert' && plan.hardMode, true);
});

test('a share-text source sets hard mode from its own value', () => {
  const existing = existingRow({ hard_mode: false, message_ts: T_DAY });
  const plan = planResultWrite(existing, incoming({ source: 'share-text', hardMode: true, messageTs: T_NEXT }));
  assert.equal(plan.kind === 'upsert' && plan.hardMode, true);
});

// Enrichment only borrows a grid that describes the stored row. An older grid for
// a different outcome (here 3 guesses against a stored 4) would not match the row
// it lands on, so it is rejected as stale rather than grafted on.
test('an older grid for a different outcome is not borrowed', () => {
  const existing = existingRow({ guesses: 4, solved: true, grid: null, message_ts: T_NEXT });
  const plan = planResultWrite(existing, incoming({ source: 'activity', guesses: 3, grid: 'YYGGG', messageTs: T_DAY }));
  assert.deepEqual(plan, { kind: 'skip', status: 'stale' });
});

// The backfill order for an unfinished game: the next-day summary (solved, no grid)
// is stored first, then the older same-day activity image carrying the partial grid
// arrives. The partial grid describes a loss, so it must not be grafted onto the
// solved row; the constraint that would otherwise break is solved-but-no-GGGGG.
test('an older unfinished partial grid is not borrowed onto a solved row', () => {
  const existing = existingRow({ guesses: 5, solved: true, grid: null, message_ts: T_NEXT });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'activity', guesses: 3, solved: false, grid: 'BYBBG', messageTs: T_DAY }),
  );
  assert.deepEqual(plan, { kind: 'skip', status: 'stale' });
});

// Live order: the unfinished game is stored first with its partial grid, then the
// next-day summary (no grid) corrects it to a solve. The summary's outcome differs,
// so the stored partial grid is dropped rather than left on the now-solved row.
test('a newer gridless solve drops a stored partial grid', () => {
  const existing = existingRow({ guesses: 3, solved: false, grid: 'BYBBG', message_ts: T_DAY });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'summary', guesses: 5, solved: true, grid: null, messageTs: T_NEXT }),
  );
  assert.deepEqual(plan, { kind: 'upsert', grid: null, hardMode: false, status: 'updated' });
});

// The finishing edit carries its own complete grid, which replaces the partial one.
test('a finishing edit replaces the stored partial grid with its complete grid', () => {
  const existing = existingRow({ guesses: 3, solved: false, grid: 'BYBBG', message_ts: T_DAY });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'activity', guesses: 5, solved: true, grid: 'GGGGG', messageTs: T_NEXT }),
  );
  assert.deepEqual(plan, { kind: 'upsert', grid: 'GGGGG', hardMode: false, status: 'updated' });
});
