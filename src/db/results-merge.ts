// Pure conflict-resolution logic for the `results` table, split out from the
// repository so it carries no database or config imports and can be unit-tested
// directly. recordResult reads the existing row, asks planResultWrite what to do,
// then runs the resulting query.

import type { ResultSource } from '../types.js';
import { reportsHardMode } from '../domain/hard-mode.js';

export type RecordStatus = 'inserted' | 'updated' | 'unchanged' | 'stale';

/** A game to persist. */
export interface ResultRecord {
  guildId: string;
  userId: string;
  puzzleNumber: number;
  puzzleDate: string;
  guesses: number;
  solved: boolean;
  grid: string | null;
  hardMode: boolean;
  source: ResultSource;
  messageTs: Date;
  username: string;
  messageId: string;
}

/** The columns of an existing row that affect the merge decision. */
export interface ExistingRow {
  guesses: number;
  solved: boolean;
  grid: string | null;
  hard_mode: boolean;
  message_ts: Date;
}

/**
 * What recordResult should do with an incoming record given the row already
 * stored (if any):
 * - `upsert`: insert, or overwrite the existing row with the incoming one.
 * - `enrich`: leave the newer existing row's win/loss, source, and timestamp
 *   alone and only refine its guess count and grid from this older, grid-bearing
 *   message.
 * - `skip`: the incoming message adds nothing; ignore it.
 */
export type MergeAction =
  | { kind: 'upsert'; guesses: number; grid: string | null; hardMode: boolean; status: RecordStatus }
  | { kind: 'enrich'; guesses: number; grid: string; status: 'updated' }
  | { kind: 'skip'; status: 'stale' };

/**
 * Decides how to persist an incoming game against the row already stored for the
 * same (guild, user, puzzle).
 *
 * The most recent message wins the win/loss outcome and the provenance (source,
 * timestamp, author). The guess count and grid are decided separately, because a
 * grid is the true guess count: it has one row per guess actually played, whereas
 * a daily summary reports any loss only as "X/6" and so records six even when the
 * solo activity image shows the game was abandoned earlier. So whenever two
 * messages agree on the win/loss, the grid-bearing one's guess count and grid are
 * kept, regardless of arrival order. A grid is never carried onto a row of the
 * other win/loss, so a partial loss grid cannot land on a row a later message
 * marked solved.
 */
export function planResultWrite(existing: ExistingRow | undefined, r: ResultRecord): MergeAction {
  const hardMode = reportsHardMode(r.source) ? r.hardMode : existing?.hard_mode ?? r.hardMode;

  if (!existing) {
    return { kind: 'upsert', guesses: r.guesses, grid: r.grid, hardMode, status: 'inserted' };
  }

  if (r.messageTs >= existing.message_ts) {
    // Newer or equal: the incoming row wins the outcome and provenance. The guess
    // count and grid come from whichever message carries a grid for this win/loss;
    // the incoming grid is preferred, otherwise the stored grid is kept only when it
    // was drawn for the same win/loss, so a stale loss grid never sits on a row this
    // message marks solved.
    let guesses = r.guesses;
    let grid = r.grid;
    if (!grid && existing.grid && existing.solved === r.solved) {
      guesses = existing.guesses;
      grid = existing.grid;
    }
    const status: RecordStatus =
      existing.guesses !== guesses || existing.solved !== r.solved ? 'updated' : 'unchanged';
    return { kind: 'upsert', guesses, grid, hardMode, status };
  }

  // Older than what is stored: it cannot change the outcome or provenance. A grid it
  // carries for the same win/loss refines the stored guess count and grid when the
  // row has none, which is the backfill order for a busted player: the gridless
  // summary lands first, then the older solo image supplies the real count and grid.
  if (r.grid && !existing.grid && existing.solved === r.solved) {
    return { kind: 'enrich', guesses: r.guesses, grid: r.grid, status: 'updated' };
  }
  return { kind: 'skip', status: 'stale' };
}
