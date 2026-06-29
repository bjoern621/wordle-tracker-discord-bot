// Renders a /share card: the Wordle title, the player, the colour grid (with the
// guessed letters when known), and the overlay lines the view carries. The tile
// palette is the canonical Wordle one (a different look from the GitHub-calendar
// greens in theme.ts), so it lives here; the canvas primitives are shared.

import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { FONT, BACKGROUND, NOT_PLAYED, rgb, roundRect } from './theme.js';
import type { ShareView } from '../share/share-model.js';

const SCALE = 2; // output pixel density; layout is authored at 1x
const PAD = 24;

const TILE = 46;
const TGAP = 6;
const GRID_W = 5 * TILE + 4 * TGAP;
const TILE_RADIUS = 6;
const WL_COL = 86; // width reserved right of the grid for "N left" labels

const TITLE_H = 38;
const SUB_H = 26;
const GRID_TOP_GAP = 14;
const FOOTER_GAP = 18;
const FOOTER_LH = 26;
const NOTE_GAP = 14;
const NOTE_LH = 22;

const MIN_W = 360;
const BRIGHT = '#e6edf3';
const DIM = '#7d8590';
const TILE_CORRECT = '#538d4e';
const TILE_PRESENT = '#b59f3b';
const TILE_ABSENT = '#3a3a3c';

function tileColor(cell: string): string {
  return cell === 'G' ? TILE_CORRECT : cell === 'Y' ? TILE_PRESENT : TILE_ABSENT;
}

// The non-row overlay lines, top to bottom.
function footerLines(view: ShareView): string[] {
  const lines: string[] = [];
  if (view.nextGuess) lines.push(`Next best guess: ${view.nextGuess}`);
  if (view.answer) lines.push(`Answer: ${view.answer}`);
  if (view.opener != null) lines.push(`Opener: ${view.opener}/5 found`);
  if (view.time) lines.push(`Time: ${view.time}`);
  return lines;
}

// Greedy word wrap of `text` to lines no wider than `maxWidth` at the current font.
function wrap(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderSharePng(view: ShareView): Buffer {
  const hasWL = view.rows.some((r) => r.wordsLeft != null);
  const width = Math.max(MIN_W, PAD * 2 + GRID_W + (hasWL ? WL_COL : 0));
  const textW = width - PAD * 2;

  // Measure first (font metrics are canvas-size independent) so wrapped notes and
  // the footer count can size the canvas height.
  const measure = createCanvas(10, 10).getContext('2d');
  measure.font = `15px ${FONT}`;
  const noteLines = view.notes.flatMap((n) => wrap(measure, n, textW));
  const footers = footerLines(view);

  let height = PAD + TITLE_H + SUB_H;
  if (view.rows.length) height += GRID_TOP_GAP + view.rows.length * TILE + (view.rows.length - 1) * TGAP;
  if (footers.length) height += FOOTER_GAP + footers.length * FOOTER_LH;
  if (noteLines.length) height += NOTE_GAP + noteLines.length * NOTE_LH;
  height += PAD;

  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = rgb(BACKGROUND);
  ctx.fillRect(0, 0, width, height);

  // Title: "Wordle 1,835 4/6" on the left, a HARD pill on the right.
  const titleMid = PAD + TITLE_H / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = BRIGHT;
  ctx.font = `26px ${FONT}`;
  ctx.fillText(`Wordle ${view.numberLabel} ${view.score}`, PAD, titleMid);
  if (view.hardMode) drawHardPill(ctx, width - PAD, titleMid);

  // Player name.
  ctx.fillStyle = DIM;
  ctx.font = `16px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(view.playerName, PAD, PAD + TITLE_H + SUB_H / 2);

  let y = PAD + TITLE_H + SUB_H + (view.rows.length ? GRID_TOP_GAP : 0);
  for (const r of view.rows) {
    drawRow(ctx, r.pattern, r.word, r.wordsLeft, y);
    y += TILE + TGAP;
  }
  if (view.rows.length) y -= TGAP;

  if (footers.length) {
    y += FOOTER_GAP;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const line of footers) {
      ctx.fillStyle = BRIGHT;
      ctx.font = `17px ${FONT}`;
      ctx.fillText(fit(ctx, line, textW), PAD, y);
      y += FOOTER_LH;
    }
  }

  if (noteLines.length) {
    y += NOTE_GAP;
    ctx.fillStyle = DIM;
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const line of noteLines) {
      ctx.fillText(line, PAD, y);
      y += NOTE_LH;
    }
  }

  return canvas.toBuffer('image/png');
}

function drawRow(ctx: SKRSContext2D, pattern: string, word: string | null, wordsLeft: number | null, y: number): void {
  for (let i = 0; i < 5; i += 1) {
    const x = PAD + i * (TILE + TGAP);
    ctx.fillStyle = tileColor(pattern[i]);
    roundRect(ctx, x, y, TILE, TILE, TILE_RADIUS);
    if (word) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `24px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(word[i] ?? '', x + TILE / 2, y + TILE / 2 + 1);
    }
  }
  if (wordsLeft != null) {
    ctx.fillStyle = DIM;
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${wordsLeft} left`, PAD + GRID_W + 12, y + TILE / 2);
  }
}

function drawHardPill(ctx: SKRSContext2D, right: number, midY: number): void {
  const label = 'HARD';
  ctx.font = `13px ${FONT}`;
  const w = ctx.measureText(label).width + 20;
  const h = 22;
  const x = right - w;
  ctx.fillStyle = rgb(NOT_PLAYED);
  roundRect(ctx, x, midY - h / 2, w, h, h / 2);
  ctx.fillStyle = TILE_CORRECT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, midY + 1);
}

// Trims text with an ellipsis until it fits maxWidth at the current font.
function fit(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}
