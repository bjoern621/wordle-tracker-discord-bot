// Smoke test for the share card renderer: it must produce a real PNG for a
// fully-overlaid /status game and for a colour-only game with notes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSharePng } from '../src/render/share-image.js';
import type { ShareView } from '../src/share/share-model.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function isPng(buf: Buffer): boolean {
  return buf.length > PNG_MAGIC.length && buf.subarray(0, 4).equals(PNG_MAGIC);
}

test('renders a card with every overlay', () => {
  const view: ShareView = {
    numberLabel: '1,835',
    score: '4/6',
    solved: true,
    playerName: 'Sara',
    rows: [
      { pattern: 'BBYBB', word: 'CRANE', wordsLeft: 142 },
      { pattern: 'BBBBB', word: 'PLUMB', wordsLeft: 18 },
      { pattern: 'BGGBG', word: 'DAISY', wordsLeft: 3 },
      { pattern: 'GGGGG', word: 'FAITH', wordsLeft: 1 },
    ],
    hardMode: true,
    nextGuess: 'FAITH',
    answer: 'FAITH',
    opener: 1,
    time: '2m 5s',
    notes: [],
    spoiler: false,
  };
  const png = renderSharePng(view);
  assert.ok(isPng(png));
});

test('renders a colour-only card with a note and no overlays', () => {
  const view: ShareView = {
    numberLabel: '1,835',
    score: '4/6',
    solved: true,
    playerName: 'Sara',
    rows: [
      { pattern: 'BYGBB', word: null, wordsLeft: null },
      { pattern: 'GGGGG', word: null, wordsLeft: null },
    ],
    hardMode: false,
    nextGuess: null,
    answer: null,
    opener: null,
    time: null,
    notes: ['Guessed words and the answer are only known when the game was shared via /status.'],
    spoiler: false,
  };
  const png = renderSharePng(view);
  assert.ok(isPng(png));
});
