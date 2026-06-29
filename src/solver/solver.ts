// A small Wordle solver used by /share for the words-left and next-guess
// overlays. It works on the bundled solution list (assets/words/wordle-solutions.txt)
// and needs the actual guessed words, which only a pasted /status reveals; the
// colour grid alone cannot say which words remain.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** One played guess: the word and the B/Y/G colours it scored. */
export interface GuessRow {
  word: string;
  pattern: string;
}

/**
 * The B/Y/G pattern `guess` scores against `answer`, with the standard two-pass
 * duplicate handling: greens are claimed first, then yellows consume the answer's
 * remaining letters, so a repeated guess letter goes grey once the answer's copies
 * are used up. Both words are five lowercase a-z letters.
 */
export function score(guess: string, answer: string): string {
  const out = ['B', 'B', 'B', 'B', 'B'];
  const counts = new Array(26).fill(0);
  for (let i = 0; i < 5; i += 1) counts[answer.charCodeAt(i) - 97] += 1;
  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === answer[i]) {
      out[i] = 'G';
      counts[guess.charCodeAt(i) - 97] -= 1;
    }
  }
  for (let i = 0; i < 5; i += 1) {
    if (out[i] === 'G') continue;
    const idx = guess.charCodeAt(i) - 97;
    if (counts[idx] > 0) {
      out[i] = 'Y';
      counts[idx] -= 1;
    }
  }
  return out.join('');
}

/**
 * Progressive candidate sets: element i is `pool` filtered to the words that would
 * have produced every colour row up to and including row i. The last element is the
 * fully narrowed set. An empty `rows` yields an empty array.
 */
export function narrow(rows: readonly GuessRow[], pool: readonly string[]): string[][] {
  const sets: string[][] = [];
  let current: string[] = pool.slice();
  for (const row of rows) {
    current = current.filter((c) => score(row.word, c) === row.pattern);
    sets.push(current);
  }
  return sets;
}

/** The candidate answers consistent with every row. */
export function remainingAfter(rows: readonly GuessRow[], pool: readonly string[]): string[] {
  const sets = narrow(rows, pool);
  return sets.length ? sets[sets.length - 1] : pool.slice();
}

/**
 * The candidate that best splits the remaining set: the one whose colour-pattern
 * buckets are smallest on average (minimising the sum of squared bucket sizes, the
 * expected remaining count). The guess pool is the candidate set itself, a greedy
 * choice that is cheap and, after the opening rows, near-optimal. Returns the lone
 * candidate when one remains and null when none do. Deterministic: ties resolve to
 * the alphabetically first word, since the pool is sorted and filtering keeps order.
 */
export function bestNextGuess(candidates: readonly string[]): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let best: string | null = null;
  let bestScore = Infinity;
  for (const guess of candidates) {
    const buckets = new Map<string, number>();
    for (const answer of candidates) {
      const p = score(guess, answer);
      buckets.set(p, (buckets.get(p) ?? 0) + 1);
    }
    let sum = 0;
    for (const n of buckets.values()) sum += n * n;
    if (sum < bestScore) {
      bestScore = sum;
      best = guess;
    }
  }
  return best;
}

const WORDS_PATH = fileURLToPath(new URL('../../assets/words/wordle-solutions.txt', import.meta.url));
let cached: readonly string[] | null = null;

/** The bundled Wordle answer list (lowercase, sorted), loaded and cached once. */
export function answers(): readonly string[] {
  if (!cached) {
    const list = readFileSync(WORDS_PATH, 'utf8')
      .split('\n')
      .map((w) => w.trim())
      .filter((w) => w.length === 5);
    if (!list.length) throw new Error(`Answer word list is empty or missing at ${WORDS_PATH}`);
    cached = list;
  }
  return cached;
}
