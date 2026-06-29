// Shapes a player's results into a single-month day grid for the /history view.

import type { UserResultRow } from '../db/results.repository.js';
import { localDateISO, isoToNumber, numberToIso } from '../domain/wordle.js';

/** How a single day is drawn. */
export type DayState =
  | 'future' // after today; left blank
  | 'none' // in the month, no game recorded
  | 'fail' // played, did not solve
  | 'win'; // solved (shaded by guess count)

/** One day of a single-month view. */
export interface MonthCell {
  day: number; // 1..31
  state: DayState;
  guesses: number;
}

export interface MonthData {
  /** "YYYY-MM" of the month shown. */
  month: string;
  /** Day cells in calendar order, index 0 = the 1st. */
  cells: MonthCell[];
  /** Monday-based column of the 1st (0 = Monday ... 6 = Sunday). */
  leading: number;
  played: number;
  solved: number;
}

/** Distinct months ("YYYY-MM") a player has a recorded game in, oldest first. */
export function playedMonths(rows: readonly UserResultRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(numberToIso(r.number).slice(0, 7));
  return [...set].sort();
}

/** Shapes one month ("YYYY-MM") of a player's results into a day grid. */
export function buildMonth(
  rows: UserResultRow[],
  month: string,
  timeZone: string,
  now: Date = new Date(),
): MonthData {
  const byNumber = new Map<number, UserResultRow>();
  for (const r of rows) byNumber.set(r.number, r);

  const todayIso = localDateISO(now, timeZone);
  const [year, mon] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const firstDow = new Date(`${month}-01T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const leading = (firstDow + 6) % 7; // shift so Monday is column 0

  const cells: MonthCell[] = [];
  let played = 0;
  let solved = 0;
  for (let day = 1; day <= days; day += 1) {
    const iso = `${month}-${String(day).padStart(2, '0')}`;
    if (iso > todayIso) {
      cells.push({ day, state: 'future', guesses: 0 });
      continue;
    }
    const res = byNumber.get(isoToNumber(iso));
    if (!res) {
      cells.push({ day, state: 'none', guesses: 0 });
      continue;
    }
    played += 1;
    if (res.solved) {
      solved += 1;
      cells.push({ day, state: 'win', guesses: res.guesses });
    } else {
      cells.push({ day, state: 'fail', guesses: res.guesses });
    }
  }

  return { month, cells, leading, played, solved };
}
