// Renders one week as a grid: one row per player, one column per puzzle the
// group played, each cell shaded by guess count like the /history calendar.

import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { FONT, BACKGROUND, NOT_PLAYED, FAILED, greenFor, rgb, roundRect, type RGB } from './theme.js';

/** A played game in a row, or null for a puzzle the player skipped. */
export interface WeeklyImageCell {
  guesses: number;
  solved: boolean;
  /** Marks the cell with a hard-mode asterisk when set. */
  hardMode: boolean;
}

export interface WeeklyImageColumn {
  weekday: string; // "Mon"
  day: number; // day of month, 1..31
}

export interface WeeklyImageRow {
  name: string;
  avg: string; // pre-formatted, e.g. "3.71"
  time: string; // pre-formatted avg solve time, e.g. "2m 5s" or "-" when untimed
  cells: (WeeklyImageCell | null)[]; // aligned to columns
}

export interface WeeklyImageData {
  title: string; // "Wordle Leaderboard"
  span: string; // "Jun 22 - Jun 28"
  columns: WeeklyImageColumn[];
  rows: WeeklyImageRow[];
}

const CELL = 84; // square side in pixels
const GAP = 8;
const PAD = 24;
const TITLE_H = 52;
const HEADER_H = 44; // weekday over day-of-month, two lines
const NAME_W = 200;
const AVG_W = 88;
const RADIUS = 10;
const SCALE = 2; // output pixel density; layout is authored at 1x

function cellColor(cell: WeeklyImageCell | null): RGB {
  if (!cell) return NOT_PLAYED;
  return cell.solved ? greenFor(cell.guesses) : FAILED;
}

// Trims text with an ellipsis until it fits within maxWidth at the current font.
function fitText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

export function renderWeeklyPng(data: WeeklyImageData): Buffer {
  const cols = data.columns.length;
  const rows = data.rows.length;
  const cellsW = cols * CELL + (cols - 1) * GAP;
  const gridLeft = PAD + NAME_W;
  const avgLeft = gridLeft + cellsW + GAP * 2;
  // A few columns leave the grid narrower than the title row; widen to fit both.
  const measure = createCanvas(1, 1).getContext('2d');
  measure.font = `28px ${FONT}`;
  const titleW = measure.measureText(data.title).width;
  measure.font = `18px ${FONT}`;
  const spanW = measure.measureText(data.span).width;
  const width = Math.max(avgLeft + AVG_W + PAD, PAD + titleW + GAP * 4 + spanW + PAD);
  const gridTop = PAD + TITLE_H + HEADER_H;
  const height = gridTop + rows * CELL + (rows - 1) * GAP + PAD;

  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = rgb(BACKGROUND);
  ctx.fillRect(0, 0, width, height);

  // Title (left) and date span (right) share the title row.
  const titleY = PAD + TITLE_H / 2;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e6edf3';
  ctx.font = `28px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(data.title, PAD, titleY);
  ctx.fillStyle = '#7d8590';
  ctx.font = `18px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(data.span, width - PAD, titleY);

  // Column headers: weekday over day-of-month, plus an "avg" label.
  ctx.fillStyle = '#7d8590';
  ctx.textAlign = 'center';
  const weekdayY = PAD + TITLE_H + 14;
  const dayY = PAD + TITLE_H + 31;
  data.columns.forEach((col, c) => {
    const cx = gridLeft + c * (CELL + GAP) + CELL / 2;
    ctx.font = `16px ${FONT}`;
    ctx.fillText(col.weekday, cx, weekdayY);
    ctx.font = `14px ${FONT}`;
    ctx.fillText(String(col.day), cx, dayY);
  });
  ctx.font = `16px ${FONT}`;
  ctx.fillText('avg', avgLeft + AVG_W / 2, weekdayY);

  data.rows.forEach((row, r) => {
    const top = gridTop + r * (CELL + GAP);
    const midY = top + CELL / 2;

    ctx.fillStyle = '#e6edf3';
    ctx.font = `22px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, row.name, NAME_W - GAP), PAD, midY);

    row.cells.forEach((cell, c) => {
      const x = gridLeft + c * (CELL + GAP);
      ctx.fillStyle = rgb(cellColor(cell));
      roundRect(ctx, x, top, CELL, CELL, RADIUS);

      const score = cell ? (cell.solved ? String(cell.guesses) : 'X') : '';
      if (score) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `40px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(score, x + CELL / 2, midY);
      }

      // Hard mode marker: a corner asterisk, the same `*` Wordle's share text uses.
      if (cell?.hardMode) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `28px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('*', x + CELL - 8, top + 4);
        ctx.textBaseline = 'middle';
      }
    });

    // Avg score sits in the gutter with the mean solve time riding dimly below
    // it. The time is always shown, falling back to "-" when no timing exists.
    const avgX = avgLeft + AVG_W / 2;
    ctx.fillStyle = '#e6edf3';
    ctx.font = `30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(row.avg, avgX, midY - 12);
    ctx.fillStyle = '#7d8590';
    ctx.font = `15px ${FONT}`;
    ctx.fillText(row.time, avgX, midY + 16);
  });

  return canvas.toBuffer('image/png');
}
