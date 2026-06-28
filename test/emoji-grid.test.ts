import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEmojiGrid } from '../src/parsers/emoji-grid.js';

test('maps the standard palette to B/Y/G rows', () => {
  assert.deepEqual(parseEmojiGrid('⬛🟨🟩⬛⬛\n🟩🟩🟩🟩🟩'), ['BYGBB', 'GGGGG']);
});

test('treats the high-contrast palette the same', () => {
  assert.deepEqual(parseEmojiGrid('⬜🟧🟦⬜⬜'), ['BYGBB']);
});

test('keeps only lines of exactly five squares, ignoring trailing text', () => {
  assert.deepEqual(parseEmojiGrid('header 1/6\n⬛⬛🟩⬛🟨 STORE (6)\nfour 🟩🟩🟩🟩'), ['BBGBY']);
});

test('returns null when there is no grid', () => {
  assert.equal(parseEmojiGrid('no squares here'), null);
});
