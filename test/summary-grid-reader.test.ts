// Decodes real daily-summary preview PNGs captured from the channel, one per
// grid count from 1 to 8 (covering all three card arrangements). Each fixture's
// expected scores were taken from the summary's own score lines, which list
// players best-first in the same order the grids render.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readSummaryGrids } from '../src/grid/summary-grid-reader.js';

// "4" => solved in 4; "X" => failed (six guesses, not solved).
type Score = string;

interface Fixture {
  grids: number;
  scores: Score[];
}

const fixtures: Fixture[] = [
  { grids: 1, scores: ['4'] }, // one wide card
  { grids: 2, scores: ['6', 'X'] }, // single row
  { grids: 3, scores: ['4', '4', '4'] },
  { grids: 4, scores: ['4', '4', '5', '6'] },
  { grids: 5, scores: ['5', '5', '5', '6', '6'] }, // widest single row
  { grids: 6, scores: ['3', '4', '5', '5', '6', '6'] }, // two rows of three
  { grids: 7, scores: ['2', '3', '3', '3', '4', '5', '5'] },
  { grids: 8, scores: ['3', '4', '4', '4', '4', '5', '5', '6'] }, // three rows
];

function load(name: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`./fixtures/images/${name}`, import.meta.url)));
}

function expected(score: Score): { guesses: number; solved: boolean } {
  return score === 'X' ? { guesses: 6, solved: false } : { guesses: Number(score), solved: true };
}

for (const fx of fixtures) {
  test(`readSummaryGrids reads ${fx.grids}-grid summary`, () => {
    const grids = readSummaryGrids(load(`summary-${fx.grids}grids.png`));
    assert.equal(grids.length, fx.grids, `expected ${fx.grids} grids, got ${grids.length}`);
    fx.scores.forEach((score, i) => {
      const exp = expected(score);
      assert.equal(grids[i].guesses, exp.guesses, `grid ${i} guesses`);
      assert.equal(grids[i].solved, exp.solved, `grid ${i} solved`);
      assert.equal(grids[i].complete, true, `grid ${i} complete`);
      // Every pattern is five characters of B/Y/G, and a solve ends in GGGGG.
      assert.equal(grids[i].patterns.length, exp.guesses);
      for (const row of grids[i].patterns) assert.match(row, /^[BYG]{5}$/);
      if (exp.solved) assert.equal(grids[i].patterns[exp.guesses - 1], 'GGGGG');
    });
  });
}
