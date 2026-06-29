# Wordle Tracker Discord Bot

Tracks Wordle results in a Discord server and builds leaderboards (all-time,
monthly, weekly), per-player stats, and head-to-head comparisons. Self-hosted,
works across every server it is invited to, PostgreSQL storage (schema via
pgschema, queries via node-postgres).

Each server picks the channel to track with `/set-channel` (admin only). The
choice is stored per server, so the bot resumes tracking after a restart. A
server with no channel set is ignored.

The design decisions behind result tracking and statistics (game states, how
averages and streaks are computed, conflict resolution) are documented in
[docs/DESIGN.md](docs/DESIGN.md).

## How results are captured

Five message sources, each recognized by its author and format. Ingest tries
them in priority order and stops at the first match, preferring the richer ones:

1. **Pasted `/status` text.** A player's `/status` reply from the official Wordle
   app, pasted into the channel. The only source carrying the guessed words and
   the answer, not just the colour grid.
2. **Daily summary** (primary). The Activity's once-a-day post of every player's
   score for the previous day (`4/6: <@id> …`), with a preview image packing one
   grid per player. The puzzle date is the day before the post, in `TIMEZONE`;
   plain `@nickname` players resolve against the member list and `PLAYER_ALIASES`.
3. **Manual share text.** A pasted `Wordle 1,835 4/6` plus the emoji grid
   (`X/6` fails, `*` hard mode).
4. **Scoredle share text.** The third-party Scoredle game's post; its puzzle
   number comes from the message timestamp.
5. **Per-game image** (optional, same-day). The Activity's solo "X was playing"
   grid, read by sampling the image (no OCR). Multi-player images are skipped.
   Toggle with `ENABLE_ACTIVITY_IMAGE`.

## Storage

