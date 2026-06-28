# Wordle Tracker Discord Bot

Tracks Wordle results in a Discord server and builds leaderboards (all-time,
monthly, weekly), per-player stats, and head-to-head comparisons. Self-hosted,
single server, SQLite storage.

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
cp .env.example .env
```
Set `DISCORD_TOKEN`, and `WORDLE_CHANNEL_ID` to the Wordle channel (enable
Developer Mode, right-click the channel -> Copy Channel ID). To import existing
history on first run, set `BACKFILL_ON_START=true`.

### 3. Run

```sh
docker compose up -d --build bot
docker compose logs -f bot
```

## Commands

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

A Nix flake provides a dev shell with tools to browse the SQLite database.
Flakes only see git-tracked files, so add the flake first:

```sh
git add flake.nix flake.lock .envrc
direnv allow                 # once; loads the flake via .envrc (use flake)
sqlitebrowser "$WORDLE_DB"   # GUI
litecli "$WORDLE_DB"         # REPL, or: sqlite3 "$WORDLE_DB"
```

Without direnv, run `nix develop` to get the same environment.

The bot container runs as root, so `data/wordle.db` is root-owned. Open it
read-only, or take ownership for full access:

```sh
sudo chown -R "$USER" data
```

## Diagnostics

The Phase 0 logger that dumps raw messages/embeds is still available for
inspecting new formats:

```sh
docker compose up logger
```

## Configuration reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | (required) | Bot token. |
| `WORDLE_CHANNEL_ID` | (any channel) | Restrict tracking to one channel. |
| `TIMEZONE` | `Europe/Berlin` | Group timezone for resolving the daily summary's "yesterday". |
| `PLAYER_ALIASES` | (empty) | `Name=id,...` overrides for unresolved plain-text players. |
| `ENABLE_ACTIVITY_IMAGE` | `true` | Parse the per-game grid image for same-day results. |
| `DB_PATH` | `data/wordle.db` | SQLite file location. |
| `CONFIRM_REACTION` | `✅` | Reaction added when a result is captured. Empty to disable. |
| `BACKFILL_ON_START` | `false` | Scan history once on startup. |
| `BACKFILL_LIMIT` | `5000` | Messages scanned per backfill. |
