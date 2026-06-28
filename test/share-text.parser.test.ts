// The manual share-text parser must accept the official NYT website export and
// the in-app/bot variants players actually paste: comma, dot and bare numbers,
// hard mode, failures, and the high-contrast palette.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareTextParser } from '../src/parsers/share-text.parser.js';
import type { ParseContext } from '../src/types.js';
import { fakeMessage } from './helpers.js';

const ctx: ParseContext = { timeZone: 'Europe/Berlin', enableActivityImage: false };
const author = { id: 'u42', username: 'sara', globalName: 'Sara' };

async function parse(content: string) {
  return shareTextParser.parse(fakeMessage({ content, author }), ctx);
}

test('official NYT website export (comma thousands separator)', async () => {
  const games = await parse('Wordle 1,835 4/6\n\n⬜⬜⬜🟨⬜\n🟨⬜⬜⬜⬜\n🟩🟩⬜🟩⬜\n🟩🟩🟩🟩🟩');
  assert.equal(games?.length, 1);
  assert.deepEqual(games?.[0], {
    number: 1835,
    guesses: 4,
    solved: true,
    hardMode: false,
    grid: ['BBBYB', 'YBBBB', 'GGBGB', 'GGGGG'],
    player: { kind: 'known', user: { id: 'u42', name: 'Sara' } },
  });
});

test('bot/app export with a bare puzzle number', async () => {
  const games = await parse('Wordle 1835 2/6\n\n⬜⬜⬜🟨⬜\n🟩🟩🟩🟩🟩');
  assert.equal(games?.[0].number, 1835);
  assert.equal(games?.[0].guesses, 2);
  assert.deepEqual(games?.[0].grid, ['BBBYB', 'GGGGG']);
});

test('EU/German locale export (dot thousands separator) carries a failure', async () => {
  const games = await parse('Wordle 1.835 X/6\n\n⬛⬛⬛⬛🟩\n⬛⬛⬛🟨⬛\n⬛⬛⬛⬛⬛\n⬛⬛⬛⬛🟩\n⬛⬛⬛⬛⬛\n⬛⬛⬛⬛⬛');
  assert.equal(games?.[0].number, 1835);
  assert.equal(games?.[0].solved, false);
  assert.equal(games?.[0].guesses, 6);
});

test('hard mode asterisk is recorded', async () => {
  const games = await parse('Wordle 1,200 3/6*\n\n🟩🟩🟩🟩🟩');
  assert.equal(games?.[0].hardMode, true);
});

test('high-contrast palette maps blue to correct and orange to present', async () => {
  const games = await parse('Wordle 1,500 2/6\n\n🟧🟦⬛⬛⬛\n🟦🟦🟦🟦🟦');
  assert.deepEqual(games?.[0].grid, ['YGBBB', 'GGGGG']);
});

test('falls back to the username when there is no global name', async () => {
  const msg = fakeMessage({ content: 'Wordle 1,000 1/6', author: { id: 'u7', username: 'plainname' } });
  const games = await shareTextParser.parse(msg, ctx);
  assert.deepEqual(games?.[0].player, { kind: 'known', user: { id: 'u7', name: 'plainname' } });
});

test('returns null for a message with no Wordle line', async () => {
  assert.equal(await parse('just chatting about wordle here'), null);
});

test('ignores system messages', async () => {
  const msg = fakeMessage({ content: 'Wordle 1,835 4/6', author: { id: 's', username: 'sys', system: true } });
  assert.equal(await shareTextParser.parse(msg, ctx), null);
});
