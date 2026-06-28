// Pure date math for the weekly report schedule. Kept free of config and
// database imports so it can be unit-tested in isolation.

import { localDateISO } from '../domain/wordle.js';

/** Local time of day the weekly report fires, in the group timezone. */
export const REPORT_HOUR = 0;
export const REPORT_MINUTE = 5;

// Milliseconds the zone is ahead of UTC at `instant` (e.g. +2h during CEST).
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const f: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') f[p.type] = Number(p.value);
  const hour = f.hour === 24 ? 0 : f.hour; // some zones format midnight as 24
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, hour, f.minute, f.second);
  return asUtc - instant.getTime();
}

// UTC instant for a wall-clock time in `timeZone`. Date.UTC normalizes day
// overflow, so passing day 32 rolls into the next month.
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = zoneOffsetMs(timeZone, new Date(guess));
  return new Date(guess - offset);
}

/** Next Monday at REPORT_HOUR:REPORT_MINUTE in `timeZone`, strictly after `now`. */
export function nextWeeklyReportTime(timeZone: string, now: Date = new Date()): Date {
  const todayIso = localDateISO(now, timeZone);
  const dow = (new Date(`${todayIso}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const daysUntilMonday = (7 - dow) % 7; // 0 when today is Monday
  const [y, m, d] = todayIso.split('-').map(Number);
  let candidate = zonedTimeToUtc(y, m, d + daysUntilMonday, REPORT_HOUR, REPORT_MINUTE, timeZone);
  if (candidate.getTime() <= now.getTime()) {
    candidate = zonedTimeToUtc(y, m, d + daysUntilMonday + 7, REPORT_HOUR, REPORT_MINUTE, timeZone);
  }
  return candidate;
}
