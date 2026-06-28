# Wordle Tracker Discord Bot

Tracks Wordle results in a Discord server and builds leaderboards (all-time,
monthly, weekly), per-player stats, and head-to-head comparisons. Self-hosted,
single server, PostgreSQL storage (schema via pgschema, queries via node-postgres).

## How results are captured

The bot reads three sources, in priority order:

1. **Daily summary** (primary). Once a day the official Activity posts one
   message with every player's score for the previous day:
   `👑 4/6: <@id> <@id>` / `5/6: ...` / `X/6: ...`. The puzzle date is the day
   before the message, resolved in the group timezone (`TIMEZONE`). Players are
   `<@id>` mentions or plain `@nickname` text; nicknames are matched against the
   guild member list and `PLAYER_ALIASES`.
2. **Manual share text.** A player pastes `Wordle 1,835 4/6` (handles `.`/`,`
   separators, `X/6` fails, `*` hard mode).
3. **Per-game image** (optional, same-day). The Activity's solo "X was playing"
   message; the player comes from `interactionMetadata.user`, the puzzle number
   from the message date, and guesses and win/loss from sampling the grid image
   (no OCR). Multi-player messages are skipped (ambiguous image). Toggle with
   `ENABLE_ACTIVITY_IMAGE`.

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
is never lost. When a newer message changes a stored result, the bot marks it
with `OVERRIDE_REACTION` instead of the normal capture reaction.

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
   permissions: View Channels, Read Message History, Send Messages, Embed Links,
   Attach Files, Add Reactions. Open the URL and add the bot to the server.

### 2. Configure

```sh
task setup
```
Fill in every variable in `.env` (see the configuration reference below). The
bot validates them all at startup and exits with the list of problems if any is
missing or malformed, so there is nothing optional to skip. `WORDLE_CHANNEL_ID`
must be a channel inside `GUILD_ID` (enable Developer Mode, right-click the
channel -> Copy Channel ID). To import existing history on first run, set
`BACKFILL_ON_START=true`.

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
| `/leaderboard [period]` | Ranking by average score. Period: all / month / week. |
| `/stats [user] [period]` | Games, win rate, averages, streaks, distribution. |
| `/distribution [user]` | Guess distribution histogram. |
| `/compare <user1> [user2]` | Head-to-head over shared puzzles. |
| `/backfill [limit]` | Re-scan channel history (admin only). |

Scoring: a solved game scores its number of guesses; a failed game scores 7.
Lower average is better.

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

## Configuration reference

All variables must be set, except `PLAYER_ALIASES`, which may be left empty. The
bot validates them at startup and exits listing any that are missing or
malformed; there are no defaults or fallbacks.

| Variable | Example | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | (secret) | Bot token from the Developer Portal. |
| `DATABASE_URL` | `postgresql://wordle:wordle@localhost:5432/wordle` | Postgres connection string. Compose points it at the `db` service. |
| `GUILD_ID` | `123…` | The single server the bot operates in. |
| `WORDLE_CHANNEL_ID` | `123…` | The single channel to track; must belong to `GUILD_ID`. |
| `TIMEZONE` | `Europe/Berlin` | Group timezone for resolving the daily summary's "yesterday". |
| `PLAYER_ALIASES` | `Tim=792…,Björn=386…` | `Name=id,…` overrides for unresolved plain-text players. May be empty. |
| `ENABLE_ACTIVITY_IMAGE` | `true` | Parse the per-game grid image for same-day results. |
| `CONFIRM_REACTION` | `✅` | Reaction added when a result is captured. |
| `OVERRIDE_REACTION` | `🔁` | Reaction when a newer message corrects a stored result. |
| `BACKFILL_ON_START` | `false` | Scan history once on startup. |
| `BACKFILL_LIMIT` | `5000` | Messages scanned per backfill. |

The Postgres container and the logger task read their own variables, separate
from the bot's config: `POSTGRES_PASSWORD`, `POSTGRES_PORT` (compose), and
`SAVE_IMAGES` (logger task).
