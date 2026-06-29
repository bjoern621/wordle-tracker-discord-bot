// Pure conflict-resolution logic for the `results` table, split out from the
// repository so it carries no database or config imports and can be unit-tested
// directly. recordResult reads the existing row, asks planResultWrite what to do,
// then runs the resulting query.

import type { ResultSource } from '../types.js';

export type RecordStatus = 'inserted' | 'updated' | 'unchanged' | 'stale';

/** Two nullable timestamps name the same instant (both null counts as same). */
function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/**
 * A game to persist. `grid`, `words`, `answer` and `hardMode` are null when the
 * source does not carry them (only a pasted /status reveals the words and answer,
 * only the manual-text sources report hard mode); all are fillable fields a later
 * or earlier message can supply. `grid` and `words` are JSON-encoded arrays.
 */
export interface ResultRecord {
  guildId: string;
  userId: string;
  puzzleNumber: number;
  puzzleDate: string;
  guesses: number;
  solved: boolean;
  grid: string | null;
  words: string | null;
  answer: string | null;
  hardMode: boolean | null;
  /** First/last guess timestamps, both null unless the Activity supplied them. */
  firstGuessAt: Date | null;
  lastGuessAt: Date | null;
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
  words: string | null;
  answer: string | null;
  hard_mode: boolean | null;
  first_guess_at: Date | null;
  last_guess_at: Date | null;
  message_ts: Date;
}

/**
 * What recordResult should do with an incoming record given the row already
 * stored (if any):
 * - `upsert`: insert, or overwrite the existing row with the incoming one.
 * - `enrich`: leave the existing row's win/loss, source, and timestamp alone and
 *   only fill its missing fields (guess count + grid, and/or hard mode) from this
 *   older message.
 * - `skip`: the incoming message adds nothing; ignore it.
 */
export type MergeAction =
  | {
      kind: 'upsert';
      guesses: number;
      grid: string | null;
      words: string | null;
      answer: string | null;
      hardMode: boolean | null;
      firstGuessAt: Date | null;
      lastGuessAt: Date | null;
      status: RecordStatus;
    }
  | {
      kind: 'enrich';
      guesses: number;
      grid: string | null;
      words: string | null;
      answer: string | null;
      hardMode: boolean | null;
      firstGuessAt: Date | null;
      lastGuessAt: Date | null;
      status: 'updated';
    }
  | { kind: 'skip'; status: 'stale' };

/**
 * Decides how to persist an incoming game against the row already stored for the
 * same (guild, user, puzzle). Two rules govern every decision:
 *
 *  1. Newer wins the outcome and provenance. The message with the later
 *     message_ts fixes the win/loss (solved), the source, the author, and the
 *     timestamp. An older message can never change them.
 *  2. Any message can fill a field the stored row is missing. Each fillable field
 *     follows the same rule: the newest message that carries a value wins it, and
 *     a message that carries no value (null) never erases one.
 *       - guess count + grid: a grid is the true guess count, with one row per
 *         guess actually played, whereas a daily summary reports a loss only as
 *         "X/6". The count and grid come from the newest grid-bearing message
 *         whose win/loss matches the stored row's, from either arrival direction.
 *         A grid is never carried onto a row of the other win/loss, so a partial
 *         loss grid cannot land on a row a later message marked solved.
 *       - guessed words: only a pasted /status carries them, paired with that same
 *         grid. They travel with the grid they belong to: kept whenever the grid
 *         is, filled onto a row that already holds the matching grid but no words,
 *         and never erased by a later message that re-shares the grid without them.
 *       - answer: the puzzle's solution, the same for every player, so any sighting
 *         (again only /status) fills it and nothing ever clears it.
 *       - hard mode: null until a source that reports it (the manual-text sources)
 *         is seen. A non-reporting message leaves hard mode null and never
 *         overwrites a reported value; the newest reporting message wins it.
 *       - play time: the first/last guess timestamps, supplied only by the Activity.
 *         They ride with the grid those guesses produced: kept while that grid is,
 *         advanced when an edit re-shares a later grid, and dropped when a corrected
 *         outcome drops the grid, so a finished game never keeps the partial game's
 *         duration. A source without timing never erases it.
 *
 * Every field therefore resolves to the value from the newest message that
 * carries one, independent of arrival order, so live ingestion (oldest first) and
 * backfill (newest first) reach the same stored row. The one arrival order that is
 * not neutral is a non-monotonic one carrying two different values for the same
 * fillable field (two distinct grids for one win/loss, or two reporting sources
 * that disagree on hard mode): the first to reach an empty field via `enrich`
 * stays, because the row keeps a single message_ts and cannot tell a later value
 * from an earlier one. Live and backfill are both monotonic and so unaffected.
 */
