// Decodes real Activity preview PNGs captured from the channel. Each fixture is
// named for its expected result and was confirmed by eye against the image.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGrid } from '../src/grid/grid-reader.js';

interface Fixture {
  file: string;
  guesses: number;
  solved: boolean;
  patterns: string[];
}

const fixtures: Fixture[] = [
  { file: 'solved-2of6.png', guesses: 2, solved: true, patterns: ['BBBYB', 'GGGGG'] },
  { file: 'solved-4of6-a.png', guesses: 4, solved: true, patterns: ['YBGBB', 'BYBBG', 'GBGGG', 'GGGGG'] },
  { file: 'solved-4of6-b.png', guesses: 4, solved: true, patterns: ['BYBBB', 'BBYYB', 'YYBGG', 'GGGGG'] },
  { file: 'solved-5of6-a.png', guesses: 5, solved: true, patterns: ['BBBBY', 'YBBBB', 'BYYGB', 'YYBBB', 'GGGGG'] },
  { file: 'solved-5of6-b.png', guesses: 5, solved: true, patterns: ['BGBBB', 'BGYBB', 'BGGGB', 'BGGGB', 'GGGGG'] },
  { file: 'failed-6of6.png', guesses: 6, solved: false, patterns: ['BBBBB', 'BYBBB', 'BBYYG', 'GGBGG', 'GGBGG', 'GGBGG'] },
];

function load(name: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`./fixtures/images/${name}`, import.meta.url)));
}

for (const fx of fixtures) {
  test(`parseGrid reads ${fx.file}`, () => {
    const result = parseGrid(load(fx.file));
    assert.deepEqual(result, { guesses: fx.guesses, solved: fx.solved, patterns: fx.patterns });
  });
}
