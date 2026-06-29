// Conflict resolution for the results table. The headline case is the backfill
// grid-loss bug: backfill walks history newest-to-oldest, so the next-day summary
// (no grid) is stored before the same-day activity image (grid). The image must
// still be able to fill the missing grid instead of being dropped as stale.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planResultWrite } from '../src/db/results-merge.js';
import type { ExistingRow, ResultRecord } from '../src/db/results-merge.js';
import { effectiveHardMode } from '../src/domain/hard-mode.js';
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
    words: null,
    answer: null,
    hardMode: null, // default source 'summary' does not report hard mode
    firstGuessAt: null, // default source carries no per-guess timing
    lastGuessAt: null,
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
    words: null,
    answer: null,
    hard_mode: null, // a row first created by a non-reporting source
    first_guess_at: null,
    last_guess_at: null,
    message_ts: T_NEXT,
    ...over,
  };
}

test('first sighting of a puzzle is inserted', () => {
  const plan = planResultWrite(undefined, incoming({ source: 'activity', grid: 'GGGGG', messageTs: T_DAY }));
  assert.deepEqual(plan, { kind: 'upsert', guesses: 4, grid: 'GGGGG', words: null, answer: null, hardMode: null, firstGuessAt: null, lastGuessAt: null, status: 'inserted' });
});

// Only the summary is available for this player (no solo image): it is stored as
// given. A win keeps its real score; a loss is the coarse 6/false with no grid.
test('a summary win with no image is stored with its score and no grid', () => {
  const plan = planResultWrite(undefined, incoming({ source: 'summary', guesses: 4, solved: true, grid: null }));
  assert.deepEqual(plan, { kind: 'upsert', guesses: 4, grid: null, words: null, answer: null, hardMode: null, firstGuessAt: null, lastGuessAt: null, status: 'inserted' });
});

test('a summary loss with no image is stored coarsely as 6/false with no grid', () => {
  const plan = planResultWrite(undefined, incoming({ source: 'summary', guesses: 6, solved: false, grid: null }));
  assert.deepEqual(plan, { kind: 'upsert', guesses: 6, grid: null, words: null, answer: null, hardMode: null, firstGuessAt: null, lastGuessAt: null, status: 'inserted' });
});

// The reported bug: summary stored first (newer, no grid), image reached later
// (older, has grid). Before the fix this returned 'stale' and the grid was lost.
test('an older activity image backfills the grid onto a gridless summary row', () => {
  const existing = existingRow({ grid: null, message_ts: T_NEXT });
  const plan = planResultWrite(existing, incoming({ source: 'activity', grid: 'BYGGB', messageTs: T_DAY }));
  assert.deepEqual(plan, { kind: 'enrich', guesses: 4, grid: 'BYGGB', words: null, answer: null, hardMode: null, firstGuessAt: null, lastGuessAt: null, status: 'updated' });
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
  assert.deepEqual(plan, { kind: 'upsert', guesses: 4, grid: 'GGGGG', words: null, answer: null, hardMode: null, firstGuessAt: null, lastGuessAt: null, status: 'unchanged' });
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

// A non-reporting source carries hardMode null, so a newer one never erases a
// reported value: the stored true survives the next-day summary.
test('hard mode is preserved when a non-reporting source updates the row', () => {
  const existing = existingRow({ hard_mode: true, message_ts: T_DAY });
  const plan = planResultWrite(existing, incoming({ source: 'summary', hardMode: null, messageTs: T_NEXT }));
  assert.equal(plan.kind === 'upsert' && plan.hardMode, true);
});

// Backfill order of the same pair: the gridless summary lands first (null hard
// mode), then the older share-text supplies the reported value via enrich. The
// stored hard mode is identical to the live order, so the two no longer diverge.
test('an older reporting source fills hard mode onto a row that has none', () => {
  const existing = existingRow({ hard_mode: null, message_ts: T_NEXT });
  const plan = planResultWrite(existing, incoming({ source: 'share-text', hardMode: true, messageTs: T_DAY }));
  assert.deepEqual(plan, { kind: 'enrich', guesses: 4, grid: null, words: null, answer: null, hardMode: true, firstGuessAt: null, lastGuessAt: null, status: 'updated' });
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
  assert.deepEqual(plan, { kind: 'enrich', guesses: 5, grid: 'BYBBG', words: null, answer: null, hardMode: null, firstGuessAt: null, lastGuessAt: null, status: 'updated' });
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
  assert.deepEqual(plan, { kind: 'upsert', guesses: 5, grid: 'BYBBG', words: null, answer: null, hardMode: null, firstGuessAt: null, lastGuessAt: null, status: 'unchanged' });
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
  assert.deepEqual(plan, { kind: 'upsert', guesses: 5, grid: null, words: null, answer: null, hardMode: null, firstGuessAt: null, lastGuessAt: null, status: 'updated' });
});

// The finishing edit carries its own complete grid, which replaces the partial one.
test('a finishing edit replaces the stored partial grid with its complete grid', () => {
  const existing = existingRow({ guesses: 3, solved: false, grid: 'BYBBG', message_ts: T_DAY });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'activity', guesses: 5, solved: true, grid: 'GGGGG', messageTs: T_NEXT }),
  );
  assert.deepEqual(plan, { kind: 'upsert', guesses: 5, grid: 'GGGGG', words: null, answer: null, hardMode: null, firstGuessAt: null, lastGuessAt: null, status: 'updated' });
});

