# Design

Decisions behind result tracking and statistics that are not obvious from the
code alone. Operator and setup instructions live in the [README](../README.md).

## One row per game

The `results` table holds one row per `(guild_id, user_id, puzzle_number)`, the
single source of truth for a game: puzzle number and date, guess count, win/loss,
hard-mode flag, and the source and message timestamp used to resolve conflicts.
Three fields are filled only when a source carries them: the per-guess colour grid
(manual share text or a per-game image), and the guessed words and answer (a
pasted `/status`). Schema: [db/schema.sql](../db/schema.sql).

Every statistic (averages, streaks, distributions, leaderboards, head-to-head) is
computed from these rows at read time. Nothing is aggregated and stored, so
correcting one row corrects every figure with no rebuild step. The aggregations
live in [src/stats/stats.ts](../src/stats/stats.ts).

## Game states

A game is in one of four states. Only the first three have a stored row.

| State                                   | Stored row | `guesses` / `solved` | Counts as a game | Average contribution | Streak       |
| --------------------------------------- | ---------- | -------------------- | ---------------- | -------------------- | ------------ |
| **Win**                                 | yes        | 1-6 / `true`         | yes              | the guess count      | extends      |
| **Failed** (6 guesses, no solve)        | yes        | `6` / `false`        | yes              | `FAIL_SCORE` (7)     | breaks       |
| **Unfinished** (in progress, abandoned) | yes        | `1-5` / `false`      | yes              | `FAIL_SCORE` (7)     | breaks       |
| **Not played**                          | no         | n/a                  | no               | none                 | breaks (gap) |

A **failed** and an **unfinished** game both have `solved = false`, so both score
`FAIL_SCORE` and break the streak. They differ only in stored guess count. A failed
game is a completed `X/6`, stored as `guesses = 6`. An unfinished game is a partial
grid with no winning row, stored with the rows actually played (1-5). A sixth row
would make the grid terminal, i.e. the failed case. Either way the count is a loss:
it never reaches an average or distribution, surfacing only as the rows on the
partial grid.

A **not played** day has no row at all. It counts toward nothing (games, wins,
average) and is not a failure, but its gap still breaks a streak, which requires
consecutive solved puzzle numbers. Its one appearance is an empty cell on the
weekly grid, which adds to no total.

### Unfinished game lifecycle

An unfinished game is stored the moment its partial grid is seen (one row per guess
so far, no winning row), then corrected if the player returns to finish it. The
correction rides on conflict resolution below: the Activity edits its own message as
the player guesses, and each edit re-ingests with a newer timestamp, so the finished
state and its complete grid override the stored failure.

```
guess 3, abandoned     finish on guess 5        (player never returns)
        │                       │                        │
        ▼                       ▼                        ▼
  store 3/false           edit re-ingests          row stays 3/false
  (3-row partial grid)    store 5/true             (correct: it was a loss)
                          (5-row grid replaces it)
```

If the finishing edit is missed (bot offline, dropped gateway event), the next-day
summary corrects the score the same way. The summary has no grid, so the stale
partial grid is dropped rather than left on the corrected row. A grid only ever
carries from one message onto another when both describe the same outcome (same
guess count and win/loss), so a partial can never land on a row a later message
marks solved. See
[src/parsers/activity-image.parser.ts](../src/parsers/activity-image.parser.ts) and
[src/db/results-merge.ts](../src/db/results-merge.ts).

## Score

**Average score** is the only average reported, and the leaderboard ranking key
(lower is better). Each game scores its guess count, or `FAIL_SCORE` (7, one worse
than a 6/6) for a loss, so losses are penalised rather than ignored. The rule lives
in one function, `penaltyScore` in [src/stats/stats.ts](../src/stats/stats.ts), so
every average, ranking, and head-to-head comparison scores a game the same way.
`FAIL_SCORE` is in [src/constants.ts](../src/constants.ts).

## Play time

A game can carry how long it took to play: `first_guess_at` and `last_guess_at`, the
span from the first to the last guess seen. Only the Activity reveals it. It posts on
the first guess and edits on each later one, so the message's creation time is the
first guess and its latest edit the last. Every other source leaves both columns null.

`last_guess_at` is the latest edit, never the present, so an abandoned game has a
fixed duration up to the guess where the player stopped, not a clock that keeps
running. The schema enforces this: the two columns are set or cleared together, and
`last_guess_at >= first_guess_at`. Timing rides with the grid those guesses produced,
kept while that grid is kept, advanced when an edit re-shares a later grid, dropped
when a corrected outcome drops the grid. So a game finished off-Activity (corrected by
the next-day summary) never keeps the abandoned attempt's duration. The merge rule is
in [src/db/results-merge.ts](../src/db/results-merge.ts).

`/stats` reports average and fastest solve time over the solved, timed games. An
unfinished game keeps its bounded duration but is excluded here: a loss measures an
abandoned attempt, not a solve. See `solveTimes` in
[src/stats/stats.ts](../src/stats/stats.ts).

## Streaks

A streak is a run of consecutive puzzle numbers that were all solved. Anything
that is not a solve ends the run: a failed game, an unfinished game, or a day with
no row at all. The current streak is the run ending at the most recent solve; the
longest is the best run over the period. See `streaks` in
[src/stats/stats.ts](../src/stats/stats.ts).

## Conflict resolution

Results never double-count: the key is `(guild, user, puzzle)`, and an incoming game
for an existing key is merged, not appended. The rule is **most recent message
wins**, by message timestamp (`editedAt ?? createdAt`). Ingestion order is therefore
irrelevant, so `/backfill` walking history newest-to-oldest cannot corrupt data.

The winner fixes the outcome and provenance, but any message can fill a field the
row is still missing. An older message that carries a grid (and, with it, the words
and answer) backfills onto a row that has none, when both describe the same outcome,
without touching its score or source. This recovers the colour grid from a same-day
Activity image after the gridless next-day summary was stored first during backfill,
while keeping a partial grid off a row a later message marks solved. The full
decision is in [src/db/results-merge.ts](../src/db/results-merge.ts).

## Period scoping

Every command, and the weekly leaderboard post, computes its figures over a single
chosen period. The period maps to an inclusive `[from, to]` date range
(`periodRange`), and every query filters `puzzle_date BETWEEN from AND to`. Averages
come only from rows in that range, with no lifetime totals mixed in. All-time is the
same path with an unbounded range. See
[src/domain/wordle.ts](../src/domain/wordle.ts) and
[src/db/results.repository.ts](../src/db/results.repository.ts).
