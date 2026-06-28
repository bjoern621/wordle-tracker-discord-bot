// Aggregations computed in JS from result rows. Kept out of SQL so the query
// layer stays database-agnostic.

import type { LeaderboardRow, UserResultRow } from '../db/results.repository.js';
import { FAIL_SCORE } from '../constants.js';

export interface PlayerSummary {
  games: number;
  wins: number;
  fails: number;
  winRate: number;
  avgScore: number | null;
  best: number | null;
  distribution: number[];
  current: number;
  longest: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string | null;
  games: number;
  wins: number;
  avgScore: number | null;
  avgGuesses: number | null;
  best: number | null;
}

export interface HeadToHead {
  common: number;
  w1: number;
  w2: number;
  draw: number;
}

export function summarize(rows: UserResultRow[]): PlayerSummary {
  const games = rows.length;
  const wins = rows.filter((r) => r.solved).length;
  const solvedGuesses = rows.filter((r) => r.solved).map((r) => r.guesses);
  const avgScore = games
    ? rows.reduce((a, r) => a + (r.solved ? r.guesses : FAIL_SCORE), 0) / games
    : null;
  const distribution = [1, 2, 3, 4, 5, 6].map(
    (g) => rows.filter((r) => r.solved && r.guesses === g).length,
  );
  return {
    games,
    wins,
    fails: games - wins,
    winRate: games ? wins / games : 0,
    avgScore,
    best: solvedGuesses.length ? Math.min(...solvedGuesses) : null,
    distribution,
    ...streaks(rows),
  };
}

// A streak is a run of consecutive puzzle numbers that were all solved. A miss
// or a fail breaks it. Current streak is the run ending at the latest solve.
function streaks(rows: UserResultRow[]): { current: number; longest: number } {
  const solved = rows
    .filter((r) => r.solved)
    .map((r) => r.number)
    .sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const n of solved) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = n;
  }
  let current = 0;
  if (solved.length) {
    const set = new Set(solved);
    let n = solved[solved.length - 1];
    while (set.has(n)) {
      current += 1;
      n -= 1;
    }
  }
  return { current, longest };
}

/**
 * Groups raw result rows into a leaderboard, ranked by average score (failed
 * games count as FAIL_SCORE), then by games played.
 */
export function aggregateLeaderboard(rows: LeaderboardRow[]): LeaderboardEntry[] {
  interface Acc {
    userId: string;
    username: string | null;
    games: number;
    wins: number;
    scoreSum: number;
    guessSum: number;
    best: number | null;
  }
  const byUser = new Map<string, Acc>();
  for (const r of rows) {
    let u = byUser.get(r.userId);
    if (!u) {
      u = { userId: r.userId, username: r.username, games: 0, wins: 0, scoreSum: 0, guessSum: 0, best: null };
      byUser.set(r.userId, u);
    }
    if (r.username) u.username = r.username;
    u.games += 1;
    u.scoreSum += r.solved ? r.guesses : FAIL_SCORE;
    if (r.solved) {
      u.wins += 1;
      u.guessSum += r.guesses;
      u.best = u.best == null ? r.guesses : Math.min(u.best, r.guesses);
    }
  }
  return [...byUser.values()]
    .map((u) => ({
      userId: u.userId,
      username: u.username,
      games: u.games,
      wins: u.wins,
      avgScore: u.games ? u.scoreSum / u.games : null,
      avgGuesses: u.wins ? u.guessSum / u.wins : null,
      best: u.best,
    }))
    .sort((a, b) => (a.avgScore ?? 0) - (b.avgScore ?? 0) || b.games - a.games);
}

export function headToHead(rows1: UserResultRow[], rows2: UserResultRow[]): HeadToHead {
  const other = new Map(rows2.map((r) => [r.number, r]));
  let common = 0;
  let w1 = 0;
  let w2 = 0;
  let draw = 0;
  for (const r of rows1) {
    const o = other.get(r.number);
    if (!o) continue;
    common += 1;
    const s1 = r.solved ? r.guesses : FAIL_SCORE;
    const s2 = o.solved ? o.guesses : FAIL_SCORE;
    if (s1 < s2) w1 += 1;
    else if (s2 < s1) w2 += 1;
    else draw += 1;
  }
  return { common, w1, w2, draw };
}

export function histogram(distribution: number[]): string {
  const max = Math.max(1, ...distribution);
  return distribution
    .map((count, i) => {
      const bar = '█'.repeat(Math.round((count / max) * 12)).padEnd(12, '░');
      return `${i + 1} ${bar} ${count}`;
    })
    .join('\n');
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;
export const fixed = (x: number | null, d = 2): string => (x == null ? '-' : x.toFixed(d));
