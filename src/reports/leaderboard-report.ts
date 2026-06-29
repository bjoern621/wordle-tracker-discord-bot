// Builds the leaderboard image shared by the `/leaderboard` command and the
// scheduled Monday post. Short periods (day, week) render a day-by-day grid,
// one row per player; longer periods (month, year, all time) render a ranked
// card of aggregate figures, since a column-per-day grid would not fit.

import { AttachmentBuilder } from 'discord.js';
import { getResults, getResultsByDay } from '../db/results.repository.js';
import { numberToIso, isoToNumber, PERIOD_LABEL } from '../domain/wordle.js';
import { aggregateLeaderboard, buildWeeklyGrid, fixed } from '../stats/stats.js';
import { renderWeeklyPng, type WeeklyImageRow } from '../render/weekly-image.js';
import { renderRankingPng, type RankingRow } from '../render/ranking-image.js';
import type { Period } from '../types.js';

/** Periods rendered as a day-by-day grid rather than an aggregate card. */
const GRID_PERIODS: ReadonlySet<Period> = new Set<Period>(['day', 'week']);

export interface LeaderboardReport {
  content?: string;
  files: AttachmentBuilder[];
}

// "1835" -> "Mon" for that puzzle's calendar date.
function weekdayShort(number: number): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${numberToIso(number)}T00:00:00Z`),
  );
}

// "1835" -> "Jun 28".
function dateLabel(number: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${numberToIso(number)}T00:00:00Z`),
  );
}

/**
 * Renders the leaderboard for `[from, to]` in a guild. `period` selects the
 * layout; `heading` is prepended to the message when set (used by the Monday
 * post). Returns null when nobody in the guild played that range.
 */
export async function buildLeaderboard(
  guildId: string,
  period: Period,
  from: string,
  to: string,
  heading?: string,
): Promise<LeaderboardReport | null> {
  return GRID_PERIODS.has(period)
    ? buildGrid(guildId, from, to, heading)
    : buildCard(guildId, period, from, to, heading);
}

// Day-by-day grid: one column per puzzle in the range, one row per player.
async function buildGrid(
  guildId: string,
  from: string,
  to: string,
  heading?: string,
): Promise<LeaderboardReport | null> {
  const rows = await getResultsByDay(guildId, from, to);
  if (!rows.length) return null;

  // Show every day in the range, even ones nobody played.
  const first = isoToNumber(from);
  const last = isoToNumber(to);
  const numbers = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const grid = buildWeeklyGrid(rows, numbers);
  const span =
    first === last ? dateLabel(first) : `${dateLabel(first)} - ${dateLabel(last)}`;

  const columns = grid.numbers.map((n) => ({
    weekday: weekdayShort(n),
    day: Number(numberToIso(n).slice(8, 10)),
  }));
  const imageRows: WeeklyImageRow[] = grid.players.map((p) => ({
    name: p.username || p.userId,
    avg: fixed(p.avgScore),
    cells: grid.numbers.map((n) => p.byNumber.get(n) ?? null),
  }));

  const png = renderWeeklyPng({ title: 'Wordle Leaderboard', span, columns, rows: imageRows });
  const file = new AttachmentBuilder(png, { name: 'leaderboard.png' });
  return { content: heading, files: [file] };
}

// Ranked card: aggregate figures per player for the whole range.
async function buildCard(
  guildId: string,
  period: Period,
  from: string,
  to: string,
  heading?: string,
): Promise<LeaderboardReport | null> {
  const entries = aggregateLeaderboard(await getResults(guildId, from, to));
  if (!entries.length) return null;

  const rows: RankingRow[] = entries.map((e) => ({
    name: e.username || e.userId,
    games: e.games,
    winRate: e.games ? e.wins / e.games : 0,
    avgScore: e.avgScore,
  }));

  const png = renderRankingPng({ title: 'Wordle Leaderboard', span: PERIOD_LABEL[period], rows });
  const file = new AttachmentBuilder(png, { name: 'leaderboard.png' });
  return { content: heading, files: [file] };
}