// --- Play timing ------------------------------------------------------------
// The Activity supplies the only timing the bot can see: its message creation is
// the first guess, its latest edit the last guess. The pair rides with the grid
// those guesses produced and is dropped whenever that grid is.

const T_FIRST = new Date('2026-06-27T20:00:00Z');
const T_LAST = new Date('2026-06-27T20:03:30Z'); // 3m30s later
const T_LAST_2 = new Date('2026-06-27T20:05:00Z'); // a later edit still

// A finished game keeps the span from the first guess to the winning guess.
test('an activity image stores the first and last guess timestamps', () => {
  const plan = planResultWrite(
    undefined,
    incoming({ source: 'activity', solved: true, guesses: 3, grid: 'GGGGG', firstGuessAt: T_FIRST, lastGuessAt: T_LAST, messageTs: T_LAST }),
  );
  assert.equal(plan.kind, 'upsert');
  assert.deepEqual(plan.kind === 'upsert' && [plan.firstGuessAt, plan.lastGuessAt], [T_FIRST, T_LAST]);
});

// A later edit (the next guess) keeps the same start and advances the last guess,
// so the recorded duration grows with the game rather than resetting.
test('a later activity edit advances the last guess but keeps the first', () => {
  const existing = existingRow({
    guesses: 2,
    solved: false,
    grid: JSON.stringify(['BBBBB', 'BYBBB']),
    first_guess_at: T_FIRST,
    last_guess_at: T_LAST,
    message_ts: T_LAST,
  });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'activity', solved: false, guesses: 3, grid: JSON.stringify(['BBBBB', 'BYBBB', 'BYBBG']), firstGuessAt: T_FIRST, lastGuessAt: T_LAST_2, messageTs: T_LAST_2 }),
  );
  assert.equal(plan.kind === 'upsert' && plan.firstGuessAt?.getTime(), T_FIRST.getTime());
  assert.equal(plan.kind === 'upsert' && plan.lastGuessAt?.getTime(), T_LAST_2.getTime());
});

// An unfinished game that is never finished keeps the bounded span up to its last
// observed guess: a newer gridless summary (no timing) preserves it, same outcome.
test('a gridless summary preserves an abandoned game timing of the same outcome', () => {
  const existing = existingRow({
    guesses: 2,
    solved: false,
    grid: JSON.stringify(['BBBBB', 'BYBBB']),
    first_guess_at: T_FIRST,
    last_guess_at: T_LAST,
    message_ts: T_DAY,
  });
  const plan = planResultWrite(existing, incoming({ source: 'summary', solved: false, guesses: 6, grid: null, messageTs: T_NEXT }));
  assert.equal(plan.kind === 'upsert' && plan.firstGuessAt?.getTime(), T_FIRST.getTime());
  assert.equal(plan.kind === 'upsert' && plan.lastGuessAt?.getTime(), T_LAST.getTime());
});

// A correction that flips the outcome drops the grid, so the abandoned-attempt
// timing goes with it rather than being mislabelled as the finished game's time.
test('a newer gridless solve drops a stored partial grid timing', () => {
  const existing = existingRow({
    guesses: 2,
    solved: false,
    grid: JSON.stringify(['BBBBB', 'BYBBB']),
    first_guess_at: T_FIRST,
    last_guess_at: T_LAST,
    message_ts: T_DAY,
  });
  const plan = planResultWrite(existing, incoming({ source: 'summary', solved: true, guesses: 4, grid: null, messageTs: T_NEXT }));
  assert.deepEqual(plan.kind === 'upsert' && [plan.grid, plan.firstGuessAt, plan.lastGuessAt], [null, null, null]);
});

