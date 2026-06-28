-- Desired-state schema. pgschema diffs this against the live database and
-- applies the difference (declarative; no hand-written migrations).
--
-- One row per (server, player, puzzle): the single source of truth for a game.
-- `grid` holds the per-guess colour pattern (rows of B/Y/G) when a source
-- provides it (manual text or per-game image); the daily summary has only the
-- score, so grid is the one nullable column. Stats are computed from these rows.

CREATE TABLE results (
    guild_id      text        NOT NULL,
    user_id       text        NOT NULL,
    puzzle_number integer     NOT NULL,
    puzzle_date   text        NOT NULL,
    guesses       integer     NOT NULL,
    solved        boolean     NOT NULL,
    grid          text,
    hard_mode     boolean     NOT NULL,
    source        text        NOT NULL,
    message_ts    timestamptz NOT NULL,
    username      text        NOT NULL,
    message_id    text        NOT NULL,
    updated_at    timestamptz NOT NULL,
    PRIMARY KEY (guild_id, user_id, puzzle_number)
);

CREATE INDEX results_guild_date_idx ON results (guild_id, puzzle_date);
