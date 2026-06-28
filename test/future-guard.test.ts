// The ingest path runs each parser's output through rejectFuturePuzzles before
// storing. These tests cover the real failure mode: a share text whose puzzle
// number lies in the future (a typo, or yesterday's habit applied a day early).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareTextParser } from '../src/parsers/share-text.parser.js';
import { rejectFuturePuzzles } from '../src/domain/wordle.js';
import { fakeMessage } from './helpers.js';
import type { ParseContext } from '../src/types.js';

const ctx: ParseContext = { timeZone: 'UTC', enableActivityImage: false };
const now = new Date('2026-06-28T12:00:00Z'); // today is puzzle #1835

test('a future-dated share text is dropped before storage', async () => {
  const games = await shareTextParser.parse(fakeMessage({ content: 'Wordle 1,836 3/6' }), ctx);
  assert.ok(games && games.length === 1);
  const { kept, dropped } = rejectFuturePuzzles(games, 'UTC', now);
  assert.equal(kept.length, 0);
  assert.deepEqual(dropped.map((g) => g.number), [1836]);
});

test("today's share text is kept", async () => {
  const games = await shareTextParser.parse(fakeMessage({ content: 'Wordle 1,835 4/6' }), ctx);
  assert.ok(games);
  const { kept } = rejectFuturePuzzles(games, 'UTC', now);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].number, 1835);
});
