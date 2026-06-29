# Design

Decisions behind result tracking and statistics that are not obvious from the
code alone. Operator and setup instructions live in the [README](../README.md).

## One row per game

The `results` table holds one row per `(guild_id, user_id, puzzle_number)`. It is
the single source of truth for a game: puzzle number and date, guess count,
win/loss, the per-guess colour grid when a source provides one, hard-mode flag,
and the source and message timestamp used to resolve conflicts. Schema:
[db/schema.sql](../db/schema.sql).

Every statistic (averages, streaks, distributions, leaderboards, head-to-head) is
computed in JavaScript from these rows at read time. No aggregate is stored, so a
correction to a single row is reflected everywhere with no recomputation step.
The aggregations live in [src/stats/stats.ts](../src/stats/stats.ts).

## Game states

A game is in one of four states. Only the first three have a stored row.

| State                                   | Stored row | `guesses` / `solved` | Counts as a game | Average contribution | Streak       |
| --------------------------------------- | ---------- | -------------------- | ---------------- | -------------------- | ------------ |
| **Win**                                 | yes        | 1-6 / `true`         | yes              | the guess count      | extends      |
| **Failed** (6 guesses, no solve)        | yes        | `6` / `false`        | yes              | `FAIL_SCORE` (7)     | breaks       |
| **Unfinished** (in progress, abandoned) | yes        | `1-5` / `false`      | yes              | `FAIL_SCORE` (7)     | breaks       |
| **Not played**                          | no         | n/a                  | no               | none                 | breaks (gap) |

A **failed** game and an **unfinished** game both have `solved = false`, so both
score as `FAIL_SCORE` and both break the streak. They differ only in the stored
guess count. A failed game is a completed `X/6`, recorded as `guesses = 6`. An
unfinished game is a grid with fewer than six rows and no winning row, recorded
with the number of rows actually played (1-5); a sixth row would make the grid
terminal, which is the failed case, not the unfinished one. Because the game is
unsolved, that guess count never reaches an average or distribution. It scores
`FAIL_SCORE` like any loss, surfacing only as the rows drawn on the partial grid.

A **not played** day has no row at all. It is excluded from games, wins, and the
average. It is not a failure. The only place it surfaces is the weekly grid, which
renders an empty cell for display; that cell adds nothing to any total. A missing
puzzle still breaks a streak, because a streak requires consecutive solved puzzle
numbers and the gap ends the run.

### Unfinished game lifecycle

An unfinished game is recorded the moment its partial grid is seen, then corrected
if the player returns to finish it. The correction relies on conflict resolution
below: the Activity edits its own message as the player guesses, and each edit
re-ingests with a newer timestamp, so the finished state overrides the stored
failure.

```
guess 3, abandoned     finish on guess 5        (player never returns)
        │                       │                        │
        ▼                       ▼                        ▼
  store 3/false           edit re-ingests          row stays 3/false
  (counts as fail)        store 5/true             (correct: it was a loss)
                          (overrides fail)
```

If a finishing edit is missed (bot offline, dropped gateway event), the next-day
summary carries the real score and overrides the failure the same way. The
partial grid is dropped on store (`grid = null`) so it can never be borrowed onto
a row a later summary marks solved. See
[src/parsers/activity-image.parser.ts](../src/parsers/activity-image.parser.ts).

## Score

**Average score** is the only average reported. Each game scores its guess
count, or `FAIL_SCORE` (7, one worse than a 6/6) for a loss, so losses are
penalised rather than ignored. This is the leaderboard ranking key, lower is
better.

The per-game scoring rule lives in exactly one function, `penaltyScore` in
[src/stats/stats.ts](../src/stats/stats.ts), so every average, ranking, and
head-to-head comparison scores a game the same way. `FAIL_SCORE` is defined in
[src/constants.ts](../src/constants.ts).

## Streaks

A streak is a run of consecutive puzzle numbers that were all solved. Anything
that is not a solve ends the run: a failed game, an unfinished game, or a day with
no row at all. The current streak is the run ending at the most recent solve; the
longest is the best run over the period. See `streaks` in
[src/stats/stats.ts](../src/stats/stats.ts).

## Conflict resolution

Results never double-count, because the key is `(guild, user, puzzle)` and an
incoming game for an existing key is merged rather than appended. The rule: the
**most recent message wins**, by message timestamp (`editedAt ?? createdAt`). This
makes ingestion order irrelevant, so `/backfill` walking history newest-to-oldest
cannot corrupt data.

One exception: an older message that carries a grid can still backfill the grid
onto a row that has none, without changing that row's score or source. This keeps
colour detail from a same-day Activity image when the next-day summary (no grid)
was stored first during backfill. The full decision is in
[src/db/results-merge.ts](../src/db/results-merge.ts).

## Period scoping

Every command and the scheduled posts compute their figures over a single chosen
period. The period maps to an inclusive `[from, to]` date range
(`periodRange`), and every query filters `puzzle_date BETWEEN from AND to`. The
averages are derived only from the rows in that range, with no lifetime totals
mixed in. All-time is the same path with an unbounded range. See
[src/domain/wordle.ts](../src/domain/wordle.ts) and
[src/db/results.repository.ts](../src/db/results.repository.ts).
