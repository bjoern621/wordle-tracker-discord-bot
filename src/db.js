import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

// One row per (server, player, puzzle) is the single source of truth for a game.
// `grid` holds the per-guess colour pattern (rows of B/Y/G) when a source
// provides it (manual text or per-game image); the daily summary has only the
// score, so grid is null there. Stats are computed from these rows, not stored.
db.exec(`
CREATE TABLE IF NOT EXISTS results (
  guild_id      TEXT    NOT NULL,
  user_id       TEXT    NOT NULL,
  puzzle_number INTEGER NOT NULL,
  puzzle_date   TEXT    NOT NULL,
  guesses       INTEGER NOT NULL,
  solved        INTEGER NOT NULL,
  grid          TEXT,
  hard_mode     INTEGER,
  source        TEXT    NOT NULL,
  source_ts     INTEGER NOT NULL,
  username      TEXT,
  message_id    TEXT,
  updated_at    TEXT    NOT NULL,
  PRIMARY KEY (guild_id, user_id, puzzle_number)
);
CREATE INDEX IF NOT EXISTS idx_results_date ON results (guild_id, puzzle_date);
`);

// Most recent message wins (by source_ts). Grid and hard mode are preserved when
// the newer source lacks them, so an override never discards colour detail.
const upsertStmt = db.prepare(`
INSERT INTO results
  (guild_id, user_id, puzzle_number, puzzle_date, guesses, solved, grid, hard_mode, source, source_ts, username, message_id, updated_at)
VALUES
  (@guild_id, @user_id, @puzzle_number, @puzzle_date, @guesses, @solved, @grid, @hard_mode, @source, @source_ts, @username, @message_id, @updated_at)
ON CONFLICT (guild_id, user_id, puzzle_number) DO UPDATE SET
  guesses    = excluded.guesses,
  solved     = excluded.solved,
  grid       = COALESCE(excluded.grid, results.grid),
  hard_mode  = COALESCE(excluded.hard_mode, results.hard_mode),
  source     = excluded.source,
  source_ts  = excluded.source_ts,
  username   = COALESCE(excluded.username, results.username),
  message_id = excluded.message_id,
  updated_at = excluded.updated_at
WHERE excluded.source_ts >= results.source_ts;
`);

const existingStmt = db.prepare(
  'SELECT guesses, solved, source_ts FROM results WHERE guild_id = ? AND user_id = ? AND puzzle_number = ?',
);

// Returns 'inserted' | 'updated' | 'unchanged' | 'stale'. 'updated' means an
// older record was replaced by a newer message that reports a different result.
export function recordResult(row) {
  const existing = existingStmt.get(row.guild_id, row.user_id, row.puzzle_number);
  if (existing && row.source_ts < existing.source_ts) return 'stale';
  upsertStmt.run(row);
  if (!existing) return 'inserted';
  return existing.guesses !== row.guesses || existing.solved !== (row.solved ? 1 : 0)
    ? 'updated'
    : 'unchanged';
}

const leaderboardStmt = db.prepare(`
SELECT user_id                                        AS userId,
       MAX(username)                                  AS username,
       COUNT(*)                                       AS games,
       SUM(solved)                                    AS wins,
       AVG(CASE WHEN solved THEN guesses ELSE 7 END)  AS avgScore,
       AVG(CASE WHEN solved THEN guesses END)         AS avgGuesses,
       MIN(CASE WHEN solved THEN guesses END)         AS best
FROM results
WHERE guild_id = ? AND puzzle_date BETWEEN ? AND ?
GROUP BY user_id
ORDER BY avgScore ASC, games DESC
`);

export function getLeaderboard(guildId, from, to) {
  return leaderboardStmt.all(guildId, from, to);
}

const userRowsStmt = db.prepare(`
SELECT puzzle_number AS number,
       puzzle_date   AS date,
       guesses,
       solved,
       grid,
       hard_mode     AS hardMode
FROM results
WHERE guild_id = ? AND user_id = ? AND puzzle_date BETWEEN ? AND ?
ORDER BY puzzle_number ASC
`);

export function getUserRows(guildId, userId, from, to) {
  return userRowsStmt.all(guildId, userId, from, to);
}
