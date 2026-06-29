// Renders a player's stats as a card: a strip of summary tiles over a
// horizontal bar chart of the guess distribution, shaded like the /history
// calendar (red = fails).

import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { FONT, BACKGROUND, NOT_PLAYED, rgb, roundRect, type RGB } from './theme.js';

export interface StatTile {
  label: string;
  value: string;
}

export interface StatBar {
  label: string; // "1".."6" or "X"
  count: number;
  share: number; // 0..1 of all games
  color: RGB;
}

export interface StatsImageData {
  name: string;
  period: string; // "All time"
  tiles: StatTile[];
  bars: StatBar[];
}

const SCALE = 2; // output pixel density; layout is authored at 1x
const WIDTH = 680;
const PAD = 28;

const TITLE_H = 48;

const TILE_COLS = 3;
const TILE_GAP = 14;
const TILE_H = 66;

const SECTION_GAP = 24;
const SECTION_LABEL_H = 24;

const BAR_H = 42;
const BAR_GAP = 10;
const LABEL_W = 26;
const VALUE_W = 96;
const RADIUS = 8;

const BRIGHT = '#e6edf3';
const DIM = '#7d8590';

export function renderStatsPng(data: StatsImageData): Buffer {
  const tileRows = Math.ceil(data.tiles.length / TILE_COLS);
  const tilesH = tileRows * TILE_H + (tileRows - 1) * TILE_GAP;
  const chartH = data.bars.length * BAR_H + (data.bars.length - 1) * BAR_GAP;
  const height =
    PAD + TITLE_H + TILE_GAP + tilesH + SECTION_GAP + SECTION_LABEL_H + chartH + PAD;

  const canvas = createCanvas(WIDTH * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = rgb(BACKGROUND);
  ctx.fillRect(0, 0, WIDTH, height);

  // Title (player) on the left, period on the right.
  const titleY = PAD + TITLE_H / 2;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = BRIGHT;
  ctx.font = `30px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, data.name, WIDTH - PAD * 2 - 160), PAD, titleY);
  ctx.fillStyle = DIM;
  ctx.font = `18px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(data.period, WIDTH - PAD, titleY);

  drawTiles(ctx, data.tiles, PAD + TITLE_H + TILE_GAP);

  // Section label, with the total game count for context.
  const games = data.bars.reduce((a, b) => a + b.count, 0);
  const sectionTop = PAD + TITLE_H + TILE_GAP + tilesH + SECTION_GAP;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = DIM;
  ctx.font = `16px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('Guess distribution', PAD, sectionTop + SECTION_LABEL_H / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`${games} ${games === 1 ? 'game' : 'games'}`, WIDTH - PAD, sectionTop + SECTION_LABEL_H / 2);

  drawBars(ctx, data.bars, sectionTop + SECTION_LABEL_H);

  return canvas.toBuffer('image/png');
}

function drawTiles(ctx: SKRSContext2D, tiles: StatTile[], top: number): void {
  const areaW = WIDTH - PAD * 2;
  const tileW = (areaW - (TILE_COLS - 1) * TILE_GAP) / TILE_COLS;
  tiles.forEach((tile, i) => {
    const col = i % TILE_COLS;
    const row = Math.floor(i / TILE_COLS);
    const x = PAD + col * (tileW + TILE_GAP);
    const y = top + row * (TILE_H + TILE_GAP);

    ctx.fillStyle = rgb(NOT_PLAYED);
    roundRect(ctx, x, y, tileW, TILE_H, RADIUS);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = DIM;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(tile.label.toUpperCase(), x + 14, y + 13);

    ctx.fillStyle = BRIGHT;
    ctx.font = `25px ${FONT}`;
    ctx.fillText(fitText(ctx, tile.value, tileW - 28), x + 14, y + 30);
  });
}

function drawBars(ctx: SKRSContext2D, bars: StatBar[], top: number): void {
  const trackLeft = PAD + LABEL_W + 8;
  const trackRight = WIDTH - PAD - VALUE_W;
  const trackW = trackRight - trackLeft;
  const max = Math.max(1, ...bars.map((b) => b.count));

  bars.forEach((bar, i) => {
    const y = top + i * (BAR_H + BAR_GAP);
    const midY = y + BAR_H / 2;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = BRIGHT;
    ctx.font = `22px ${FONT}`;
    ctx.fillText(bar.label, PAD + LABEL_W / 2, midY);

    ctx.fillStyle = rgb(NOT_PLAYED);
    roundRect(ctx, trackLeft, y, trackW, BAR_H, RADIUS);

    if (bar.count > 0) {
      const fillW = Math.max(RADIUS * 2, (bar.count / max) * trackW);
      ctx.fillStyle = rgb(bar.color);
      roundRect(ctx, trackLeft, y, fillW, BAR_H, RADIUS);
    }

    ctx.fillStyle = BRIGHT;
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(String(bar.count), trackRight + 14, midY);

    ctx.fillStyle = DIM;
    ctx.font = `16px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(bar.share * 100)}%`, WIDTH - PAD, midY);
  });
}

// Trims text with an ellipsis until it fits within maxWidth at the current font.
function fitText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}
