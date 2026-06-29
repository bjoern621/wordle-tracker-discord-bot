// The /status parser reads a pasted official-app status: the header score, the
// revealed answer, and each row's guessed word plus its colours, from the literal
// :<letter><colour>: tile tokens a copy carries (not rendered custom emoji).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusTextParser } from '../src/parsers/status-text.parser.js';
import type { ParseContext } from '../src/types.js';
import { fakeMessage } from './helpers.js';

const ctx: ParseContext = { timeZone: 'Europe/Berlin', enableActivityImage: false };
const author = { id: 'u42', username: 'sara', globalName: 'Sara' };

async function parse(content: string) {
  return statusTextParser.parse(fakeMessage({ content, author }), ctx);
}

// The example a player pastes: a failed hard-mode game over all six rows.
const FAILED = `Wordle 1836 X/6*
29.6.2026

The word is crude

:zgrey::igrey::lgrey::cyellow::hgrey:
:wgrey::uyellow::sgrey::sgrey::ygrey:
:pgrey::uyellow::sgrey::sgrey::ygrey:
:tgrey::ogrey::sgrey::sgrey::ygrey:
:bgrey::rgreen::ogrey::wgrey::ngrey:
:dyellow::rgreen::ogrey::wgrey::ngrey:`;

test('reads the words, answer, grid, score and hard mode of a failed game', async () => {
  const games = await parse(FAILED);
  assert.equal(games?.length, 1);
  assert.deepEqual(games?.[0], {
    number: 1836,
    guesses: 6,
    solved: false,
    grid: ['BBBYB', 'BYBBB', 'BYBBB', 'BBBBB', 'BGBBB', 'YGBBB'],
    words: ['zilch', 'wussy', 'pussy', 'tossy', 'brown', 'drown'],
    answer: 'crude',
    hardMode: true,
    player: { kind: 'known', user: { id: 'u42', name: 'Sara' } },
  });
});

const SOLVED = `Wordle 1836 2/6
29.6.2026

The word is crane

:sgrey::lgrey::agreen::tgrey::egreen:
:cgreen::rgreen::agreen::ngreen::egreen:`;

test('a solved game ends on the answer and an all-green row', async () => {
  const games = await parse(SOLVED);
  assert.equal(games?.[0].guesses, 2);
  assert.equal(games?.[0].solved, true);
  assert.equal(games?.[0].hardMode, false);
  assert.deepEqual(games?.[0].grid, ['BBGBG', 'GGGGG']);
  assert.deepEqual(games?.[0].words, ['slate', 'crane']);
  assert.equal(games?.[0].answer, 'crane');
});

test('returns null for a plain colour-emoji share (no letter tiles)', async () => {
  assert.equal(await parse('Wordle 1,835 4/6\n\n🟩🟩🟩🟩🟩'), null);
});

test('returns null when the answer line is missing', async () => {
  const noAnswer = 'Wordle 1836 1/6\n\n:cgreen::rgreen::agreen::ngreen::egreen:';
  assert.equal(await parse(noAnswer), null);
});

test('ignores system messages', async () => {
  const msg = fakeMessage({ content: FAILED, author: { id: 's', username: 'sys', system: true } });
  assert.equal(await statusTextParser.parse(msg, ctx), null);
});
