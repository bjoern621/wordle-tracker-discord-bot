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
}

/** Row shape returned for a single player's history. */
export interface UserResultRow {
  number: number;
  date: string;
  guesses: number;
  solved: boolean;
  grid: string | null;
  hardMode: boolean;
  source: ResultSource;
}

/**
 * Records one game. The most recent message wins the win/loss and provenance (by
 * message_ts); an older message arriving late is ignored, except that one carrying
 * a grid for the same win/loss refines the stored guess count and grid when the row
 * has none. A summary reports a loss only as X/6, so a solo image's real abandoned
 * count and grid win even when the summary was stored first. Hard mode is only
 * changed by the manual-text sources (others do not report it). See planResultWrite
 * for the full decision.
 */
export async function recordResult(r: ResultRecord): Promise<RecordStatus> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<ExistingRow>(
      `SELECT guesses, solved, grid, hard_mode, message_ts
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
        `UPDATE results SET guesses = $4, grid = $5, updated_at = now()
          WHERE guild_id = $1 AND user_id = $2 AND puzzle_number = $3`,
        [r.guildId, r.userId, r.puzzleNumber, plan.guesses, plan.grid],
      );
      await client.query('COMMIT');
      return plan.status;
    }

    await client.query(
      `INSERT INTO results
         (guild_id, user_id, puzzle_number, puzzle_date, guesses, solved, grid, hard_mode, source, message_ts, username, message_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       ON CONFLICT (guild_id, user_id, puzzle_number) DO UPDATE SET
         puzzle_date = excluded.puzzle_date,
         guesses     = excluded.guesses,
         solved      = excluded.solved,
         grid        = excluded.grid,
         hard_mode   = excluded.hard_mode,
         source      = excluded.source,
         message_ts  = excluded.message_ts,
         username    = excluded.username,
         message_id  = excluded.message_id,
         updated_at  = now()`,
      [r.guildId, r.userId, r.puzzleNumber, r.puzzleDate, plan.guesses, r.solved, plan.grid, plan.hardMode, r.source, r.messageTs, r.username, r.messageId],
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
    `SELECT user_id AS "userId", username, puzzle_number AS number, guesses, solved
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
    `SELECT puzzle_number AS number, puzzle_date AS date, guesses, solved, grid, hard_mode AS "hardMode", source
       FROM results
      WHERE guild_id = $1 AND user_id = $2 AND puzzle_date BETWEEN $3 AND $4
      ORDER BY puzzle_number ASC`,
    [guildId, userId, from, to],
  );
  return rows;
}
