// Builds the weekly results image shared by the `/weekly` command and the
// scheduled Monday report. Given a Monday-Sunday ISO range, it collapses the
// week into one day-by-day row per player and renders it to a PNG.

import { AttachmentBuilder } from 'discord.js';
import { getResultsByDay } from '../db/results.repository.js';
import { numberToIso, isoToNumber } from '../domain/wordle.js';
import { buildWeeklyGrid, fixed } from '../stats/stats.js';
import { renderWeeklyPng, type WeeklyImageRow } from '../render/weekly-image.js';

/** Legend shown alongside the image so the shading is self-explanatory. */
export const WEEKLY_LEGEND =
  'Brighter green = fewer guesses. Red = failed. avg counts fails as 7.';

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

export interface WeeklyReport {
  content: string;
  file: AttachmentBuilder;
}

/**
 * Renders the week `[from, to]` for a guild. `from` is the week's Monday.
 * Returns null when nobody in the guild played that week.
 */
export async function buildWeeklyReport(
  guildId: string,
  from: string,
  to: string,
  heading?: string,
): Promise<WeeklyReport | null> {
  const rows = await getResultsByDay(guildId, from, to);
  if (!rows.length) return null;

  // Always show the whole week, Monday through Sunday, even on days nobody played.
  const monday = isoToNumber(from);
  const weekNumbers = Array.from({ length: 7 }, (_, i) => monday + i);
  const grid = buildWeeklyGrid(rows, weekNumbers);
  const first = grid.numbers[0];
  const last = grid.numbers[grid.numbers.length - 1];
  const range = first === last ? `#${first}` : `#${first}-${last}`;
  const span = first === last ? dateLabel(first) : `${dateLabel(first)} - ${dateLabel(last)}`;

  const columns = grid.numbers.map((n) => ({
    weekday: weekdayShort(n),
    day: Number(numberToIso(n).slice(8, 10)),
  }));
  const imageRows: WeeklyImageRow[] = grid.players.map((p) => ({
    name: p.username || p.userId,
    avg: fixed(p.avgScore),
    cells: grid.numbers.map((n) => p.byNumber.get(n) ?? null),
  }));

  const png = renderWeeklyPng({ title: `Weekly Wordle - ${range}`, span, columns, rows: imageRows });
  const file = new AttachmentBuilder(png, { name: 'weekly.png' });
  const content = heading ? `${heading}\n${WEEKLY_LEGEND}` : WEEKLY_LEGEND;
  return { content, file };
}
