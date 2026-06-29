// Exercises the activity-image parser against real Activity preview PNGs, with
// fetch stubbed to serve the fixture bytes. Covers the unfinished-game rule: an
// unfinished grid is recorded as a failure immediately, on any day, and is
// overridden later if the player finishes the puzzle.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { activityImageParser } from '../src/parsers/activity-image.parser.js';
import { OFFICIAL_WORDLE_APP_ID } from '../src/constants.js';
import { fakeMessage } from './helpers.js';
import type { ParseContext } from '../src/types.js';

const ctx: ParseContext = { timeZone: 'UTC', enableActivityImage: true };
const DAY = 86_400_000;

function fixture(name: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`./fixtures/images/${name}`, import.meta.url)));
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(buffer: Buffer): void {
  globalThis.fetch = (async () => ({
    ok: true,
    arrayBuffer: async () => buffer,
  })) as unknown as typeof fetch;
}

function activityMessage(createdAt: Date) {
  return fakeMessage({
    author: { id: OFFICIAL_WORDLE_APP_ID, username: 'Wordle' },
    interactionUser: { id: 'player-1', username: 'eggi', globalName: 'Eggi' },
    content: 'Eggi was playing',
    createdAt,
    attachments: [{ url: 'https://cdn.example/preview.png', contentType: 'image/png' }],
  });
}

test('a finished grid is recorded with its score and colours', async () => {
  stubFetch(fixture('solved-4of6-a.png'));
  const games = await activityImageParser.parse(activityMessage(new Date(Date.now() - 5 * DAY)), ctx);
  assert.ok(games && games.length === 1);
  assert.equal(games[0].solved, true);
  assert.equal(games[0].guesses, 4);
  assert.deepEqual(games[0].grid, ['YBGBB', 'BYBBG', 'GBGGG', 'GGGGG']);
});

test('an unfinished grid for a past day is recorded as a failure with no grid', async () => {
  stubFetch(fixture('abandoned-3of6.png'));
  const games = await activityImageParser.parse(activityMessage(new Date(Date.now() - 5 * DAY)), ctx);
  assert.ok(games && games.length === 1);
  assert.equal(games[0].solved, false);
  assert.equal(games[0].guesses, 6);
  assert.equal(games[0].grid, null);
});

test('an unfinished grid for the current day is also recorded as a failure', async () => {
  stubFetch(fixture('abandoned-3of6.png'));
  const games = await activityImageParser.parse(activityMessage(new Date()), ctx);
  assert.ok(games && games.length === 1);
  assert.equal(games[0].solved, false);
  assert.equal(games[0].guesses, 6);
  assert.equal(games[0].grid, null);
});

test('multi-player images are ignored regardless of grid state', async () => {
  stubFetch(fixture('abandoned-3of6.png'));
  const message = fakeMessage({
    author: { id: OFFICIAL_WORDLE_APP_ID, username: 'Wordle' },
    interactionUser: { id: 'player-1', username: 'eggi', globalName: 'Eggi' },
    content: 'Eggi and DODOmitWaffe are playing',
    createdAt: new Date(Date.now() - 5 * DAY),
    attachments: [{ url: 'https://cdn.example/preview.png', contentType: 'image/png' }],
  });
  assert.equal(await activityImageParser.parse(message, ctx), null);
});
