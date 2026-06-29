// The share view model and the text formatter: overlays render when the letters
// are present, and a colour-only game falls back to a note instead of crashing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UserResultRow } from '../src/db/results.repository.js';
import { score } from '../src/solver/solver.js';
import { buildShareView, type ShareOptions } from '../src/share/share-model.js';
import { buildShareText } from '../src/share/share-text.js';

const OFF: ShareOptions = {
  format: 'text',
  words: false,
  wordsLeft: false,
  nextGuess: false,
  answer: false,
  opener: false,
  time: false,
  hardMode: true,
  spoiler: false,
};

// A solved game with the full letters a /status reveals. The grid is generated
// from score() so the colours match the words and answer exactly.
const ANSWER = 'faith';
const WORDS = ['crane', 'plumb', 'daisy', 'faith'];

function statusRow(over: Partial<UserResultRow> = {}): UserResultRow {
  return {
    number: 1835,
    date: '2026-06-28',
    guesses: 4,
    solved: true,
    grid: JSON.stringify(WORDS.map((w) => score(w, ANSWER))),
    words: JSON.stringify(WORDS),
    answer: ANSWER,
    hardMode: false,
    durationSeconds: 125,
    source: 'status',
    ...over,
  };
}

// A colour-only game (an Activity image): grid but no letters.
function imageRow(over: Partial<UserResultRow> = {}): UserResultRow {
  return {
    number: 1835,
    date: '2026-06-28',
    guesses: 4,
    solved: true,
    grid: JSON.stringify(['BYGBB', 'BBBBB', 'BBBBB', 'GGGGG']),
    words: null,
    answer: null,
    hardMode: null,
    durationSeconds: null,
    source: 'activity',
    ...over,
  };
}

test('header carries the comma-formatted number and the score', () => {
  const view = buildShareView(statusRow(), 'Sara', OFF);
  assert.equal(view.numberLabel, '1,835');
  assert.equal(view.score, '4/6');
  assert.match(buildShareText(view), /^Wordle 1,835 4\/6\n/);
});

test('a failed game scores X/6', () => {
  const view = buildShareView(imageRow({ solved: false, guesses: 6 }), 'Sara', OFF);
  assert.equal(view.score, 'X/6');
});

test('hard-mode badge adds an asterisk to the text header', () => {
  const view = buildShareView(statusRow({ hardMode: true }), 'Sara', OFF);
  assert.match(buildShareText(view), /^Wordle 1,835 4\/6\*/);
});

test('words and words-left overlay the rows when the letters are known', () => {
  const view = buildShareView(statusRow(), 'Sara', { ...OFF, words: true, wordsLeft: true });
  assert.equal(view.rows[0].word, 'CRANE');
  // Counts only ever shrink as guesses constrain the set; the win leaves a handful.
  const counts = view.rows.map((r) => r.wordsLeft);
  assert.ok(counts.every((c) => typeof c === 'number'));
  for (let i = 1; i < counts.length; i += 1) assert.ok(counts[i]! <= counts[i - 1]!);
  assert.equal(view.notes.length, 0);
});

test('next guess and reveal-answer render for a /status game', () => {
  const view = buildShareView(statusRow(), 'Sara', { ...OFF, nextGuess: true, answer: true });
  assert.equal(view.answer, 'FAITH');
  assert.equal(typeof view.nextGuess, 'string');
});

test('opener strength and duration come from any game with a grid', () => {
  const view = buildShareView(statusRow(), 'Sara', { ...OFF, opener: true, time: true });
  assert.equal(view.opener, 1); // crane vs faith -> BBYBB, a single yellow on guess 1
  assert.equal(view.time, '2m 5s');
});

test('colour-only games note that overlays need a /status paste', () => {
  const view = buildShareView(imageRow(), 'Sara', { ...OFF, words: true, wordsLeft: true, answer: true });
  assert.equal(view.rows[0].word, null);
  assert.equal(view.rows[0].wordsLeft, null);
  assert.equal(view.answer, null);
  assert.ok(view.notes.some((n) => /status/.test(n)));
});

test('a summary game with no grid notes the missing grid', () => {
  const view = buildShareView(imageRow({ grid: null }), 'Sara', OFF);
  assert.equal(view.rows.length, 0);
  assert.ok(view.notes.some((n) => /summary/.test(n)));
});

test('spoiler wraps the grid but leaves the header visible', () => {
  const view = buildShareView(statusRow(), 'Sara', { ...OFF, spoiler: true });
  const text = buildShareText(view);
  assert.match(text, /^Wordle 1,835 4\/6\n/); // header outside
  assert.ok(text.includes('||')); // grid wrapped
});

test('showing the guessed words auto-marks the share as a spoiler', () => {
  const view = buildShareView(statusRow(), 'Sara', { ...OFF, words: true });
  assert.equal(view.spoiler, true);
  assert.ok(buildShareText(view).includes('||'));
});

test('showing candidates-left, next guess, or the answer auto-spoilers too', () => {
  for (const over of [{ wordsLeft: true }, { nextGuess: true }, { answer: true }]) {
    const view = buildShareView(statusRow(), 'Sara', { ...OFF, ...over });
    assert.equal(view.spoiler, true);
  }
});

test('overlays that do not reveal the answer leave the share unspoiled', () => {
  const view = buildShareView(statusRow(), 'Sara', { ...OFF, opener: true, time: true });
  assert.equal(view.spoiler, false);
});

test('requesting words on a colour-only game does not spoiler an empty overlay', () => {
  const view = buildShareView(imageRow(), 'Sara', { ...OFF, words: true, wordsLeft: true });
  assert.equal(view.spoiler, false);
});
