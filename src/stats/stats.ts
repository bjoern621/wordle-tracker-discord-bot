// Aggregations computed in JS from result rows. Kept out of SQL so the query
// layer stays database-agnostic.

import type { DailyResultRow, LeaderboardRow, UserResultRow } from '../db/results.repository.js';
import { FAIL_SCORE } from '../constants.js';
import { effectiveHardMode, parseStoredGrid } from '../domain/hard-mode.js';

/**
 * The score/win figures every view derives from a bag of games. One rollup
 * shared by the per-player summary and each leaderboard entry, so a win rate or
 * average is computed the same way wherever it appears.
 */
export interface GameTotals {
  games: number;
  wins: number;
  fails: number;
  winRate: number;
  /** Mean penalty score (fails count as FAIL_SCORE); null when no games. */
  avgScore: number | null;
}

export interface PlayerSummary extends GameTotals {
  distribution: number[];
  current: number;
  longest: number;
  /** Games played in hard mode, counting grid-inferred "probably hard mode". */
  hardMode: number;
}

export interface LeaderboardEntry extends GameTotals {
  userId: string;
  username: string | null;
}

export interface HeadToHead {
  common: number;
  w1: number;
  w2: number;
  draw: number;
}

/**
 * The score a single game contributes to an average or ranking: the number of
 * guesses for a win, or FAIL_SCORE for a loss. The one place this rule lives, so
 * every average and head-to-head comparison scores games identically.
 */
export function penaltyScore(r: { solved: boolean; guesses: number }): number {
  return r.solved ? r.guesses : FAIL_SCORE;
}

/**
 * Rolls a bag of games into the shared score/win figures. The single place those
 * derivations live, so the per-player summary and every leaderboard entry
 * average and rank games identically.
 */
export function totals(rows: readonly { solved: boolean; guesses: number }[]): GameTotals {
  let wins = 0;
  let scoreSum = 0;
  for (const r of rows) {
    scoreSum += penaltyScore(r);
    if (r.solved) wins += 1;
  }
  const games = rows.length;
  return {
    games,
    wins,
    fails: games - wins,
    winRate: games ? wins / games : 0,
    avgScore: games ? scoreSum / games : null,
  };
}

export function summarize(rows: UserResultRow[]): PlayerSummary {
  return {
    ...totals(rows),
    distribution: [1, 2, 3, 4, 5, 6].map(
      (g) => rows.filter((r) => r.solved && r.guesses === g).length,
    ),
    hardMode: rows.filter(effectiveHardMode).length,
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
 * Average opener strength: the greens and yellows the first guess reveals,
 * averaged over the games that carry a grid. Ranges 0 to 5; higher means the
 * opening word lands more letters. Null when no game in the set has a grid.
 */
export function openerStrength(rows: UserResultRow[]): number | null {
  let hits = 0;
  let counted = 0;
  for (const r of rows) {
    const first = parseStoredGrid(r.grid)?.[0];
    if (!first) continue;
    counted += 1;
    for (const cell of first) if (cell === 'G' || cell === 'Y') hits += 1;
  }
  return counted ? hits / counted : null;
}

/**
 * Groups raw result rows into a leaderboard, ranked by average score (failed
 * games count as FAIL_SCORE), then by games played.
 */
export function aggregateLeaderboard(rows: LeaderboardRow[]): LeaderboardEntry[] {
  const byUser = new Map<string, { username: string | null; rows: LeaderboardRow[] }>();
  for (const r of rows) {
    let u = byUser.get(r.userId);
    if (!u) byUser.set(r.userId, (u = { username: r.username, rows: [] }));
    if (r.username) u.username = r.username;
    u.rows.push(r);
  }
  return [...byUser.entries()]
    .map(([userId, u]) => ({ userId, username: u.username, ...totals(u.rows) }))
    .sort((a, b) => (a.avgScore ?? 0) - (b.avgScore ?? 0) || b.games - a.games);
}

export interface WeeklyCell {
  guesses: number;
  solved: boolean;
}

export interface WeeklyPlayerRow {
  userId: string;
  username: string | null;
  avgScore: number;
  played: number;
  byNumber: Map<number, WeeklyCell>;
}

export interface WeeklyGrid {
  /** The week's puzzle numbers in column order; every day is present. */
  numbers: number[];
  /** One row per player, ordered best average score first. */
  players: WeeklyPlayerRow[];
}

/**
 * Collapses a week of results into one row per player, keyed by puzzle number.
 * `numbers` fixes the columns (the full week), so a day nobody played is still a
 * column with empty cells. Players are ranked by average score (failed games
 * count as FAIL_SCORE), the same order as the leaderboard.
 */
export function buildWeeklyGrid(rows: DailyResultRow[], numbers: number[]): WeeklyGrid {
  const byUser = new Map<string, Map<number, WeeklyCell>>();
  for (const r of rows) {
    let cells = byUser.get(r.userId);
    if (!cells) byUser.set(r.userId, (cells = new Map()));
    cells.set(r.number, { guesses: r.guesses, solved: r.solved });
  }
  const players = aggregateLeaderboard(rows).map((e) => ({
    userId: e.userId,
    username: e.username,
    avgScore: e.avgScore ?? FAIL_SCORE,
    played: e.games,
    byNumber: byUser.get(e.userId)!,
  }));
  return { numbers, players };
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
    const s1 = penaltyScore(r);
    const s2 = penaltyScore(o);
    if (s1 < s2) w1 += 1;
    else if (s2 < s1) w2 += 1;
    else draw += 1;
  }
  return { common, w1, w2, draw };
}
