// Renders a head-to-head between two players as a versus card: their record as
// a big scoreline, then a column of metrics with the leading side's tile shaded
// green like the /history grid.

import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { FONT, BACKGROUND, NOT_PLAYED, greenFor, rgb, roundRect } from './theme.js';

/** Which side leads a metric: 1 = left player, 2 = right player, 0 = tie. */
export type Lead = 0 | 1 | 2;

export interface CompareStat {
  label: string; // "Win rate"
  v1: string; // pre-formatted, e.g. "82%"
  v2: string;
  lead: Lead;
}

export interface CompareImageData {
  name1: string;
  name2: string;
  span: string; // "All time"
  shared: number; // puzzles both players have played
  w1: number; // head-to-head wins, left player
  w2: number;
  draw: number;
  stats: CompareStat[];
}

const SCALE = 2; // output pixel density; layout is authored at 1x
const WIDTH = 680;
const PAD = 28;

const TITLE_H = 48;
const BANNER_H = 92;
const SECTION_GAP = 22;

const STAT_H = 56;
const STAT_GAP = 10;
const TILE_W = 132;
const TILE_H = 44;
const RADIUS = 10;

const BRIGHT = '#e6edf3';
const DIM = '#7d8590';
const WHITE = '#ffffff';
const WIN = rgb(greenFor(1)); // brightest grid green, used to flag the leader

export function renderComparePng(data: CompareImageData): Buffer {
  const n = data.stats.length;
  const bannerTop = PAD + TITLE_H + 8;
  const statsTop = bannerTop + BANNER_H + SECTION_GAP;
  const height = statsTop + n * STAT_H + (n - 1) * STAT_GAP + PAD;

  const canvas = createCanvas(WIDTH * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = rgb(BACKGROUND);
  ctx.fillRect(0, 0, WIDTH, height);

  // Title (left) and period span (right) share the title row.
  const titleY = PAD + TITLE_H / 2;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = BRIGHT;
  ctx.font = `28px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('Head to Head', PAD, titleY);
  ctx.fillStyle = DIM;
  ctx.font = `18px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(data.span, WIDTH - PAD, titleY);

  drawBanner(ctx, data, bannerTop);
  data.stats.forEach((stat, i) => drawStat(ctx, stat, statsTop + i * (STAT_H + STAT_GAP)));

  return canvas.toBuffer('image/png');
}

// The scoreline ("5 - 2") centred, flanked by the two names, with the leader's
// name in green; a dim subtitle below gives draws and the shared-puzzle count.
function drawBanner(ctx: SKRSContext2D, data: CompareImageData, top: number): void {
  const centerX = WIDTH / 2;
  const scoreY = top + 40;

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = BRIGHT;
  ctx.font = `44px ${FONT}`;
  const scoreText = `${data.w1} - ${data.w2}`;
  ctx.fillText(scoreText, centerX, scoreY);
  const scoreHalf = ctx.measureText(scoreText).width / 2;

  const gap = 24;
  const nameMax = centerX - scoreHalf - gap - PAD;
  ctx.font = `24px ${FONT}`;
  ctx.fillStyle = data.w1 > data.w2 ? WIN : BRIGHT;
  ctx.textAlign = 'right';
  ctx.fillText(fitText(ctx, data.name1, nameMax), centerX - scoreHalf - gap, scoreY);
  ctx.fillStyle = data.w2 > data.w1 ? WIN : BRIGHT;
  ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, data.name2, nameMax), centerX + scoreHalf + gap, scoreY);

  const draws = data.draw === 1 ? '1 draw' : `${data.draw} draws`;
  const shared = `${data.shared} shared ${data.shared === 1 ? 'puzzle' : 'puzzles'}`;
  ctx.fillStyle = DIM;
  ctx.font = `16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${draws} · ${shared}`, centerX, scoreY + 30);
}

// One metric row: a centred label flanked by both players' value tiles, the
// leading side shaded green.
function drawStat(ctx: SKRSContext2D, stat: CompareStat, top: number): void {
  const midY = top + STAT_H / 2;
  const tileTop = top + (STAT_H - TILE_H) / 2;

  ctx.textBaseline = 'middle';
  ctx.fillStyle = DIM;
  ctx.font = `15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(stat.label.toUpperCase(), WIDTH / 2, midY);

  drawTile(ctx, PAD, tileTop, stat.v1, stat.lead === 1);
  drawTile(ctx, WIDTH - PAD - TILE_W, tileTop, stat.v2, stat.lead === 2);
}

function drawTile(ctx: SKRSContext2D, x: number, top: number, value: string, lead: boolean): void {
  ctx.fillStyle = lead ? WIN : rgb(NOT_PLAYED);
  roundRect(ctx, x, top, TILE_W, TILE_H, RADIUS);
  ctx.fillStyle = lead ? WHITE : BRIGHT;
  ctx.font = `24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x + TILE_W / 2, top + TILE_H / 2);
}

// Trims text with an ellipsis until it fits within maxWidth at the current font.
function fitText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}
