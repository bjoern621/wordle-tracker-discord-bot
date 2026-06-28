// Reads the Wordle result grid out of the official Activity's preview image by
// sampling the colour at each of the 30 cell centres. Coordinates are stored as
// fractions of the image dimensions, measured from a real 512x280 preview, so
// they survive any uniform rescaling of the image.

import { PNG } from 'pngjs';

const COL_FRACS = [0.551, 0.598, 0.645, 0.691, 0.738];
const ROW_FRACS = [0.371, 0.457, 0.543, 0.629, 0.714, 0.8];
const PATCH = 4; // half-width of the averaged sample square, in pixels

function classify(r, g, b) {
  const bright = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (g > r + 25 && g > b + 25 && g > 70) return 'green';
  if (r > 130 && g > 110 && b < 100 && r > b + 40) return 'yellow';
  if (spread < 22 && bright >= 45 && bright <= 120) return 'absent';
  if (bright < 45) return 'empty';
  return 'other';
}

function sampleCell(png, cx, cy) {
  const { width, height, data } = png;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = cy - PATCH; y <= cy + PATCH; y += 1) {
    for (let x = cx - PATCH; x <= cx + PATCH; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
  }
  return classify(r / n, g / n, b / n);
}

// B/Y/G pattern per cell, matching the manual share-text representation.
const CHAR = { green: 'G', yellow: 'Y', absent: 'B', empty: 'B', other: 'B' };

// Returns { guesses, solved, patterns } for a finished game, or null when the
// grid is empty or the game is still in progress (fewer than 6 rows, unsolved).
export function parseGrid(buffer) {
  const png = PNG.sync.read(buffer);
  const rows = ROW_FRACS.map((ry) => {
    const cy = Math.round(ry * png.height);
    return COL_FRACS.map((rx) => sampleCell(png, Math.round(rx * png.width), cy));
  });

  const filled = rows.filter((cells) => cells.some((c) => c !== 'empty'));
  const guesses = filled.length;
  if (guesses === 0) return null;

  const solved = filled[filled.length - 1].every((c) => c === 'green');
  const terminal = solved || guesses === 6;
  if (!terminal) return null;

  return { guesses, solved, patterns: filled.map((cells) => cells.map((c) => CHAR[c]).join('')) };
}