export function planResultWrite(existing: ExistingRow | undefined, r: ResultRecord): MergeAction {
  if (!existing) {
    return {
      kind: 'upsert',
      guesses: r.guesses,
      grid: r.grid,
      words: r.words,
      answer: r.answer,
      hardMode: r.hardMode,
      firstGuessAt: r.firstGuessAt,
      lastGuessAt: r.lastGuessAt,
      status: 'inserted',
    };
  }

  if (r.messageTs >= existing.message_ts) {
    // Newer or equal: the incoming row wins the outcome and provenance. Each
    // fillable field takes the incoming value when it carries one, otherwise keeps
    // the stored value. The stored grid is kept only when it was drawn for the same
    // win/loss, so a stale loss grid never sits on a row this message marks solved.
    // The words ride with the grid: kept when the stored grid is kept, and kept too
    // when this message re-shares that same grid without carrying the words.
    let guesses = r.guesses;
    let grid = r.grid;
    let words = r.words;
    const keptStoredGrid = !grid && !!existing.grid && existing.solved === r.solved;
    if (keptStoredGrid) {
      guesses = existing.guesses;
      grid = existing.grid;
      words = existing.words;
    } else if (grid && !words && grid === existing.grid && existing.solved === r.solved) {
      words = existing.words;
    }
    const answer = r.answer ?? existing.answer;
    const hardMode = r.hardMode ?? existing.hard_mode;
    // Timing rides with the grid that records the guesses. When the resolved grid is
    // the same play the row already held, keep its timing unless this message brings
    // its own (an Activity edit advances last_guess_at); a re-share without timing
    // never erases it. When the grid changed or was dropped, the timing is whatever
    // this message carried for it, so a corrected outcome leaves no stale duration.
    const sameGrid = grid !== null && grid === existing.grid && existing.solved === r.solved;
    let firstGuessAt: Date | null;
    let lastGuessAt: Date | null;
    if (keptStoredGrid) {
      firstGuessAt = existing.first_guess_at;
      lastGuessAt = existing.last_guess_at;
    } else if (sameGrid) {
      firstGuessAt = r.firstGuessAt ?? existing.first_guess_at;
      lastGuessAt = r.lastGuessAt ?? existing.last_guess_at;
    } else {
      firstGuessAt = r.firstGuessAt;
      lastGuessAt = r.lastGuessAt;
    }
    const status: RecordStatus =
      existing.guesses !== guesses ||
      existing.solved !== r.solved ||
      existing.grid !== grid ||
      existing.words !== words ||
      existing.answer !== answer ||
      existing.hard_mode !== hardMode ||
      !sameInstant(existing.first_guess_at, firstGuessAt) ||
      !sameInstant(existing.last_guess_at, lastGuessAt)
        ? 'updated'
        : 'unchanged';
    return { kind: 'upsert', guesses, grid, words, answer, hardMode, firstGuessAt, lastGuessAt, status };
  }

  // Older than what is stored: it cannot change the outcome or provenance, but it
  // can fill a field the row is still missing. A grid it carries for the same
  // win/loss supplies the real count and grid, and its words with it (the backfill
  // order for a busted player: the gridless summary lands first, then the older
  // solo image). Failing that, a /status message's words fill a row that already
  // holds the matching grid. The reported hard-mode flag and the puzzle answer each
  // fill a row that lacks them.
  let guesses = existing.guesses;
  let grid = existing.grid;
  let words = existing.words;
  let answer = existing.answer;
  let hardMode = existing.hard_mode;
  let firstGuessAt = existing.first_guess_at;
  let lastGuessAt = existing.last_guess_at;
  let changed = false;
  if (r.grid && !existing.grid && existing.solved === r.solved) {
    guesses = r.guesses;
    grid = r.grid;
    words = r.words;
    firstGuessAt = r.firstGuessAt;
    lastGuessAt = r.lastGuessAt;
    changed = true;
  } else if (r.words && !existing.words && r.grid === existing.grid && existing.solved === r.solved) {
    words = r.words;
    changed = true;
  }
  if (existing.answer === null && r.answer !== null) {
    answer = r.answer;
    changed = true;
  }
  if (existing.hard_mode === null && r.hardMode !== null) {
    hardMode = r.hardMode;
    changed = true;
  }
  // An older Activity image can fill timing onto a row whose grid for the same play
  // came from elsewhere (so backfill and live order converge on the same duration).
  if (existing.first_guess_at === null && r.firstGuessAt !== null && grid !== null && r.grid === grid && existing.solved === r.solved) {
    firstGuessAt = r.firstGuessAt;
    lastGuessAt = r.lastGuessAt;
    changed = true;
  }
  if (!changed) return { kind: 'skip', status: 'stale' };
  return { kind: 'enrich', guesses, grid, words, answer, hardMode, firstGuessAt, lastGuessAt, status: 'updated' };
}
