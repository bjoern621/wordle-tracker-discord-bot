// Builds the view both /share renderers draw from: a colour grid plus the
// overlays the player turned on (guessed words, words-left, next guess, answer,
// opener strength, duration, hard-mode badge). The solver-backed and letter-based
// overlays need a /status paste; when the game has no letters they are dropped and
// a note explains why. Keeping this assembly in one place means the image and the
// text format always show the same thing.

import type { UserResultRow } from '../db/results.repository.js';
import { parseStoredGrid } from '../domain/hard-mode.js';
import { duration } from '../stats/format.js';
import { answers, narrow, bestNextGuess, type GuessRow } from '../solver/solver.js';

/** Which overlays a /share invocation asked for. */
export interface ShareOptions {
  format: 'image' | 'text';
  words: boolean;
  wordsLeft: boolean;
  nextGuess: boolean;
  answer: boolean;
  opener: boolean;
  time: boolean;
  hardMode: boolean;
  spoiler: boolean;
}

/** One grid row plus the per-row overlays, when requested and available. */
export interface ShareRow {
  pattern: string;
  /** Uppercase guessed word, or null when not shown. */
  word: string | null;
  /** Candidate answers left after this row, or null when not shown. */
  wordsLeft: number | null;
}

/** Everything a renderer needs; nulls and an empty `rows` are drawn as absent. */
export interface ShareView {
  numberLabel: string; // "1,835"
  score: string; // "4/6" or "X/6"
  solved: boolean;
  playerName: string;
  rows: ShareRow[];
  /** Show the hard-mode badge. */
  hardMode: boolean;
  /** Uppercase suggested next guess, or null. */
  nextGuess: string | null;
  /** Uppercase answer, or null. */
  answer: string | null;
  /** Greens+yellows the first guess landed (0-5), or null. */
  opener: number | null;
  /** Compact duration label ("2m 5s"), or null. */
  time: string | null;
  /** Reasons a requested overlay could not be shown. */
  notes: string[];
  spoiler: boolean;
}

function parseWords(words: string | null): string[] | null {
  if (!words) return null;
  try {
    const value = JSON.parse(words);
    if (Array.isArray(value) && value.every((w) => typeof w === 'string')) return value;
  } catch {
    /* not a stored word list */
  }
  return null;
}

export function buildShareView(row: UserResultRow, playerName: string, opts: ShareOptions): ShareView {
  const grid = parseStoredGrid(row.grid);
  const words = parseWords(row.words);
  const answer = row.answer;
  // The letters are revealed together (a /status fills words and answer over the
  // grid), so all the letter-based overlays stand or fall as one.
  const hasLetters = grid != null && words != null && answer != null && words.length === grid.length;

  const notes: string[] = [];
  if (!grid) {
    notes.push('Recorded from the daily summary, which carries only the score, so there is no grid to show.');
  }

  const wantsLetters = opts.words || opts.wordsLeft || opts.nextGuess || opts.answer;
  if (wantsLetters && grid && !hasLetters) {
    notes.push('Guessed words and the answer are only known when the game was shared via /status.');
  }

  // Progressive candidate sets, computed once and reused for both the per-row
  // counts and the next-guess pick. Include the real answer in the pool so the
  // counts never drop it, even if it is absent from the bundled list.
  let candidateSets: string[][] | null = null;
  if (hasLetters && (opts.wordsLeft || opts.nextGuess)) {
    const pool = answers();
    const withAnswer = pool.includes(answer!) ? pool : [...pool, answer!];
    const guessRows: GuessRow[] = grid!.map((pattern, i) => ({ word: words![i], pattern }));
    candidateSets = narrow(guessRows, withAnswer);
  }

  const rows: ShareRow[] = (grid ?? []).map((pattern, i) => ({
    pattern,
    word: opts.words && hasLetters ? words![i].toUpperCase() : null,
    wordsLeft: opts.wordsLeft && candidateSets ? candidateSets[i].length : null,
  }));

  let nextGuess: string | null = null;
  if (opts.nextGuess && candidateSets) {
    // For a solve, suggest what to play on the winning turn (the set before the
    // last row); for a loss or unfinished game, what to try next (after the last).
    const idx = row.solved ? candidateSets.length - 2 : candidateSets.length - 1;
    const best = idx >= 0 ? bestNextGuess(candidateSets[idx]) : null;
    nextGuess = best ? best.toUpperCase() : null;
  }

  let opener: number | null = null;
  if (opts.opener && grid?.[0]) {
    opener = [...grid[0]].filter((c) => c === 'G' || c === 'Y').length;
  }

  let time: string | null = null;
  if (opts.time) {
    if (row.durationSeconds != null) time = duration(row.durationSeconds);
    else notes.push('No timing was recorded for this game.');
  }

  return {
    numberLabel: new Intl.NumberFormat('en-US').format(row.number),
    score: row.solved ? `${row.guesses}/6` : 'X/6',
    solved: row.solved,
    playerName,
    rows,
    hardMode: opts.hardMode && row.hardMode === true,
    nextGuess,
    answer: opts.answer && answer ? answer.toUpperCase() : null,
    opener,
    time,
    notes,
    spoiler: opts.spoiler,
  };
}
