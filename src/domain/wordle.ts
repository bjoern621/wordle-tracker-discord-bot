// Puzzle-number and date math. Wordle rolls over at local midnight, so day
// attribution depends on the group's timezone.

import type { Period } from '../types.js';

// Anchor observed from real data: puzzle #1835 was played on 2026-06-28.
const ANCHOR_NUMBER = 1835;
const ANCHOR_ISO = '2026-06-28';
const DAY = 86_400_000;
const anchorMs = Date.parse(`${ANCHOR_ISO}T00:00:00Z`);

/** Calendar date (YYYY-MM-DD) of an instant in a given IANA timezone. */
export function localDateISO(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function shiftISO(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function isoToNumber(iso: string): number {
  return ANCHOR_NUMBER + Math.round((Date.parse(`${iso}T00:00:00Z`) - anchorMs) / DAY);
}

export function numberToIso(n: number): string {
  return new Date(anchorMs + (n - ANCHOR_NUMBER) * DAY).toISOString().slice(0, 10);
}

/**
 * Puzzle number for a message timestamp, interpreted in the group's timezone.
 * `dayOffset` -1 maps a daily summary ("yesterday's results") to its puzzle.
 */
export function numberForTimestamp(date: Date, timeZone: string, dayOffset = 0): number {
  return isoToNumber(shiftISO(localDateISO(date, timeZone), dayOffset));
}

/** Puzzle number for the current day in the group's timezone. Anything greater is in the future. */
export function currentNumber(timeZone = 'UTC', now: Date = new Date()): number {
  return numberForTimestamp(now, timeZone);
}

/**
 * Splits games into those playable now and those dated after the current day in
 * the given timezone. A future puzzle cannot have been played yet, so accepting
 * one would inflate streaks and stats.
 */
export function rejectFuturePuzzles<T extends { number: number }>(
  games: readonly T[],
  timeZone: string,
  now: Date = new Date(),
): { kept: T[]; dropped: T[] } {
  const today = currentNumber(timeZone, now);
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const game of games) (game.number > today ? dropped : kept).push(game);
  return { kept, dropped };
}

/** Periods offered by the leaderboard and stats commands, ordered widest first. */
export const PERIODS = ['all', 'year', 'month', 'week', 'day'] as const;

/** Human label for each period, shown in command choices and image titles. */
export const PERIOD_LABEL: Record<Period, string> = {
  all: 'All time',
  year: 'This year',
  month: 'This month',
  week: 'This week',
  day: 'Today',
};

/** Narrows a raw option string to a Period, defaulting to all time. */
export function periodFrom(value: string | null): Period {
  return value != null && (PERIODS as readonly string[]).includes(value)
    ? (value as Period)
    : 'all';
}

/** Inclusive [from, to] ISO date bounds for a leaderboard period, in timezone. */
export function periodRange(period: Period, timeZone = 'UTC'): [string, string] {
  const todayIso = localDateISO(new Date(), timeZone);
  if (period === 'day') {
    return [todayIso, todayIso];
  }
  if (period === 'week') {
    const dow = (new Date(`${todayIso}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
    return [shiftISO(todayIso, -dow), shiftISO(todayIso, 6 - dow)];
  }
  if (period === 'month') {
    const first = `${todayIso.slice(0, 7)}-01`;
    const lastDay = new Date(
      Date.UTC(Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)), 0),
    ).getUTCDate();
    return [first, `${todayIso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`];
  }
  if (period === 'year') {
    const year = todayIso.slice(0, 4);
    return [`${year}-01-01`, `${year}-12-31`];
  }
  return ['0000-01-01', '9999-12-31'];
}

/**
 * Inclusive [from, to] ISO bounds for the Monday-Sunday week before the one
 * containing `now`, in `timeZone`. Run on a Monday, this is the week that just
 * ended; run any other day, it is still the previous calendar week.
 */
export function lastWeekRange(timeZone = 'UTC', now: Date = new Date()): [string, string] {
  const todayIso = localDateISO(now, timeZone);
  const dow = (new Date(`${todayIso}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const thisMonday = shiftISO(todayIso, -dow);
  return [shiftISO(thisMonday, -7), shiftISO(thisMonday, -1)];
}
