// Reads the grids out of the daily-summary preview image. Unlike the single-grid
// Activity preview (see grid-reader.ts), the summary packs one grid per listed
// player into a 512x280 canvas, in three arrangements that depend on how many
// grids are rendered:
//
//   1 grid    one wide card, avatar left, grid right.
//   2-5 grids one row of cards, avatar on top, grid below.
//   6-8 grids rows of three cards, avatar left, grid right; the last row centred.
//
// The cards always read best-score-first, matching the order of the summary's
// score lines, so the caller maps grid i to listed player i. The renderer omits
// some players (a failed game, or one who did not play in-app), so the grid count
// can be lower than the player count; the omitted players are always the trailing
// ones, so positional mapping from the top still aligns. The caller cross-checks
// each grid's score against the player's listed score and drops any that disagree,
// so a missed or spurious card degrades to a skip rather than a wrong attribution.
//
// Detection is geometry-free: grid cells are flat (low local colour variance)
// while avatars are textured, so a uniformity filter isolates the cells, and the
// cards fall out of the row/column gaps in that mask.

import { PNG } from 'pngjs';
import { classify, cellChar, rgb, sampleCell, type Cell, type GridResult, type Img } from './cell.js';

export type SummaryGrid = GridResult;

const PATCH = 3; // half-width of the averaged sample square, in pixels
const CELL_LABELS: ReadonlySet<Cell> = new Set<Cell>(['green', 'yellow', 'absent']);

// Cell mask: a pixel is a grid cell only if it reads as a tile colour and its 4
// neighbours are near-identical. The uniformity test rejects avatar texture,
// leaving the flat grid tiles.
function cellMask(img: Img): Uint8Array {
  const { width: w, height: h } = img;
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const [r, g, b] = rgb(img, x, y);
      if (!CELL_LABELS.has(classify(r, g, b))) continue;
      let uniform = true;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const [r2, g2, b2] = rgb(img, x + dx, y + dy);
        if (Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2) > 40) {
          uniform = false;
          break;
        }
      }
      if (uniform) mask[y * w + x] = 1;
    }
  }
  return mask;
}

// Runs of a 1-D histogram above `thr`, joining runs separated by less than
// `minGap` and dropping any shorter than `minLen`.
function segments(hist: number[], thr: number, minGap: number, minLen: number): [number, number][] {
  const raw: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < hist.length; i += 1) {
    if (hist[i] > thr) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      raw.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) raw.push([start, hist.length - 1]);

  const merged: [number, number][] = [];
  for (const run of raw) {
    const last = merged[merged.length - 1];
    if (last && run[0] - last[1] <= minGap) last[1] = run[1];
    else merged.push([...run]);
  }
  return merged.filter(([a, b]) => b - a + 1 >= minLen);
}

function rowHistogram(mask: Uint8Array, w: number, h: number): number[] {
  const hist = new Array(h).fill(0);
  for (let y = 0; y < h; y += 1) {
    let n = 0;
    for (let x = 0; x < w; x += 1) if (mask[y * w + x]) n += 1;
    hist[y] = n;
  }
  return hist;
}

function columnHistogram(mask: Uint8Array, w: number, y0: number, y1: number): number[] {
  const hist = new Array(w).fill(0);
  for (let y = y0; y <= y1; y += 1) for (let x = 0; x < w; x += 1) if (mask[y * w + x]) hist[x] += 1;
  return hist;
}

// Centres of cell bands along the y-axis within a card's bounding box. Each band
// is one guess row; the count is the number of guesses played.
function rowCenters(mask: Uint8Array, w: number, x0: number, x1: number, y0: number, y1: number): number[] {
  const hist = new Array(y1 - y0 + 1).fill(0);
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (mask[y * w + x]) hist[y - y0] += 1;
  const peak = Math.max(...hist);
  return segments(hist, peak * 0.25, 2, 3).map(([a, b]) => y0 + (a + b) / 2);
}

// Centres of cell bands along the x-axis within a card's bounding box. A real
// grid has exactly five; a textured avatar patch that slips through the mask does
// not, so the five-column requirement in readCard rejects it.
function colCenters(mask: Uint8Array, w: number, x0: number, x1: number, y0: number, y1: number): number[] {
  const hist = new Array(x1 - x0 + 1).fill(0);
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (mask[y * w + x]) hist[x - x0] += 1;
  const peak = Math.max(...hist);
  return segments(hist, peak * 0.25, 2, 3).map(([a, b]) => x0 + (a + b) / 2);
}

// Five evenly-spaced column centres spanning the detected ones. When detection
// finds exactly five they are used as-is; extra bands from noise are smoothed out
// by spacing five across the first and last.
function fiveColumns(cols: number[]): number[] {
  if (cols.length === 5) return cols;
  const first = cols[0];
  const step = (cols[cols.length - 1] - first) / 4;
  return [0, 1, 2, 3, 4].map((k) => first + k * step);
}

// Reads one card's grid, or null when the region is not a five-column grid (an
// avatar patch) or carries no guess row.
function readCard(img: Img, mask: Uint8Array, x0: number, x1: number, y0: number, y1: number): SummaryGrid | null {
  const detectedCols = colCenters(mask, img.width, x0, x1, y0, y1);
  if (detectedCols.length < 5) return null;
  const cols = fiveColumns(detectedCols);
  const rows = rowCenters(mask, img.width, x0, x1, y0, y1);
  if (rows.length === 0) return null;

  const patterns = rows.map((ry) =>
    cols.map((cx) => cellChar(sampleCell(img, Math.round(cx), Math.round(ry), PATCH))).join(''),
  );
  const guesses = patterns.length;
  const solved = patterns[guesses - 1] === 'GGGGG';
  return { guesses, solved, complete: solved || guesses === 6, patterns };
}

/**
 * Reads every grid in a daily-summary image, in render order (top-to-bottom,
 * left-to-right), which matches the order of the summary's score lines. Returns
 * an empty array when no grid is found.
 */
export function readSummaryGrids(buffer: Buffer): SummaryGrid[] {
  const png = PNG.sync.read(buffer);
  const img: Img = { width: png.width, height: png.height, data: png.data };
  const mask = cellMask(img);

  const grids: SummaryGrid[] = [];
  // Card rows are separated by tall vertical gaps (the avatars and card padding).
  const cardRows = segments(rowHistogram(mask, img.width, img.height), img.width * 0.03, Math.round(img.height * 0.06), Math.round(img.height * 0.04));
  for (const [y0, y1] of cardRows) {
    const colHist = columnHistogram(mask, img.width, y0, y1);
    // Cards within a row are separated by wide horizontal gaps. The threshold is
    // absolute (about half a cell tall) so a one-guess grid, whose columns carry
    // cells in only a single row, is still found.
    const cards = segments(colHist, 7, Math.round(img.width * 0.03), Math.round(img.width * 0.02));
    for (const [x0, x1] of cards) {
      const grid = readCard(img, mask, x0, x1, y0, y1);
      if (grid) grids.push(grid);
    }
  }
  return grids;
}
