// Shapes a player's results into a GitHub-style contribution calendar: 53 week
// columns of 7 days each, Sunday at the top, ending on the current local day.

import type { UserResultRow } from '../db/results.repository.js';
import { localDateISO, shiftISO, isoToNumber } from '../domain/wordle.js';

/** How a single day is drawn. */
export type DayState =
  | 'future' // after today; left blank
  | 'none' // in window, no game recorded
  | 'fail' // played, did not solve
  | 'win'; // solved (shaded by guess count)

export interface DayCell {
  iso: string;
  state: DayState;
  /** Guess count for played days (1-6); 0 otherwise. */
  guesses: number;
}

export interface CalendarData {
  /** Week columns, each 7 days with index 0 = Sunday. */
  weeks: DayCell[][];
  firstIso: string;
  lastIso: string;
  /** Days with a recorded game in the window. */
  played: number;
  /** Days solved in the window. */
  solved: number;
}

/** Number of week columns, matching GitHub's roughly one-year view. */
const WEEKS = 53;

export function buildCalendar(rows: UserResultRow[], timeZone: string): CalendarData {
  const byNumber = new Map<number, UserResultRow>();
  for (const r of rows) byNumber.set(r.number, r);

  const todayIso = localDateISO(new Date(), timeZone);
  const dow = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const firstSunday = shiftISO(todayIso, -dow - (WEEKS - 1) * 7);

  const weeks: DayCell[][] = [];
  let played = 0;
  let solved = 0;
  for (let col = 0; col < WEEKS; col += 1) {
    const week: DayCell[] = [];
    for (let row = 0; row < 7; row += 1) {
      const iso = shiftISO(firstSunday, col * 7 + row);
      if (iso > todayIso) {
        week.push({ iso, state: 'future', guesses: 0 });
        continue;
      }
      const res = byNumber.get(isoToNumber(iso));
      if (!res) {
        week.push({ iso, state: 'none', guesses: 0 });
        continue;
      }
      played += 1;
      if (res.solved) {
        solved += 1;
        week.push({ iso, state: 'win', guesses: res.guesses });
      } else {
        week.push({ iso, state: 'fail', guesses: res.guesses });
      }
    }
    weeks.push(week);
  }

  return { weeks, firstIso: firstSunday, lastIso: todayIso, played, solved };
}
