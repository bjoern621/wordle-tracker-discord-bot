import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, aggregateLeaderboard, headToHead } from '../src/stats/stats.js';
import type { LeaderboardRow, UserResultRow } from '../src/db/results.repository.js';

function userRow(number: number, guesses: number, solved: boolean): UserResultRow {
  return { number, date: numberToDate(number), guesses, solved, grid: null, hardMode: false };
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
  assert.equal(s.avgGuesses, 3.5); // (3+4+2+5)/4
  assert.equal(s.avgScore, 4.2); // (3+4+7+2+5)/5, fail counts as 7
  assert.equal(s.best, 2);
  assert.deepEqual(s.distribution, [0, 1, 1, 1, 1, 0]);
  assert.equal(s.longest, 2); // 1-2 and 4-5
  assert.equal(s.current, 2); // latest solve 5, back through 4
});

test('summarize handles an all-empty history', () => {
  const s = summarize([]);
  assert.equal(s.games, 0);
  assert.equal(s.avgGuesses, null);
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

test('headToHead compares only shared puzzles', () => {
  const p1 = [userRow(1, 3, true), userRow(2, 5, true), userRow(3, 6, false)];
  const p2 = [userRow(1, 4, true), userRow(2, 2, true), userRow(4, 1, true)];
  assert.deepEqual(headToHead(p1, p2), { common: 2, w1: 1, w2: 1, draw: 0 });
});
