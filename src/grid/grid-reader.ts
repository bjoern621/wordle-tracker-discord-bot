// Reads the Wordle result grid out of the official Activity's preview image by
// sampling the colour at each of the 30 cell centres. Coordinates are stored as
// fractions of the image dimensions, measured from a real 512x280 preview, so
// they survive any uniform rescaling of the image.

import { PNG } from 'pngjs';
import { cellChar, sampleCell, type GridResult } from './cell.js';

export type { GridResult };

const COL_FRACS = [0.551, 0.598, 0.645, 0.691, 0.738];
const ROW_FRACS = [0.371, 0.457, 0.543, 0.629, 0.714, 0.8];
const PATCH = 4; // half-width of the averaged sample square, in pixels

/**
 * Returns the grid read from the image, or null when it is empty (no guess
 * played). A non-terminal grid (fewer than six rows and not solved) is returned
 * with `complete: false`; the caller decides whether an unfinished game counts
 * as still in progress or as abandoned.
 */
export function parseGrid(buffer: Buffer): GridResult | null {
  const png = PNG.sync.read(buffer);
  const rows = ROW_FRACS.map((ry) => {
    const cy = Math.round(ry * png.height);
    return COL_FRACS.map((rx) => sampleCell(png, Math.round(rx * png.width), cy, PATCH));
  });

  const filled = rows.filter((cells) => cells.some((c) => c !== 'empty'));
  const guesses = filled.length;
  if (guesses === 0) return null;

  const solved = filled[filled.length - 1].every((c) => c === 'green');
  const complete = solved || guesses === 6;

  return { guesses, solved, complete, patterns: filled.map((cells) => cells.map(cellChar).join('')) };
}
