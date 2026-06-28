// Aggregations computed in JS from a player's result rows.

export function summarize(rows) {
  const games = rows.length;
  const wins = rows.filter((r) => r.solved).length;
  const solvedGuesses = rows.filter((r) => r.solved).map((r) => r.guesses);
  const avgGuesses = solvedGuesses.length
    ? solvedGuesses.reduce((a, b) => a + b, 0) / solvedGuesses.length
    : null;
  const avgScore = games
    ? rows.reduce((a, r) => a + (r.solved ? r.guesses : 7), 0) / games
    : null;
  const distribution = [1, 2, 3, 4, 5, 6].map(
    (g) => rows.filter((r) => r.solved && r.guesses === g).length,
  );
  return {
    games,
    wins,
    fails: games - wins,
    winRate: games ? wins / games : 0,
    avgGuesses,
    avgScore,
    best: solvedGuesses.length ? Math.min(...solvedGuesses) : null,
    distribution,
    ...streaks(rows),
  };
}

// A streak is a run of consecutive puzzle numbers that were all solved. A miss
// or a fail breaks it. Current streak is the run ending at the latest solve.
function streaks(rows) {
  const solved = rows.filter((r) => r.solved).map((r) => r.number).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const n of solved) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = n;
  }
  let current = 0;
  if (solved.length) {
    const set = new Set(solved);
    let n = solved[solved.length - 1];
    while (set.has(n)) {
      current += 1;
      n -= 1;
    }
  }
  return { current, longest };
}

// Groups raw result rows into a leaderboard, ranked by average score (failed
// games count as 7), then by games played. Replaces SQL-side aggregation so the
// query layer stays database-agnostic.
export function aggregateLeaderboard(rows) {
  const byUser = new Map();
  for (const r of rows) {
    let u = byUser.get(r.userId);
    if (!u) {
      u = { userId: r.userId, username: r.username, games: 0, wins: 0, scoreSum: 0, guessSum: 0, best: null };
      byUser.set(r.userId, u);
    }
    if (r.username) u.username = r.username;
    u.games += 1;
    u.scoreSum += r.solved ? r.guesses : 7;
    if (r.solved) {
      u.wins += 1;
      u.guessSum += r.guesses;
      u.best = u.best == null ? r.guesses : Math.min(u.best, r.guesses);
    }
  }
  return [...byUser.values()]
    .map((u) => ({
      userId: u.userId,
      username: u.username,
      games: u.games,
      wins: u.wins,
      avgScore: u.games ? u.scoreSum / u.games : null,
      avgGuesses: u.wins ? u.guessSum / u.wins : null,
      best: u.best,
    }))
    .sort((a, b) => a.avgScore - b.avgScore || b.games - a.games);
}

export function headToHead(rows1, rows2) {
  const other = new Map(rows2.map((r) => [r.number, r]));
  let common = 0;
  let w1 = 0;
  let w2 = 0;
  let draw = 0;
  for (const r of rows1) {
    const o = other.get(r.number);
    if (!o) continue;
    common += 1;
    const s1 = r.solved ? r.guesses : 7;
    const s2 = o.solved ? o.guesses : 7;
    if (s1 < s2) w1 += 1;
    else if (s2 < s1) w2 += 1;
    else draw += 1;
  }
  return { common, w1, w2, draw };
}

export function histogram(distribution) {
  const max = Math.max(1, ...distribution);
  return distribution
    .map((count, i) => {
      const bar = '█'.repeat(Math.round((count / max) * 12)).padEnd(12, '░');
      return `${i + 1} ${bar} ${count}`;
    })
    .join('\n');
}

export const pct = (x) => `${Math.round(x * 100)}%`;
export const fixed = (x, d = 2) => (x == null ? '-' : x.toFixed(d));
