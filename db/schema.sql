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
    PRIMARY KEY (guild_id, user_id, puzzle_number),

    -- Identifiers are non-empty (NOT NULL alone still permits ''). guild_id and
    -- message_id are Discord snowflakes (digits). user_id may be a synthetic
    -- "name:<label>" id for an unresolved summary participant, so it is only
    -- required to be present.
    CONSTRAINT results_guild_id_snowflake   CHECK (guild_id ~ '^[0-9]+$'),
    CONSTRAINT results_message_id_snowflake CHECK (message_id ~ '^[0-9]+$'),
    CONSTRAINT results_user_id_present      CHECK (char_length(user_id) > 0),
    CONSTRAINT results_username_present     CHECK (char_length(username) > 0),

    -- Every game state stores guesses in 1-6: win 1-6, failed 6, unfinished 1-5.
    CONSTRAINT results_guesses_range        CHECK (guesses BETWEEN 1 AND 6),
    CONSTRAINT results_puzzle_positive      CHECK (puzzle_number > 0),
    CONSTRAINT results_source_known
        CHECK (source IN ('summary', 'share-text', 'scoredle', 'activity')),

    -- puzzle_date is YYYY-MM-DD and is fully determined by puzzle_number: the
    -- Wordle calendar maps #1835 to 2026-06-28 (the anchor in numberToIso,
    -- src/domain/wordle.ts). Enforcing the mapping also forbids one puzzle ever
    -- carrying two different dates.
    CONSTRAINT results_date_format
        CHECK (puzzle_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
    CONSTRAINT results_date_matches_number
        CHECK (puzzle_date::date = DATE '2026-06-28' + (puzzle_number - 1835)),

    -- A stored grid is a JSON array with one row per guess, each five B/Y/G cells
    -- (see ingest.ts), or null when a source carries no grid. A solved grid ends
    -- on its all-green winning row; an unsolved grid (a failed game, or a partially
    -- played unfinished one) has a row per guess so far and never an all-green row.
    CONSTRAINT results_grid_shape
        CHECK (grid IS NULL OR grid ~ '^\["[BYG]{5}"(,"[BYG]{5}")*\]$'),
    CONSTRAINT results_grid_rows_match
        CHECK (grid IS NULL OR jsonb_array_length(grid::jsonb) = guesses),
    CONSTRAINT results_solved_grid_won
        CHECK (NOT solved OR grid IS NULL OR grid ~ '"GGGGG"\]$'),
    CONSTRAINT results_unsolved_grid_lost
        CHECK (solved OR grid IS NULL OR grid NOT LIKE '%GGGGG%')
);

CREATE INDEX results_guild_date_idx ON results (guild_id, puzzle_date);

-- One row per guild: the channel the bot reads Wordle results from in that
-- server. Set with /set-channel and read back on startup, so each guild resumes
-- tracking after a restart. A guild with no row is ignored entirely.
CREATE TABLE guild_settings (
    guild_id   text        NOT NULL,
    channel_id text        NOT NULL,
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (guild_id),

    -- Both are Discord snowflakes (digits).
    CONSTRAINT guild_settings_guild_id_snowflake   CHECK (guild_id ~ '^[0-9]+$'),
    CONSTRAINT guild_settings_channel_id_snowflake CHECK (channel_id ~ '^[0-9]+$')
);
