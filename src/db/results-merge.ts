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
 * - `enrich-grid`: leave the newer existing row's score/source/timestamp alone
 *   and only fill in its missing grid from this older, grid-bearing message.
 * - `skip`: the incoming message adds nothing; ignore it.
 */
export type MergeAction =
  | { kind: 'upsert'; grid: string | null; hardMode: boolean; status: RecordStatus }
  | { kind: 'enrich-grid'; grid: string; status: 'updated' }
  | { kind: 'skip'; status: 'stale' };

/**
 * Whether two records describe the same game outcome. A grid encodes both its
 * guess count (one row each) and the win/loss (a solved game ends on an all-green
 * row, a loss never has one), so a grid only correctly describes a row when their
 * outcomes match. Carrying a grid between rows of differing outcome would graft,
 * for example, an unfinished game's partial grid onto a row a later message marked
 * solved.
 */
function sameOutcome(a: { guesses: number; solved: boolean }, b: { guesses: number; solved: boolean }): boolean {
  return a.guesses === b.guesses && a.solved === b.solved;
}

/**
 * Decides how to persist an incoming game against the row already stored for the
 * same (guild, user, puzzle). The most recent message wins by message_ts, with
 * one exception: an older message that carries a grid can still backfill the grid
 * onto a row that has none, provided both describe the same outcome. That case
 * matters for `/backfill`, which walks history newest-to-oldest and so stores the
 * next-day summary (no grid) before reaching the same-day activity image (grid);
 * without the exception the image is rejected as stale and its grid is lost. The
 * outcome check keeps a partial grid from an unfinished game off a row a later
 * message marked solved.
 */
export function planResultWrite(existing: ExistingRow | undefined, r: ResultRecord): MergeAction {
  if (existing && r.messageTs < existing.message_ts) {
    // Older than what is stored. Borrow only the grid, and only if it adds one the
    // existing row lacks and describes the same outcome; the newer row stays
    // authoritative for everything else.
    if (r.grid && !existing.grid && sameOutcome(existing, r)) {
      return { kind: 'enrich-grid', grid: r.grid, status: 'updated' };
    }
    return { kind: 'skip', status: 'stale' };
  }

  // First sighting, or newer-or-equal: the incoming row wins. Its own grid always
  // matches its outcome; an existing grid is kept only when the new outcome is the
  // one it was drawn for, otherwise dropped so a stale partial grid never sits on a
  // corrected row. Inherit hard mode from the stored row unless this source reports it.
  const grid = r.grid ?? (existing && sameOutcome(existing, r) ? existing.grid : null);
  const hardMode = reportsHardMode(r.source) ? r.hardMode : existing?.hard_mode ?? r.hardMode;

  let status: RecordStatus;
  if (!existing) status = 'inserted';
  else status = existing.guesses !== r.guesses || existing.solved !== r.solved ? 'updated' : 'unchanged';

  return { kind: 'upsert', grid, hardMode, status };
}
