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
  assert.deepEqual(plan, { kind: 'upsert', guesses: 4, grid: 'GGGGG', hardMode: false, status: 'inserted' });
});

// Only the summary is available for this player (no solo image): it is stored as
// given. A win keeps its real score; a loss is the coarse 6/false with no grid.
test('a summary win with no image is stored with its score and no grid', () => {
  const plan = planResultWrite(undefined, incoming({ source: 'summary', guesses: 4, solved: true, grid: null }));
  assert.deepEqual(plan, { kind: 'upsert', guesses: 4, grid: null, hardMode: false, status: 'inserted' });
});

test('a summary loss with no image is stored coarsely as 6/false with no grid', () => {
  const plan = planResultWrite(undefined, incoming({ source: 'summary', guesses: 6, solved: false, grid: null }));
  assert.deepEqual(plan, { kind: 'upsert', guesses: 6, grid: null, hardMode: false, status: 'inserted' });
});

// The reported bug: summary stored first (newer, no grid), image reached later
// (older, has grid). Before the fix this returned 'stale' and the grid was lost.
test('an older activity image backfills the grid onto a gridless summary row', () => {
  const existing = existingRow({ grid: null, message_ts: T_NEXT });
  const plan = planResultWrite(existing, incoming({ source: 'activity', grid: 'BYGGB', messageTs: T_DAY }));
  assert.deepEqual(plan, { kind: 'enrich', guesses: 4, grid: 'BYGGB', status: 'updated' });
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
  assert.deepEqual(plan, { kind: 'upsert', guesses: 4, grid: 'GGGGG', hardMode: false, status: 'unchanged' });
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

// A busted player: the daily summary records the loss only as X/6 (guesses 6, no
// grid), but the player's solo activity image shows the game was abandoned after 5
// guesses and carries that 5-row grid. Both agree it is a loss, so the image's real
// count and grid win. Backfill order: the summary lands first (newer), then the
// older image refines the stored count and grid in place without touching the row's
// win/loss or provenance.
test('an older solo image refines a busted summary loss with the real count and grid', () => {
  const existing = existingRow({ guesses: 6, solved: false, grid: null, message_ts: T_NEXT });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'activity', guesses: 5, solved: false, grid: 'BYBBG', messageTs: T_DAY }),
  );
  assert.deepEqual(plan, { kind: 'enrich', guesses: 5, grid: 'BYBBG', status: 'updated' });
});

// Live order of the same busted game: the solo image is stored first with its real
// count and grid, then the next-day summary (loss, no grid) must not coarsen it back
// to 6/null. The image's count and grid are kept; only provenance changes, so the
// game result is unchanged.
test('a newer busted summary keeps the real count and grid from an existing image', () => {
  const existing = existingRow({ guesses: 5, solved: false, grid: 'BYBBG', message_ts: T_DAY });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'summary', guesses: 6, solved: false, grid: null, messageTs: T_NEXT }),
  );
  assert.deepEqual(plan, { kind: 'upsert', guesses: 5, grid: 'BYBBG', hardMode: false, status: 'unchanged' });
});

// The correction protection still holds: a loss grid is never carried onto a row a
// later message marked solved. Backfill order (summary solved first, older loss
// image second).
test('an older loss grid is not borrowed onto a solved row', () => {
  const existing = existingRow({ guesses: 5, solved: true, grid: null, message_ts: T_NEXT });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'activity', guesses: 3, solved: false, grid: 'BYBBG', messageTs: T_DAY }),
  );
  assert.deepEqual(plan, { kind: 'skip', status: 'stale' });
});

// Live order: an unfinished game is stored first with its partial grid, then the
// next-day summary corrects it to a solve. The win/loss changed, so the partial
// loss grid is dropped rather than left on the now-solved row.
test('a newer gridless solve drops a stored partial loss grid', () => {
  const existing = existingRow({ guesses: 3, solved: false, grid: 'BYBBG', message_ts: T_DAY });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'summary', guesses: 5, solved: true, grid: null, messageTs: T_NEXT }),
  );
  assert.deepEqual(plan, { kind: 'upsert', guesses: 5, grid: null, hardMode: false, status: 'updated' });
});

// The finishing edit carries its own complete grid, which replaces the partial one.
test('a finishing edit replaces the stored partial grid with its complete grid', () => {
  const existing = existingRow({ guesses: 3, solved: false, grid: 'BYBBG', message_ts: T_DAY });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'activity', guesses: 5, solved: true, grid: 'GGGGG', messageTs: T_NEXT }),
  );
  assert.deepEqual(plan, { kind: 'upsert', guesses: 5, grid: 'GGGGG', hardMode: false, status: 'updated' });
});
