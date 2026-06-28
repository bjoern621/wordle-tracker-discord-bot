// Shared colour reading for Wordle grid images. The single-grid Activity preview
// (grid-reader.ts) and the daily-summary preview (summary-grid-reader.ts) render
// the same tile art, so they classify pixels and emit B/Y/G the same way.

export type Cell = 'green' | 'yellow' | 'absent' | 'empty' | 'other';

export interface GridResult {
  guesses: number;
  solved: boolean;
  /** Whether the game reached a terminal state: solved, or all six guesses used. */
  complete: boolean;
  /** Per-guess colour rows (B/Y/G), one string of five characters each. */
  patterns: string[];
}

/** Classifies an averaged RGB sample into a tile colour. */
export function classify(r: number, g: number, b: number): Cell {
  const bright = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (g > r + 25 && g > b + 25 && g > 70) return 'green';
  if (r > 130 && g > 110 && b < 100 && r > b + 40) return 'yellow';
  if (spread < 22 && bright >= 45 && bright <= 120) return 'absent';
  if (bright < 45) return 'empty';
  return 'other';
}

// B/Y/G pattern per cell, matching the manual share-text representation. Empty and
// unrecognised cells fall back to B so a row always carries five characters.
const CHAR: Record<Cell, string> = { green: 'G', yellow: 'Y', absent: 'B', empty: 'B', other: 'B' };

/** Maps a classified cell to its B/Y/G share-text character. */
export function cellChar(cell: Cell): string {
  return CHAR[cell];
}

export interface Img {
  width: number;
  height: number;
  data: Buffer | Uint8Array;
}

/** Reads the raw RGB triple at a pixel. */
export function rgb(img: Img, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/**
 * Averages the RGB of a square patch of half-width `patch` around (cx, cy),
 * clipped to the image bounds, and classifies the result.
 */
export function sampleCell(img: Img, cx: number, cy: number, patch: number): Cell {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = cy - patch; y <= cy + patch; y += 1) {
    for (let x = cx - patch; x <= cx + patch; x += 1) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const i = (y * img.width + x) * 4;
      r += img.data[i];
      g += img.data[i + 1];
      b += img.data[i + 2];
      n += 1;
    }
  }
  return classify(r / n, g / n, b / n);
}
