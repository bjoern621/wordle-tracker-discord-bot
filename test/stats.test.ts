import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, aggregateLeaderboard, buildWeeklyGrid, headToHead, penaltyScore } from '../src/stats/stats.js';
import { FAIL_SCORE } from '../src/constants.js';
import type { DailyResultRow, LeaderboardRow, UserResultRow } from '../src/db/results.repository.js';

function userRow(
  number: number,
  guesses: number,
  solved: boolean,
  extra: Partial<UserResultRow> = {},
): UserResultRow {
  return {
    number,
    date: numberToDate(number),
    guesses,
    solved,
    grid: null,
    words: null,
    answer: null,
    hardMode: null,
    durationSeconds: null,
    source: 'summary',
    ...extra,
  };
}
const numberToDate = (n: number) => `2026-01-${String(n).padStart(2, '0')}`;

test('summarize counts wins, averages, distribution and streaks', () => {
  const rows = [
    userRow(1, 3, true),
    userRow(2, 4, true),
    userRow(3, 6, false),
    userRow(4, 2, true),
    userRow(5, 5, true),
  ];
  const s = summarize(rows);
  assert.equal(s.games, 5);
  assert.equal(s.wins, 4);
  assert.equal(s.fails, 1);
  assert.equal(s.winRate, 0.8);
  assert.equal(s.avgScore, 4.2); // (3+4+7+2+5)/5, fail counts as 7
  assert.deepEqual(s.distribution, [0, 1, 1, 1, 1, 0]);
  assert.equal(s.longest, 2); // 1-2 and 4-5
  assert.equal(s.current, 2); // latest solve 5, back through 4
});

// The avg-score contribution of any unsolved game is FAIL_SCORE, never its guess
// count. Swept over every partial count an unfinished game can carry (1-5) and the
// completed-failure count (6) to lock the invariant in: the count is ignored.
test('every unfinished guess count scores FAIL_SCORE for the average', () => {
  for (let g = 1; g <= 6; g += 1) {
    assert.equal(penaltyScore({ solved: false, guesses: g }), FAIL_SCORE);
    // avgScore over a 4-win plus this loss stays (4 + 7) / 2 regardless of g.
    assert.equal(summarize([userRow(1, 4, true), userRow(2, g, false)]).avgScore, (4 + FAIL_SCORE) / 2);
  }
});

// An unfinished game stores its partial guess count (1-5) but solved=false. That
// count must never reach a metric: it scores FAIL_SCORE like any loss, stays out
// of the distribution, and breaks the streak exactly like a 6/6 failure.
test('an unfinished game scores as a loss regardless of its partial guess count', () => {
  const unfinished = summarize([
    userRow(1, 4, true),
    userRow(2, 2, false), // abandoned after 2 guesses
    userRow(3, 5, true),
  ]);
  const failed = summarize([
    userRow(1, 4, true),
    userRow(2, 6, false), // completed X/6
    userRow(3, 5, true),
  ]);
  // The partial count (2) and the full failure (6) produce identical metrics.
  assert.equal(unfinished.avgScore, failed.avgScore);
  assert.equal(unfinished.avgScore, (4 + 7 + 5) / 3); // the loss counts as FAIL_SCORE, not 2
  assert.deepEqual(unfinished.distribution, failed.distribution);
  assert.deepEqual(unfinished.distribution, [0, 0, 0, 1, 1, 0]); // the 2/false loss is absent
  assert.equal(unfinished.fails, 1);
  assert.equal(unfinished.longest, 1); // the loss at puzzle 2 breaks the run
  assert.equal(unfinished.current, 1); // latest solve is puzzle 3, alone
});

test('summarize counts hard mode, reported or grid-inferred', () => {
  const compliant = JSON.stringify(['BYBBB', 'GBYBB', 'GGGGG']); // greens persist, count rises
  const violation = JSON.stringify(['GYBBB', 'BGBBB', 'GGGGG']); // col 0 green then not green
  const s = summarize([
    userRow(1, 3, true, { source: 'share-text', hardMode: true }), // reported on
    userRow(2, 3, true, { source: 'share-text', hardMode: false }), // reported off, grid ignored
    userRow(3, 3, true, { source: 'activity', grid: compliant }), // probably hard mode
    userRow(4, 3, true, { source: 'activity', grid: violation }), // grid rules it out
    userRow(5, 3, true, { source: 'summary' }), // no grid, no report
  ]);
  assert.equal(s.hardMode, 2); // the reported-on game and the compliant grid
});

test('summarize handles an all-empty history', () => {
  const s = summarize([]);
  assert.equal(s.games, 0);
  assert.equal(s.avgScore, null);
  assert.equal(s.current, 0);
  assert.equal(s.avgSolveSeconds, null);
  assert.equal(s.fastestSolveSeconds, null);
});

// Solve time averages only the solved games that carry timing. A loss with timing
// (an abandoned game) is excluded, and a game with no timing contributes nothing.
test('summarize averages solve time over timed wins only', () => {
  const s = summarize([
    userRow(1, 3, true, { durationSeconds: 120 }),
    userRow(2, 4, true, { durationSeconds: 60 }),
    userRow(3, 2, false, { durationSeconds: 30 }), // abandoned: excluded
    userRow(4, 5, true), // solved but untimed: excluded
  ]);
  assert.equal(s.avgSolveSeconds, 90); // (120 + 60) / 2
  assert.equal(s.fastestSolveSeconds, 60);
});

test('summarize reports null solve time when no win is timed', () => {
  const s = summarize([userRow(1, 3, true), userRow(2, 6, false, { durationSeconds: 200 })]);
  assert.equal(s.avgSolveSeconds, null);
  assert.equal(s.fastestSolveSeconds, null);
});

