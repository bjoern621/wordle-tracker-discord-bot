// Scoredle exports are real messages pasted by players. They start with
// "Scoredle", carry no puzzle number, annotate each grid row with candidate
// counts, and (on a loss) wrap the grid in spoiler tags with the guessed words.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoredleTextParser } from '../src/parsers/scoredle-text.parser.js';
import type { ParseContext } from '../src/types.js';
import { fakeMessage } from './helpers.js';

const ctx: ParseContext = { timeZone: 'Europe/Berlin', enableActivityImage: false };
const author = { id: 'u99', username: 'eggi', globalName: 'Eggi' };

function parse(content: string, createdAt?: Date) {
  return scoredleTextParser.parse(fakeMessage({ content, author, createdAt }), ctx);
}

const SOLVED = `Scoredle 5/6*

14,855
⬛🟨⬛⬛⬛ 1,314
⬛⬛🟨⬛⬛ 306
⬛⬛⬛🟩🟩 32
⬛🟩⬛🟩🟩 5
🟩🟩🟩🟩🟩`;

const FAILED = `Scoredle X/6*

14,855
||⬛⬛🟩⬛🟨 IDOLS (155)
⬛🟨🟩🟨🟩 BROSE (7)
🟩⬛🟩🟩🟩 STORE (6)
🟩⬛🟩🟩🟩 SWORE (5)
🟩⬛🟩🟩🟩 SPORE (4)
🟩⬛🟩🟩🟩 SCORE (4)||`;

const NO_STAR = `Scoredle 4/6

14,855
⬛🟩🟨🟨⬛ 29
🟨🟩🟨⬛⬛ 15
⬛🟩⬛🟨🟨 3
🟩🟩🟩🟩🟩`;

test('solved hard-mode game, counts stripped from the grid', async () => {
  const games = await parse(SOLVED);
  assert.equal(games?.length, 1);
  assert.deepEqual(games?.[0], {
    number: 1835,
    guesses: 5,
    solved: true,
    hardMode: true,
    grid: ['BYBBB', 'BBYBB', 'BBBGG', 'BGBGG', 'GGGGG'],
    words: null,
    answer: null,
    player: { kind: 'known', user: { id: 'u99', name: 'Eggi' } },
  });
});

test('failed game: spoiler tags and guessed words are ignored, six rows kept', async () => {
  const games = await parse(FAILED);
  assert.equal(games?.[0].solved, false);
  assert.equal(games?.[0].guesses, 6);
  assert.equal(games?.[0].hardMode, true);
  assert.deepEqual(games?.[0].grid, ['BBGBY', 'BYGYG', 'GBGGG', 'GBGGG', 'GBGGG', 'GBGGG']);
});

test('non-hard-mode export has no asterisk', async () => {
  const games = await parse(NO_STAR);
  assert.equal(games?.[0].hardMode, false);
  assert.equal(games?.[0].guesses, 4);
  assert.deepEqual(games?.[0].grid, ['BGYYB', 'YGYBB', 'BGBYY', 'GGGGG']);
});

test('puzzle number comes from the message timestamp in the group timezone', async () => {
  // 23:30 UTC is already the next day in Berlin (summer +2), so it maps to 1835,
  // not the 1834 a naive UTC reading would give.
  const games = await parse('Scoredle 3/6', new Date('2026-06-27T23:30:00Z'));
  assert.equal(games?.[0].number, 1835);
});

test('returns null for a normal Wordle share', async () => {
  assert.equal(await parse('Wordle 1,835 4/6\n\n🟩🟩🟩🟩🟩'), null);
});
