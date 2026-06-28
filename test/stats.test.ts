import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, aggregateLeaderboard, buildWeeklyGrid, headToHead } from '../src/stats/stats.js';
import type { DailyResultRow, LeaderboardRow, UserResultRow } from '../src/db/results.repository.js';

function userRow(
  number: number,
  guesses: number,
  solved: boolean,
  extra: Partial<UserResultRow> = {},
): UserResultRow {
  return { number, date: numberToDate(number), guesses, solved, grid: null, hardMode: false, source: 'summary', ...extra };
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
  assert.equal(s.best, 2);
  assert.deepEqual(s.distribution, [0, 1, 1, 1, 1, 0]);
  assert.equal(s.longest, 2); // 1-2 and 4-5
  assert.equal(s.current, 2); // latest solve 5, back through 4
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
  assert.equal(s.best, null);
  assert.equal(s.current, 0);
});

test('aggregateLeaderboard ranks by average score then games', () => {
  const rows: LeaderboardRow[] = [
    { userId: 'a', username: 'Alice', guesses: 2, solved: true },
    { userId: 'a', username: 'Alice', guesses: 4, solved: true },
    { userId: 'b', username: 'Bob', guesses: 3, solved: true },
    { userId: 'b', username: 'Bob', guesses: 6, solved: false },
  ];
  const board = aggregateLeaderboard(rows);
  assert.deepEqual(
    board.map((e) => e.userId),
    ['a', 'b'],
  );
  assert.equal(board[0].avgScore, 3); // (2+4)/2
  assert.equal(board[0].best, 2);
  assert.equal(board[1].avgScore, 5); // (3+7)/2, fail counts as 7
  assert.equal(board[1].avgGuesses, 3); // only the solved game
});

test('buildWeeklyGrid gives one row per player, ranked by average score', () => {
  const rows: DailyResultRow[] = [
    { userId: 'a', username: 'Alice', number: 10, guesses: 3, solved: true },
    { userId: 'a', username: 'Alice', number: 12, guesses: 2, solved: true },
    { userId: 'b', username: 'Bob', number: 10, guesses: 4, solved: true },
    { userId: 'b', username: 'Bob', number: 11, guesses: 6, solved: false },
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

test('headToHead compares only shared puzzles', () => {
  const p1 = [userRow(1, 3, true), userRow(2, 5, true), userRow(3, 6, false)];
  const p2 = [userRow(1, 4, true), userRow(2, 2, true), userRow(4, 1, true)];
  assert.deepEqual(headToHead(p1, p2), { common: 2, w1: 1, w2: 1, draw: 0 });
});
