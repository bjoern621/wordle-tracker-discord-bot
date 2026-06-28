// Data access for the `results` table. One row per (server, player, puzzle).

import type { ResultSource } from '../types.js';
import { pool } from './pool.js';

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

/** Row shape returned for leaderboard aggregation. */
export interface LeaderboardRow {
  userId: string;
  username: string | null;
  guesses: number;
  solved: boolean;
}

/** Row shape returned for a single player's history. */
export interface UserResultRow {
  number: number;
  date: string;
  guesses: number;
  solved: boolean;
  grid: string | null;
  hardMode: boolean;
}

interface ExistingRow {
  guesses: number;
  solved: boolean;
  grid: string | null;
  hard_mode: boolean;
  message_ts: Date;
}

/**
 * Records one game. The most recent message wins (by message_ts); an older
 * message arriving late is ignored. Grid is preserved when the newer source
 * lacks it, and hard mode is only changed by the manual-text source (others do
 * not report it).
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
    const existing = rows[0];

    if (existing && r.messageTs < existing.message_ts) {
      await client.query('COMMIT');
      return 'stale';
    }

    const grid = r.grid ?? existing?.grid ?? null;
    // Only the share-text sources report hard mode; image/summary leave it as-is.
    const reportsHardMode = r.source === 'text' || r.source === 'scoredle';
    const hardMode = reportsHardMode ? r.hardMode : existing?.hard_mode ?? r.hardMode;

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
      [r.guildId, r.userId, r.puzzleNumber, r.puzzleDate, r.guesses, r.solved, grid, hardMode, r.source, r.messageTs, r.username, r.messageId],
    );

    await client.query('COMMIT');
    if (!existing) return 'inserted';
    return existing.guesses !== r.guesses || existing.solved !== r.solved ? 'updated' : 'unchanged';
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

export async function getUserResults(
  guildId: string,
  userId: string,
  from: string,
  to: string,
): Promise<UserResultRow[]> {
  const { rows } = await pool.query<UserResultRow>(
    `SELECT puzzle_number AS number, puzzle_date AS date, guesses, solved, grid, hard_mode AS "hardMode"
       FROM results
      WHERE guild_id = $1 AND user_id = $2 AND puzzle_date BETWEEN $3 AND $4
      ORDER BY puzzle_number ASC`,
    [guildId, userId, from, to],
  );
  return rows;
}