// Backfill order: a gridless summary lands first, then the older activity image
// backfills the grid and brings its timing onto the row.
test('an older activity image backfills timing with the grid onto a gridless row', () => {
  const existing = existingRow({ guesses: 3, solved: true, grid: null, message_ts: T_NEXT });
  const plan = planResultWrite(
    existing,
    incoming({ source: 'activity', solved: true, guesses: 3, grid: 'GGGGG', firstGuessAt: T_FIRST, lastGuessAt: T_LAST, messageTs: T_DAY }),
  );
  assert.equal(plan.kind, 'enrich');
  assert.deepEqual(plan.kind === 'enrich' && [plan.firstGuessAt, plan.lastGuessAt], [T_FIRST, T_LAST]);
});

// --- Order independence -----------------------------------------------------
// The merge promises the same stored row no matter what order a set of messages
// for one (guild, user, puzzle) arrives in: the newest message fixes the win/loss
// and provenance, and any message can fill a fillable field the row is missing
// (guess count + grid, and hard mode). The harness below folds a sequence of
// records exactly as recordResult does, then checks that different arrival orders
// of the same set converge, raw hard_mode column included.

/** The persisted row, mirroring what recordResult stores. */
interface StoredRow {
  guesses: number;
  solved: boolean;
  grid: string | null;
  words: string | null;
  answer: string | null;
  hard_mode: boolean | null;
  first_guess_at: Date | null;
  last_guess_at: Date | null;
  message_ts: Date;
  source: ResultSource;
}

/** Folds one record into the stored row, mirroring recordResult's apply step. */
function applyRecord(existing: StoredRow | undefined, r: ResultRecord): StoredRow {
  const plan = planResultWrite(existing, r);
  switch (plan.kind) {
    case 'skip':
      return existing as StoredRow;
    case 'enrich':
      return {
        ...(existing as StoredRow),
        guesses: plan.guesses,
        grid: plan.grid,
        words: plan.words,
        answer: plan.answer,
        hard_mode: plan.hardMode,
        first_guess_at: plan.firstGuessAt,
        last_guess_at: plan.lastGuessAt,
      };
    case 'upsert':
      return {
        guesses: plan.guesses,
        solved: r.solved,
        grid: plan.grid,
        words: plan.words,
        answer: plan.answer,
        hard_mode: plan.hardMode,
        first_guess_at: plan.firstGuessAt,
        last_guess_at: plan.lastGuessAt,
        message_ts: r.messageTs,
        source: r.source,
      };
  }
}

function runInOrder(records: ResultRecord[]): StoredRow {
  let row: StoredRow | undefined;
  for (const r of records) row = applyRecord(row, r);
  return row as StoredRow;
}

/**
 * The state a reader actually observes, including the raw hard_mode column and
 * its read-time value through effectiveHardMode. Both are asserted, so the merge
 * must agree on the stored flag itself, not only on what a reader derives.
 */
function observable(row: StoredRow) {
  return {
    solved: row.solved,
    guesses: row.guesses,
    grid: row.grid,
    words: row.words,
    answer: row.answer,
    source: row.source,
    messageTs: row.message_ts.toISOString(),
    hardMode: row.hard_mode,
    firstGuessAt: row.first_guess_at?.toISOString() ?? null,
    lastGuessAt: row.last_guess_at?.toISOString() ?? null,
    effectiveHardMode: effectiveHardMode({ hardMode: row.hard_mode, grid: row.grid }),
  };
}

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) =>
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}

const TS = (mins: number) => new Date(T_DAY.getTime() + mins * 60_000);
// JSON-encoded grids, the on-disk shape effectiveHardMode reads back.
const WIN_GRID = JSON.stringify(['BBBBB', 'BYBBG', 'GGGGG']); // 3-guess win
const PARTIAL_LOSS_GRID = JSON.stringify(['BBBBB', 'BYBBB']); // abandoned after 2
// The /status words that pair with WIN_GRID: three guesses ending on the answer.
const WIN_WORDS = JSON.stringify(['slate', 'briny', 'crane']);
const WIN_ANSWER = 'crane';

// Activity play timing: the message's edit time is the last guess, with the first
// guess a few minutes earlier. `mins` apart, ending at the message timestamp `end`.
const PLAY = (end: Date, mins = 3) => ({
  firstGuessAt: new Date(end.getTime() - mins * 60_000),
  lastGuessAt: end,
});