PostgreSQL. The schema is declared as desired-state SQL in
[db/schema.sql](db/schema.sql) and applied by [pgschema](https://www.pgschema.com),
which diffs it against the live database and applies the difference (a one-shot
`migrate` service that runs before the bot). Queries use node-postgres directly.
Postgres runs as its own container with a named volume, so data persists across
restarts.

One row per (server, player, puzzle) is the single source of truth for a game.
It holds the puzzle number, win/loss, guess count, and the per-guess colour grid
(rows of B/Y/G) when a source provides it. The daily summary carries only the
score, so summary-only days have no grid. All stats (averages, streaks,
distributions, leaderboards) are computed from these rows, not stored.

Results never double-count: on conflict the **most recent message wins** (by
message timestamp, so backfill order cannot corrupt data). An override preserves
the grid and hard-mode flag when the newer message lacks them, so colour detail
is never lost.

History is recovered by scanning past messages (`/backfill` or
`BACKFILL_ON_START`); the daily summaries make this a complete day-by-day record
(scores) as far back as the channel goes. Grid colours only exist going forward
for games seen via share text or the per-game image.

## Setup

### 1. Create the Discord application and bot

1. https://discord.com/developers/applications -> **New Application**.
2. **Bot** tab -> **Reset Token**, copy it into `.env` as `DISCORD_TOKEN`.
3. **Bot** tab -> **Privileged Gateway Intents** -> enable **MESSAGE CONTENT
   INTENT** and **SERVER MEMBERS INTENT** -> Save. (Members is used to resolve
   the plain `@nickname` players in daily summaries.)
4. **OAuth2 -> URL Generator** -> scopes **bot** + **applications.commands** ->
   select the permissions in the table below. Open the URL and add the bot to the
   server.

The bot needs these permissions in the tracked channel:

| Permission | Why |
| --- | --- |
| View Channels | Read the tracked channel. |
| Read Message History | Ingest past messages on backfill. |
| Send Messages | Post command replies and the weekly leaderboard. |
| Embed Links | Render embeds in command replies. |
| Attach Files | Post the rendered image cards (leaderboard, stats, share). |
| Manage Messages | Delete a pasted `/status` after recording it, so it does not spoil the answer. |

Two privileged gateway intents are enabled separately on the **Bot** tab (step 3):
**Message Content** to read message text, and **Server Members** to resolve plain
`@nickname` players in daily summaries.

### 2. Configure

```sh
task setup
```
Fill in every variable in `.env` (see the configuration reference below). The
bot validates them all at startup and exits with the list of problems if any is
missing or malformed, so there is nothing optional to skip. The channel to track
is not configured here: run `/set-channel` in each server after the bot starts.
To import that channel's existing history on first run, set
`BACKFILL_ON_START=true` (it scans every server that has a channel set).

### 3. Run

Three separate services: `db` (Postgres), `migrate` (pgschema, applies the schema
once and exits), and `bot`. Compose starts them in order: Postgres becomes
healthy, the schema is applied, then the bot starts.

```sh
task up        # starts db, runs migrate, starts bot
task logs
```

The phases are also separate tasks: `task db` starts only Postgres and
`task migrate` applies the schema. The Postgres data lives in the `pgdata` volume
and survives `task down`; `task reset` wipes the volume and starts fresh. After
editing `db/schema.sql`, re-run `task migrate` to converge the database; it is a
no-op when already in sync.

## Task runner

Common operations are wrapped in [Taskfile.yml](Taskfile.yml); the `task` binary
is in the Nix dev shell. Run `task --list` for the full set.

| Task | Description |
| --- | --- |
| `task test` | Run the unit tests (parsers, grid reader, stats, date math). |
| `task up` | Build and start everything (db, migrate, bot). |
| `task down` | Stop containers (keeps the database volume). |
| `task logs` | Follow the bot logs. |
| `task migrate` | Apply `db/schema.sql` (pgschema). |
| `task plan` | Show pending schema changes without applying. |
| `task logger` | Run the Phase 0 logger. |
| `task reset` | Wipe the database volume and restart (destructive). |

## Slash commands

| Command | Description |
| --- | --- |
| `/leaderboard [period] [from] [to]` | Player ranking. Short spans render a day-by-day grid; longer spans an aggregate card. |
| `/history [user]` | A player's results for one month, day-by-day, with month navigation. |
| `/stats [user] [period] [from] [to]` | Games, win rate, averages, streaks, distribution, solve time. |
| `/compare <user1> [user2] [period] [from] [to]` | Head-to-head over shared puzzles. |
| `/share [user] [puzzle] [format] …` | Re-post a game as an image card or the emoji block, with optional overlays (words, answer, opener, time). |
| `/backfill [limit] [all]` | Re-scan the tracked channel's history (admin only). |
| `/set-channel [channel]` | Choose the channel to track in this server (admin only). |

`period` selects a preset range (all time, this year, this month, this week,
last week, today; default all time); `from`/`to` (`YYYY-MM-DD`) override it with
a custom range.

Scoring: a solved game scores its number of guesses; a failed game scores 7.
Lower average is better.

## Weekly report

Every Monday at 00:05 in the group timezone (`TIMEZONE`), the bot posts last
week's leaderboard to each server's tracked channel: the day-by-day grid for the
Monday-Sunday week that just ended, the same view a 7-day `/leaderboard`
produces. Servers where nobody played that week are skipped.

## Inspecting the database

A Nix flake provides a dev shell with the `dbeaver-bin` GUI for browsing the
PostgreSQL database. Flakes only see git-tracked files, so add the flake first:

```sh
git add flake.nix flake.lock .envrc
direnv allow                 # once; loads the flake via .envrc (use flake)

task db                      # if not already running
dbeaver                      # GUI; connect to $DATABASE_URL
```

`$DATABASE_URL` is set by the shell to `localhost:$POSTGRES_PORT`. Without
direnv, run `nix develop` for the same environment.

## Diagnostics

The Phase 0 logger that dumps raw messages/embeds is still available for
inspecting new formats:

```sh
task logger
```

With `SAVE_IMAGES=true`, every image the Activity posts is downloaded and sorted
by message kind into `data/images/<category>/`, each file prefixed with the
puzzle number it belongs to:

| Category | Source message | Image |
| --- | --- | --- |
| `summary` | "here are yesterday's results" | The day-summary board: every player's grid for one day. |
| `solo` | "X was playing" | One player's grid. |
| `multi` | "X and N others were playing" | The combined grid for several players. |
| `other` | Any non-Activity author | Whatever that message attached (only when no author filter is set). |

This keeps a replayable corpus after the Discord CDN URLs expire. A captured
`summary` or `multi` board can be copied straight into `test/fixtures/images/`
to back a parser test, the same way the `solo` grids back the existing ones.

## Configuration reference

All variables must be set, except `PLAYER_ALIASES`, which may be left empty. The
bot validates them at startup and exits listing any that are missing or
malformed; there are no defaults or fallbacks.

| Variable | Example | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | (secret) | Bot token from the Developer Portal. |
| `DATABASE_URL` | `postgresql://wordle:wordle@localhost:5432/wordle` | Postgres connection string. Compose points it at the `db` service. |
| `TIMEZONE` | `Europe/Berlin` | Group timezone for resolving the daily summary's "yesterday". |
| `PLAYER_ALIASES` | `Tim=792…,Björn=386…` | `Name=id,…` overrides for unresolved plain-text players. May be empty. |
| `ENABLE_ACTIVITY_IMAGE` | `true` | Parse the per-game grid image for same-day results. |
| `BACKFILL_ON_START` | `false` | Scan history once on startup. |
| `BACKFILL_LIMIT` | `5000` | Messages scanned per backfill. |

The Postgres container and the logger task read their own variables, separate
from the bot's config: `POSTGRES_PASSWORD`, `POSTGRES_PORT` (compose), and
`SAVE_IMAGES` (logger task).
