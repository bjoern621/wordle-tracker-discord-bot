// Hard mode: the reported flag where a source carries it, and a colour-only
// inference ("probably hard mode") where it does not.

import type { ResultSource } from '../types.js';

// Manual-text sources carry the trailing `*` and so report hard mode exactly.
// Image and summary sources do not, leaving the stored flag at false regardless
// of how the game was actually played.
export function reportsHardMode(source: ResultSource): boolean {
  return source === 'share-text' || source === 'scoredle';
}

/** The stored grid is JSON.stringify of the per-guess B/Y/G rows. */
export function parseStoredGrid(grid: string | null): string[] | null {
  if (!grid) return null;
  try {
    const value = JSON.parse(grid);
    if (Array.isArray(value) && value.every((row) => typeof row === 'string')) return value;
  } catch {
    /* not a stored grid */
  }
  return null;
}

/**
 * Whether a finished grid could have been played in hard mode, judged from the
 * colours alone (the share grid hides the letters). NYT hard mode locks every
 * revealed hint into later guesses, which leaves two traces in the colour rows:
 *
 *  - a green letter stays in its position, so a column green in one row is green
 *    in every later row;
 *  - a revealed letter is never dropped, so the count of coloured (non-grey)
 *    tiles never decreases from one row to the next.
 *
 * The signal is one-directional. A broken rule proves the game was not hard mode.
 * An intact grid is only consistent with hard mode, not proof of it, since a
 * normal-mode game can satisfy both rules by chance (most short games do). Read a
 * true result as "probably hard mode" and a false result as "definitely not".
 */
export function gridIsHardModeConsistent(rows: readonly string[]): boolean {
  const greenColumns = new Set<number>();
  let previousColoured = 0;
  for (const row of rows) {
    let coloured = 0;
    for (let i = 0; i < row.length; i += 1) {
      const cell = row[i];
      if (cell !== 'B') coloured += 1;
      if (greenColumns.has(i) && cell !== 'G') return false; // a green regressed
      if (cell === 'G') greenColumns.add(i);
    }
    if (coloured < previousColoured) return false; // a revealed letter was dropped
    previousColoured = coloured;
  }
  return true;
}

/**
 * Whether a stored game counts as hard mode for aggregation. A source that
 * reports hard mode is authoritative (a missing flag means normal mode, not
 * unknown). Otherwise the grid decides: a hard-mode-consistent grid counts as
 * "probably hard mode", and is treated the same as a reported one.
 */
export function effectiveHardMode(row: {
  source: ResultSource;
  hardMode: boolean;
  grid: string | null;
}): boolean {
  if (reportsHardMode(row.source)) return row.hardMode;
  const grid = parseStoredGrid(row.grid);
  return grid ? gridIsHardModeConsistent(grid) : false;
}
