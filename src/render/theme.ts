// Shared visual theme for the GitHub-style result grids (history and weekly).
// Importing this module registers the grid font as a side effect.

import { GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

export const FONT = 'CalendarSans';
const FONT_PATH = fileURLToPath(new URL('../../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url));
if (!GlobalFonts.registerFromPath(FONT_PATH, FONT)) {
  throw new Error(`Grid font not found at ${FONT_PATH}`);
}

export type RGB = [number, number, number];

export const BACKGROUND: RGB = [13, 17, 23];
export const NOT_PLAYED: RGB = [22, 27, 34];
export const FAILED: RGB = [218, 54, 51];
// Indexed from fewest guesses to most.
const GREENS: RGB[] = [
  [14, 68, 41],
  [0, 109, 50],
  [38, 166, 65],
  [57, 211, 83],
];

/** Green shade for a solved game, keyed by guess count. */
export function greenFor(guesses: number): RGB {
  if (guesses <= 2) return GREENS[3];
  if (guesses === 3) return GREENS[2];
  if (guesses === 4) return GREENS[1];
  return GREENS[0];
}

export function rgb([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