test('aggregateLeaderboard ranks by average score then games', () => {
  const rows: LeaderboardRow[] = [
    { userId: 'a', username: 'Alice', guesses: 2, solved: true, durationSeconds: null },
    { userId: 'a', username: 'Alice', guesses: 4, solved: true, durationSeconds: null },
    { userId: 'b', username: 'Bob', guesses: 3, solved: true, durationSeconds: null },
    { userId: 'b', username: 'Bob', guesses: 6, solved: false, durationSeconds: null },
  ];
  const board = aggregateLeaderboard(rows);
  assert.deepEqual(
    board.map((e) => e.userId),
    ['a', 'b'],
  );
  assert.equal(board[0].avgScore, 3); // (2+4)/2
  assert.equal(board[1].avgScore, 5); // (3+7)/2, fail counts as 7
});

test('aggregateLeaderboard averages solve time over solved, timed games', () => {
  const rows: LeaderboardRow[] = [
    { userId: 'a', username: 'Alice', guesses: 2, solved: true, durationSeconds: 120 },
    { userId: 'a', username: 'Alice', guesses: 4, solved: true, durationSeconds: 60 },
    { userId: 'a', username: 'Alice', guesses: 3, solved: true, durationSeconds: null }, // untimed: excluded
    { userId: 'a', username: 'Alice', guesses: 6, solved: false, durationSeconds: 999 }, // abandoned: excluded
    { userId: 'b', username: 'Bob', guesses: 3, solved: true, durationSeconds: null }, // no timing at all
  ];
  const board = aggregateLeaderboard(rows);
  const a = board.find((e) => e.userId === 'a')!;
  const b = board.find((e) => e.userId === 'b')!;
  assert.equal(a.avgSolveSeconds, 90); // (120 + 60) / 2
  assert.equal(b.avgSolveSeconds, null);
});

function dailyRow(extra: Partial<DailyResultRow> & Pick<DailyResultRow, 'userId' | 'number' | 'guesses' | 'solved'>): DailyResultRow {
  return { username: null, hardMode: null, grid: null, durationSeconds: null, ...extra };
}

test('buildWeeklyGrid gives one row per player, ranked by average score', () => {
  const rows: DailyResultRow[] = [
    dailyRow({ userId: 'a', username: 'Alice', number: 10, guesses: 3, solved: true }),
    dailyRow({ userId: 'a', username: 'Alice', number: 12, guesses: 2, solved: true }),
    dailyRow({ userId: 'b', username: 'Bob', number: 10, guesses: 4, solved: true }),
    dailyRow({ userId: 'b', username: 'Bob', number: 11, guesses: 6, solved: false }),
  ];
  const grid = buildWeeklyGrid(rows, [10, 11, 12, 13]); // columns fixed by caller, incl. unplayed day 13
  assert.deepEqual(grid.numbers, [10, 11, 12, 13]);
  assert.deepEqual(
    grid.players.map((p) => p.userId),
    ['a', 'b'], // Alice avg 2.5 beats Bob avg 5.5
  );
  assert.equal(grid.players[0].played, 2);
  assert.equal(grid.players[0].avgScore, 2.5);
  assert.equal(grid.players[0].byNumber.get(10)?.guesses, 3);
  assert.equal(grid.players[0].byNumber.has(11), false); // Alice skipped puzzle 11
  assert.equal(grid.players[1].byNumber.get(11)?.solved, false); // Bob failed it
});

test('buildWeeklyGrid carries each player average solve time', () => {
  const rows: DailyResultRow[] = [
    dailyRow({ userId: 'a', username: 'Alice', number: 10, guesses: 3, solved: true, durationSeconds: 100 }),
    dailyRow({ userId: 'a', username: 'Alice', number: 11, guesses: 2, solved: true, durationSeconds: 200 }),
    dailyRow({ userId: 'b', username: 'Bob', number: 10, guesses: 4, solved: true }),
  ];
  const grid = buildWeeklyGrid(rows, [10, 11]);
  const alice = grid.players.find((p) => p.userId === 'a')!;
  const bob = grid.players.find((p) => p.userId === 'b')!;
  assert.equal(alice.avgSolveSeconds, 150); // (100 + 200) / 2
  assert.equal(bob.avgSolveSeconds, null);
});

// Each cell carries the same effectiveHardMode the stats card uses: the reported
// flag when present, else grid inference, else false.
test('buildWeeklyGrid marks each cell with effective hard mode', () => {
  const compliant = JSON.stringify(['BYBBB', 'GBYBB', 'GGGGG']); // grid-inferred hard mode
  const rows: DailyResultRow[] = [
    dailyRow({ userId: 'a', number: 10, guesses: 3, solved: true, hardMode: true }), // reported on
    dailyRow({ userId: 'a', number: 11, guesses: 3, solved: true, hardMode: false, grid: compliant }), // reported off wins
    dailyRow({ userId: 'a', number: 12, guesses: 3, solved: true, grid: compliant }), // inferred on
    dailyRow({ userId: 'a', number: 13, guesses: 3, solved: true }), // no signal
  ];
  const cells = buildWeeklyGrid(rows, [10, 11, 12, 13]).players[0].byNumber;
  assert.equal(cells.get(10)?.hardMode, true);
  assert.equal(cells.get(11)?.hardMode, false);
  assert.equal(cells.get(12)?.hardMode, true);
  assert.equal(cells.get(13)?.hardMode, false);
});

test('headToHead compares only shared puzzles', () => {
  const p1 = [userRow(1, 3, true), userRow(2, 5, true), userRow(3, 6, false)];
  const p2 = [userRow(1, 4, true), userRow(2, 2, true), userRow(4, 1, true)];
  assert.deepEqual(headToHead(p1, p2), { common: 2, w1: 1, w2: 1, draw: 0 });
});