// Sets with at most one grid per win/loss value. For these, every arrival order
// converges, so all permutations must reach the same observable state.
const convergentSets: Array<{ name: string; records: ResultRecord[] }> = [
  {
    name: 'win: gridless summary and grid-bearing image',
    records: [
      incoming({ source: 'activity', solved: true, guesses: 3, grid: WIN_GRID, messageTs: TS(0), ...PLAY(TS(0)) }),
      incoming({ source: 'summary', solved: true, guesses: 3, grid: null, messageTs: TS(720) }),
    ],
  },
  {
    name: 'busted loss: coarse summary X/6 and real abandoned image',
    records: [
      incoming({ source: 'activity', solved: false, guesses: 2, grid: PARTIAL_LOSS_GRID, messageTs: TS(0), ...PLAY(TS(0)) }),
      incoming({ source: 'summary', solved: false, guesses: 6, grid: null, messageTs: TS(720) }),
    ],
  },
  {
    name: 'finish overturns an unfinished loss, dropping the partial grid',
    records: [
      incoming({ source: 'activity', solved: false, guesses: 2, grid: PARTIAL_LOSS_GRID, messageTs: TS(0), ...PLAY(TS(0)) }),
      incoming({ source: 'summary', solved: true, guesses: 4, grid: null, messageTs: TS(720) }),
    ],
  },
  {
    name: 'three messages, single win grid plus two gridless summaries',
    records: [
      incoming({ source: 'summary', solved: true, guesses: 4, grid: null, messageTs: TS(0) }),
      incoming({ source: 'activity', solved: true, guesses: 3, grid: WIN_GRID, messageTs: TS(60), ...PLAY(TS(60)) }),
      incoming({ source: 'summary', solved: true, guesses: 4, grid: null, messageTs: TS(720) }),
    ],
  },
  {
    name: 'reporting share-text win is authoritative for hard mode',
    records: [
      incoming({ source: 'share-text', solved: true, guesses: 3, grid: WIN_GRID, hardMode: true, messageTs: TS(60) }),
      incoming({ source: 'summary', solved: true, guesses: 3, grid: null, messageTs: TS(720) }),
    ],
  },
  {
    // The /status carries the same grid plus the words and answer; whichever order
    // it arrives in, the words land on the row and survive the gridless summary and
    // the wordless activity image that share its grid. The activity's play timing
    // rides on that same grid and reaches the row from every arrival order too.
    name: 'status fills the words and answer onto a shared win grid',
    records: [
      incoming({ source: 'activity', solved: true, guesses: 3, grid: WIN_GRID, messageTs: TS(0), ...PLAY(TS(0)) }),
      incoming({
        source: 'status',
        solved: true,
        guesses: 3,
        grid: WIN_GRID,
        words: WIN_WORDS,
        answer: WIN_ANSWER,
        hardMode: false,
        messageTs: TS(60),
      }),
      incoming({ source: 'summary', solved: true, guesses: 3, grid: null, messageTs: TS(720) }),
    ],
  },
];

for (const { name, records } of convergentSets) {
  test(`every arrival order converges: ${name}`, () => {
    const expected = observable(runInOrder(records));
    for (const order of permutations(records)) {
      assert.deepEqual(observable(runInOrder(order)), expected);
    }
  });
}

// With two distinct grids for the same win/loss, only the real ingestion orders
// are guaranteed to agree: live (oldest first) and backfill (newest first). Both
// resolve to the newest grid-bearing message for the outcome.
test('live and backfill agree when two grids exist for the same loss', () => {
  const SHARE_LOSS_GRID = JSON.stringify(['BBBBB', 'BYBBB', 'YBBBB', 'BBBBB', 'BBBBB', 'BBYBB']);
  const records = [
    incoming({ source: 'activity', solved: false, guesses: 2, grid: PARTIAL_LOSS_GRID, messageTs: TS(0) }),
    incoming({ source: 'share-text', solved: false, guesses: 6, grid: SHARE_LOSS_GRID, hardMode: true, messageTs: TS(60) }),
    incoming({ source: 'summary', solved: false, guesses: 6, grid: null, messageTs: TS(720) }),
  ];
  const ascending = [...records].sort((a, b) => a.messageTs.getTime() - b.messageTs.getTime());
  const descending = [...ascending].reverse();
  const live = observable(runInOrder(ascending));
  const backfill = observable(runInOrder(descending));
  assert.deepEqual(live, backfill);
  // The newest grid-bearing message for the loss is the share-text, so its count
  // and grid win over the older partial image's.
  assert.equal(live.guesses, 6);
  assert.equal(live.grid, SHARE_LOSS_GRID);
});
