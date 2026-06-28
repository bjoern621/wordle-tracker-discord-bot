// Draws a contribution calendar to a PNG with pngjs. No text is rendered (pngjs
// has no font support); the surrounding embed carries the legend and labels.

import { PNG } from 'pngjs';
import type { CalendarData, DayCell } from '../stats/calendar.js';

type RGB = [number, number, number];

const BACKGROUND: RGB = [13, 17, 23]; // GitHub dark canvas
const NOT_PLAYED: RGB = [22, 27, 34];
const FAILED: RGB = [218, 54, 51];
// Dim to bright; fewer guesses pick a brighter shade.
const GREENS: RGB[] = [
  [14, 68, 41],
  [0, 109, 50],
  [38, 166, 65],
  [57, 211, 83],
];

const CELL = 12; // square side in pixels
const GAP = 3; // space between squares
const PAD = 10; // border around the grid
const RADIUS = 3; // corner chamfer for the rounded-square look

function greenFor(guesses: number): RGB {
  if (guesses <= 2) return GREENS[3];
  if (guesses === 3) return GREENS[2];
  if (guesses === 4) return GREENS[1];
  return GREENS[0];
}

// Returns the fill colour, or null to leave the background showing (future days).
function colorFor(cell: DayCell): RGB | null {
  switch (cell.state) {
    case 'future':
      return null;
    case 'none':
      return NOT_PLAYED;
    case 'fail':
      return FAILED;
    case 'win':
      return greenFor(cell.guesses);
  }
}

function setPixel(png: PNG, x: number, y: number, [r, g, b]: RGB): void {
  const i = (y * png.width + x) * 4;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = 255;
}

function fill(png: PNG, rgb: RGB): void {
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) setPixel(png, x, y, rgb);
  }
}

// A filled square with the four corners chamfered, approximating GitHub's
// rounded cells.
function roundedSquare(png: PNG, x0: number, y0: number, size: number, rgb: RGB): void {
  for (let dy = 0; dy < size; dy += 1) {
    for (let dx = 0; dx < size; dx += 1) {
      const ex = Math.min(dx, size - 1 - dx);
      const ey = Math.min(dy, size - 1 - dy);
      if (ex + ey < RADIUS - 1) continue; // cut the corner
      setPixel(png, x0 + dx, y0 + dy, rgb);
    }
  }
}

export function renderCalendarPng(data: CalendarData): Buffer {
  const cols = data.weeks.length;
  const width = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const height = PAD * 2 + 7 * CELL + 6 * GAP;
  const png = new PNG({ width, height });
  fill(png, BACKGROUND);

  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < 7; row += 1) {
      const rgb = colorFor(data.weeks[col][row]);
      if (!rgb) continue;
      const x = PAD + col * (CELL + GAP);
      const y = PAD + row * (CELL + GAP);
      roundedSquare(png, x, y, CELL, rgb);
    }
  }

  return PNG.sync.write(png);
}
