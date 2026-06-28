// Renders one month as a large day grid with the guess count drawn in each
// played cell. Uses @napi-rs/canvas for real text.

import { createCanvas } from '@napi-rs/canvas';
import type { MonthData, MonthCell } from '../stats/calendar.js';
import { FONT, BACKGROUND, NOT_PLAYED, FAILED, greenFor, rgb, roundRect, type RGB } from './theme.js';

const COLS = 7;
const CELL_H = 84; // cell height in pixels; width is derived to hit TARGET_RATIO
const GAP = 8;
const PAD = 24;
const TITLE_H = 52;
const WEEKDAY_H = 30;
const RADIUS = 10;
const SCALE = 2; // output pixel density; layout is authored at 1x
// Discord scales inline image attachments into a box wider than it is tall, so a
// near-square month grid gets clamped by height and renders small. Cell width is
// derived per month so the whole image lands near this width:height ratio and
// fills that box, regardless of how many week-rows the month spans.
const TARGET_RATIO = 1.55;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function cellColor(cell: MonthCell): RGB {
  switch (cell.state) {
    case 'future':
    case 'none':
      return NOT_PLAYED;
    case 'fail':
      return FAILED;
    case 'win':
      return greenFor(cell.guesses);
  }
}

// "2026-03" -> "March 2026".
function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function renderMonthPng(data: MonthData): Buffer {
  const rows = Math.ceil((data.leading + data.cells.length) / COLS);
  const height = PAD * 2 + TITLE_H + WEEKDAY_H + rows * CELL_H + (rows - 1) * GAP;
  const cellW = Math.max(
    CELL_H,
    Math.round((TARGET_RATIO * height - PAD * 2 - (COLS - 1) * GAP) / COLS),
  );
  const gridW = COLS * cellW + (COLS - 1) * GAP;
  const width = PAD * 2 + gridW;

  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = rgb(BACKGROUND);
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#e6edf3';
  ctx.font = `28px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(monthTitle(data.month), PAD, PAD + TITLE_H / 2);

  ctx.fillStyle = '#7d8590';
  ctx.font = `16px ${FONT}`;
  ctx.textAlign = 'center';
  const headerY = PAD + TITLE_H + WEEKDAY_H / 2;
  for (let c = 0; c < COLS; c += 1) {
    ctx.fillText(WEEKDAYS[c], PAD + c * (cellW + GAP) + cellW / 2, headerY);
  }

  const gridTop = PAD + TITLE_H + WEEKDAY_H;
  for (let i = 0; i < data.cells.length; i += 1) {
    const cell = data.cells[i];
    const pos = data.leading + i;
    const x = PAD + (pos % COLS) * (cellW + GAP);
    const y = gridTop + Math.floor(pos / COLS) * (CELL_H + GAP);

    ctx.globalAlpha = cell.state === 'future' ? 0.4 : 1;
    ctx.fillStyle = rgb(cellColor(cell));
    roundRect(ctx, x, y, cellW, CELL_H, RADIUS);
    ctx.globalAlpha = 1;

    const onColor = cell.state === 'win' || cell.state === 'fail';

    ctx.fillStyle = onColor ? 'rgba(255, 255, 255, 0.8)' : '#7d8590';
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(cell.day), x + 9, y + 8);

    const score = cell.state === 'win' ? String(cell.guesses) : cell.state === 'fail' ? 'X' : '';
    if (score) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `40px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(score, x + cellW / 2, y + CELL_H / 2);
    }
  }

  return canvas.toBuffer('image/png');
}
