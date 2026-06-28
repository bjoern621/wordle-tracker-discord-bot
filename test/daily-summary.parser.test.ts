// The official Activity posts one summary per day with everyone's score for the
// previous puzzle. Only that bot's "here are yesterday's results" message counts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySummaryParser } from '../src/parsers/daily-summary.parser.js';
import { OFFICIAL_WORDLE_APP_ID } from '../src/constants.js';
import type { ParseContext, ParsedGame } from '../src/types.js';
import { fakeMessage } from './helpers.js';

const ctx: ParseContext = { timeZone: 'Europe/Berlin', enableActivityImage: false };
const wordleBot = { id: OFFICIAL_WORDLE_APP_ID, username: 'Wordle', bot: true };

const SUMMARY = `**Your group is on a 355 day streak!** 🔥🔥🔥 Here are yesterday's results:
👑 4/6: <@111> <@222>
5/6: <@333> @Tim
6/6: <@444>
X/6: <@555>`;

function parse(content: string, author = wordleBot) {
  // 10:00 Berlin on 2026-06-28; "yesterday" is puzzle 1834.
  return dailySummaryParser.parse(fakeMessage({ content, author, createdAt: new Date('2026-06-28T08:00:00Z') }), ctx);
}

const byId = (games: ParsedGame[], id: string) =>
  games.find((g) => g.player.kind === 'participant' && g.player.id === id);
const byName = (games: ParsedGame[], name: string) =>
  games.find((g) => g.player.kind === 'participant' && g.player.name === name);

test('one game per mention, attributed to yesterday\'s puzzle', async () => {
  const games = await parse(SUMMARY);
  assert.equal(games?.length, 6);
  for (const g of games!) {
    assert.equal(g.number, 1834);
    assert.equal(g.grid, null);
    assert.equal(g.hardMode, false);
  }
});

test('scores and solved flag are read per line', async () => {
  const games = (await parse(SUMMARY))!;
  assert.deepEqual(byId(games, '111'), {
    number: 1834,
    guesses: 4,
    solved: true,
    grid: null,
    hardMode: false,
    player: { kind: 'participant', id: '111' },
  });
  assert.equal(byId(games, '444')?.guesses, 6);
  assert.equal(byId(games, '444')?.solved, true);
  const failed = byId(games, '555');
  assert.equal(failed?.solved, false);
  assert.equal(failed?.guesses, 6);
});

test('plain @names become unresolved participants', async () => {
  const games = (await parse(SUMMARY))!;
  assert.deepEqual(byName(games, 'Tim'), {
    number: 1834,
    guesses: 5,
    solved: true,
    grid: null,
    hardMode: false,
    player: { kind: 'participant', name: 'Tim' },
  });
});

test('ignores messages from anyone but the official Activity', async () => {
  assert.equal(await parse(SUMMARY, { id: '999', username: 'impostor', bot: true }), null);
});

test('ignores the bot\'s other messages', async () => {
  assert.equal(await parse('Björn was playing'), null);
});
