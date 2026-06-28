// The registry is the order ingest tries parsers in: the first to return games
// wins. This checks each text source routes to the parser that owns it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsers } from '../src/parsers/index.js';
import { OFFICIAL_WORDLE_APP_ID } from '../src/constants.js';
import type { Message } from 'discord.js';
import type { ParseContext, ResultSource } from '../src/types.js';
import { fakeMessage } from './helpers.js';

const ctx: ParseContext = { timeZone: 'Europe/Berlin', enableActivityImage: false };

// Mirrors the dispatch in ingestMessage without touching the database.
async function route(message: Message): Promise<ResultSource | null> {
  for (const parser of parsers) {
    const games = await parser.parse(message, ctx);
    if (games && games.length) return parser.source;
  }
  return null;
}

test('a Wordle share routes to the share-text parser', async () => {
  const source = await route(fakeMessage({ content: 'Wordle 1,835 4/6\n\n🟩🟩🟩🟩🟩' }));
  assert.equal(source, 'share-text');
});

test('a Scoredle paste routes to the scoredle parser', async () => {
  const source = await route(fakeMessage({ content: 'Scoredle 4/6\n\n14,855\n🟩🟩🟩🟩🟩' }));
  assert.equal(source, 'scoredle');
});

test('the daily summary routes to the summary parser', async () => {
  const content = "Here are yesterday's results:\n4/6: <@111>";
  const source = await route(fakeMessage({ content, author: { id: OFFICIAL_WORDLE_APP_ID, username: 'Wordle', bot: true } }));
  assert.equal(source, 'summary');
});

test('ordinary chatter matches no parser', async () => {
  assert.equal(await route(fakeMessage({ content: 'anyone playing wordle today?' })), null);
});
