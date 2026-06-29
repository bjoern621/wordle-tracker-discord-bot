// Data access for the `results` table. One row per (server, player, puzzle).

import { pool } from './pool.js';
import { planResultWrite } from './results-merge.js';
import type { ExistingRow, RecordStatus, ResultRecord } from './results-merge.js';
import type { ResultSource } from '../types.js';

export type { RecordStatus, ResultRecord } from './results-merge.js';

/** Row shape returned for leaderboard aggregation. */
export interface LeaderboardRow {
  userId: string;
  username: string | null;
  guesses: number;
  solved: boolean;
}

/** Leaderboard row plus the puzzle it belongs to, for the day-by-day weekly view. */
export interface DailyResultRow extends LeaderboardRow {
  number: number;
  /** Reported hard-mode flag, or null when the source did not report it. */
  hardMode: boolean | null;
  /** Stored colour grid, used to infer hard mode when the flag is null. */
  grid: string | null;
}

/** Row shape returned for a single player's history. */
export interface UserResultRow {
  number: number;
  date: string;
  guesses: number;
  solved: boolean;
  grid: string | null;
  /** JSON array of the guessed words, or null unless a /status filled it. */
  words: string | null;
  /** The puzzle answer, or null unless a /status filled it. */
  answer: string | null;
  hardMode: boolean | null;
  /**
   * Seconds from the first guess to the last guess seen, or null when no source
   * supplied timing. For an unfinished game this is the span up to the last guess
   * observed, so it is finite rather than open-ended.
   */
  durationSeconds: number | null;
  source: ResultSource;
}

/**
 * Records one game. The most recent message wins the win/loss and provenance (by
 * message_ts); an older message arriving late is ignored, except that one can fill
 * a field the stored row is missing: a grid for the same win/loss refines the guess
 * count and grid, a /status fills the guessed words and answer, and a reported
 * hard-mode flag fills a row that has none. A summary reports a loss only as X/6, so
 * a solo image's real abandoned count and grid win even when the summary was stored
 * first. Hard mode stays null until a manual-text source reports it (others do not).
 * See planResultWrite for the full decision.
 */
export async function recordResult(r: ResultRecord): Promise<RecordStatus> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<ExistingRow>(
      `SELECT guesses, solved, grid, guess_words AS words, answer, hard_mode,
              first_guess_at, last_guess_at, message_ts
         FROM results
        WHERE guild_id = $1 AND user_id = $2 AND puzzle_number = $3
        FOR UPDATE`,
      [r.guildId, r.userId, r.puzzleNumber],
    );
    const plan = planResultWrite(rows[0], r);

    if (plan.kind === 'skip') {
      await client.query('COMMIT');
      return plan.status;
    }

    if (plan.kind === 'enrich') {
      await client.query(
        `UPDATE results
            SET guesses = $4, grid = $5, guess_words = $6, answer = $7, hard_mode = $8,
                first_guess_at = $9, last_guess_at = $10, updated_at = now()
          WHERE guild_id = $1 AND user_id = $2 AND puzzle_number = $3`,
        [r.guildId, r.userId, r.puzzleNumber, plan.guesses, plan.grid, plan.words, plan.answer, plan.hardMode, plan.firstGuessAt, plan.lastGuessAt],
      );
      await client.query('COMMIT');
      return plan.status;
    }

    await client.query(
      `INSERT INTO results
         (guild_id, user_id, puzzle_number, puzzle_date, guesses, solved, grid, guess_words, answer, hard_mode, first_guess_at, last_guess_at, source, message_ts, username, message_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
       ON CONFLICT (guild_id, user_id, puzzle_number) DO UPDATE SET
         puzzle_date    = excluded.puzzle_date,
         guesses        = excluded.guesses,
         solved         = excluded.solved,
         grid           = excluded.grid,
         guess_words    = excluded.guess_words,
         answer         = excluded.answer,
         hard_mode      = excluded.hard_mode,
         first_guess_at = excluded.first_guess_at,
         last_guess_at  = excluded.last_guess_at,
         source         = excluded.source,
         message_ts     = excluded.message_ts,
         username       = excluded.username,
         message_id     = excluded.message_id,
         updated_at     = now()`,
      [r.guildId, r.userId, r.puzzleNumber, r.puzzleDate, plan.guesses, r.solved, plan.grid, plan.words, plan.answer, plan.hardMode, plan.firstGuessAt, plan.lastGuessAt, r.source, r.messageTs, r.username, r.messageId],
    );

    await client.query('COMMIT');
    return plan.status;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getResults(guildId: string, from: string, to: string): Promise<LeaderboardRow[]> {
  const { rows } = await pool.query<LeaderboardRow>(
    `SELECT user_id AS "userId", username, guesses, solved
       FROM results
      WHERE guild_id = $1 AND puzzle_date BETWEEN $2 AND $3`,
    [guildId, from, to],
  );
  return rows;
}

export async function getResultsByDay(guildId: string, from: string, to: string): Promise<DailyResultRow[]> {
  const { rows } = await pool.query<DailyResultRow>(
    `SELECT user_id AS "userId", username, puzzle_number AS number, guesses, solved,
            hard_mode AS "hardMode", grid
       FROM results
      WHERE guild_id = $1 AND puzzle_date BETWEEN $2 AND $3
      ORDER BY puzzle_number ASC`,
    [guildId, from, to],
  );
  return rows;
}

export async function getUserResults(
  guildId: string,
  userId: string,
  from: string,
  to: string,
): Promise<UserResultRow[]> {
  const { rows } = await pool.query<UserResultRow>(
    `SELECT puzzle_number AS number, puzzle_date AS date, guesses, solved, grid,
            guess_words AS words, answer, hard_mode AS "hardMode",
            EXTRACT(EPOCH FROM (last_guess_at - first_guess_at))::int AS "durationSeconds",
            source
       FROM results
      WHERE guild_id = $1 AND user_id = $2 AND puzzle_date BETWEEN $3 AND $4
      ORDER BY puzzle_number ASC`,
    [guildId, userId, from, to],
  );
  return rows;
}

// The UserResultRow projection, shared by the single-game getters below so they
// stay in step with getUserResults above.
const USER_GAME_COLUMNS = `puzzle_number AS number, puzzle_date AS date, guesses, solved, grid,
            guess_words AS words, answer, hard_mode AS "hardMode",
            EXTRACT(EPOCH FROM (last_guess_at - first_guess_at))::int AS "durationSeconds",
            source`;

/** One player's game for a single puzzle, or null when they did not play it. */
export async function getUserGame(
  guildId: string,
  userId: string,
  puzzleNumber: number,
): Promise<UserResultRow | null> {
  const { rows } = await pool.query<UserResultRow>(
    `SELECT ${USER_GAME_COLUMNS}
       FROM results
      WHERE guild_id = $1 AND user_id = $2 AND puzzle_number = $3`,
    [guildId, userId, puzzleNumber],
  );
  return rows[0] ?? null;
}

/** One player's most recent game by puzzle number, or null when they have none. */
export async function getLatestUserGame(
  guildId: string,
  userId: string,
): Promise<UserResultRow | null> {
  const { rows } = await pool.query<UserResultRow>(
    `SELECT ${USER_GAME_COLUMNS}
       FROM results
      WHERE guild_id = $1 AND user_id = $2
      ORDER BY puzzle_number DESC
      LIMIT 1`,
    [guildId, userId],
  );
  return rows[0] ?? null;
}
