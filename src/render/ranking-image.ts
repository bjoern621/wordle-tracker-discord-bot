// Renders a leaderboard as a ranked card: one row per player ordered best
// average first, with games, win rate, and an average-score tile shaded like
// the /history grid. Used for periods too long for a day-by-day grid.

import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { FONT, BACKGROUND, NOT_PLAYED, FAILED, greenFor, rgb, roundRect, type RGB } from './theme.js';

export interface RankingRow {
  name: string;
  games: number;
  winRate: number; // 0..1
  avgScore: number | null; // null when the player has no games
  avgTime: string; // pre-formatted solve time, e.g. "2m 5s" or "-" when untimed
}

export interface RankingImageData {
  title: string; // "Wordle Leaderboard"
  span: string; // "This month"
  rows: RankingRow[];
}

const PAD = 24;
const TITLE_H = 52;
const HEADER_H = 30;
const ROW_H = 60;
const GAP = 6;
const RANK_W = 56;
const NAME_W = 240;
const GAMES_W = 96;
const WIN_W = 110;
const TIME_W = 110;
const AVG_W = 96;
const RADIUS = 10;
const SCALE = 2; // output pixel density; layout is authored at 1x

// Average-score tile colour: green keyed by rounded score, red once it crosses
// into mostly-failed territory.
function avgColor(avg: number | null): RGB {
  if (avg == null) return NOT_PLAYED;
  return avg <= 6 ? greenFor(Math.round(avg)) : FAILED;
}

// Trims text with an ellipsis until it fits within maxWidth at the current font.
function fitText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

export function renderRankingPng(data: RankingImageData): Buffer {
  const rows = data.rows.length;
  const rankLeft = PAD;
  const nameLeft = rankLeft + RANK_W;
  const gamesLeft = nameLeft + NAME_W;
  const winLeft = gamesLeft + GAMES_W;
  const timeLeft = winLeft + WIN_W;
  const avgLeft = timeLeft + TIME_W;
  const width = avgLeft + AVG_W + PAD;
  const gridTop = PAD + TITLE_H + HEADER_H;
  const height = gridTop + rows * ROW_H + (rows - 1) * GAP + PAD;

  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = rgb(BACKGROUND);
  ctx.fillRect(0, 0, width, height);

  // Title (left) and period span (right) share the title row.
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

  // Column headers.
  const headerY = PAD + TITLE_H + HEADER_H / 2;
  ctx.fillStyle = '#7d8590';
  ctx.font = `16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('games', gamesLeft + GAMES_W / 2, headerY);
  ctx.fillText('win%', winLeft + WIN_W / 2, headerY);
  ctx.fillText('time', timeLeft + TIME_W / 2, headerY);
  ctx.fillText('avg', avgLeft + AVG_W / 2, headerY);

  data.rows.forEach((row, r) => {
    const top = gridTop + r * (ROW_H + GAP);
    const midY = top + ROW_H / 2;

    ctx.fillStyle = '#7d8590';
    ctx.font = `24px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(r + 1), rankLeft + RANK_W - 14, midY);

    ctx.fillStyle = '#e6edf3';
    ctx.font = `24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, row.name, NAME_W - GAP), nameLeft, midY);

    ctx.font = `22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(row.games), gamesLeft + GAMES_W / 2, midY);
    ctx.fillText(`${Math.round(row.winRate * 100)}%`, winLeft + WIN_W / 2, midY);

    // Solve time is dimmer than the score columns: only Activity-sourced games
    // carry it, so many rows show "-".
    ctx.fillStyle = row.avgTime === '-' ? '#7d8590' : '#e6edf3';
    ctx.fillText(row.avgTime, timeLeft + TIME_W / 2, midY);

    const tileTop = top + (ROW_H - 44) / 2;
    ctx.fillStyle = rgb(avgColor(row.avgScore));
    roundRect(ctx, avgLeft, tileTop, AVG_W, 44, RADIUS);
    ctx.fillStyle = '#ffffff';
    ctx.font = `26px ${FONT}`;
    ctx.fillText(row.avgScore == null ? '-' : row.avgScore.toFixed(2), avgLeft + AVG_W / 2, midY);
  });

  return canvas.toBuffer('image/png');
}
