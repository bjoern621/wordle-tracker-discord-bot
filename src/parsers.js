// Three ways a Wordle result reaches the channel:
//   1. Daily summary. The official Activity posts one message per day listing
//      every player's score for the previous day, with @mentions. Primary source.
//      Carries the score (N/6) only, never the grid colours.
//   2. Manual share text. A player pastes "Wordle 1,835 4/6" + the emoji grid.
//      Carries the full per-guess colour grid.
//   3. Per-game image. The Activity's solo "X was playing" message whose
//      attachment shows the result grid, sampled into a colour grid.

import { OFFICIAL_WORDLE_APP_ID, numberForTimestamp } from './wordle.js';
import { parseGrid } from './grid.js';

// --- Emoji grid -------------------------------------------------------------

// Standard and high-contrast palettes both map to absent/present/correct.
const SQUARE = {
  '🟩': 'G', '🟦': 'G', // correct (green / high-contrast blue)
  '🟨': 'Y', '🟧': 'Y', // present (yellow / high-contrast orange)
  '⬛': 'B', '⬜': 'B', // absent (dark / light)
};

function parseEmojiGrid(content) {
  const rows = [];
  for (const line of content.split('\n')) {
    const cells = Array.from(line).map((ch) => SQUARE[ch]).filter(Boolean);
    if (cells.length === 5) rows.push(cells.join(''));
  }
  return rows.length ? rows : null;
}

// --- 1. Daily summary -------------------------------------------------------

const SUMMARY_RE = /here are yesterday'?s results/i;
const SCORE_LINE_RE = /([1-6X])\s*\/\s*6\s*:\s*(.+)$/i;
const PARTICIPANT_RE = /<@!?(\d+)>|@([^\s@]+)/g;

export function parseDailySummary(message, timeZone) {
  if (message.author?.id !== OFFICIAL_WORDLE_APP_ID) return null;
  const content = message.content || '';
  if (!SUMMARY_RE.test(content)) return null;

  const number = numberForTimestamp(message.createdAt, timeZone, -1);
  const results = [];
  for (const line of content.split('\n')) {
    const score = line.match(SCORE_LINE_RE);
    if (!score) continue;
    const tries = score[1].toUpperCase();
    const solved = tries !== 'X';
    const guesses = solved ? Number.parseInt(tries, 10) : 6;
    for (const p of score[2].matchAll(PARTICIPANT_RE)) {
      const who = p[1] ? { id: p[1] } : { name: p[2] };
      results.push({ ...who, guesses, solved });
    }
  }
  return results.length ? { number, results } : null;
}

// --- 2. Manual share text ---------------------------------------------------

// The number may carry thousands separators (1,835 or 1.835). The score is 1-6
// or X (failed). A trailing * marks hard mode.
const SHARE_RE = /Wordle\s+(\d[\d.,]*)\s+([1-6X])\s*\/\s*6(\*?)/i;

export function parseShareText(content) {
  if (!content) return null;
  const match = content.match(SHARE_RE);
  if (!match) return null;

  const number = Number.parseInt(match[1].replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(number)) return null;

  const tries = match[2].toUpperCase();
  const solved = tries !== 'X';
  return {
    number,
    guesses: solved ? Number.parseInt(tries, 10) : 6,
    solved,
    hardMode: match[3] === '*',
    grid: parseEmojiGrid(content),
  };
}

// --- 3. Per-game image ------------------------------------------------------

// "X was playing" is one player; "X and Y were playing" / "X and N others"
// produce an ambiguous combined image, so only solo messages are parsed here.
const MULTI_PLAYER_RE = /\band\b|\bothers\b/i;

export async function parseActivityMessage(message, timeZone) {
  if (message.author?.id !== OFFICIAL_WORDLE_APP_ID) return null;
  const player = message.interactionMetadata?.user;
  if (!player) return null;
  if (MULTI_PLAYER_RE.test(message.content || '')) return null;

  const image = [...message.attachments.values()].find((a) => a.contentType?.startsWith('image/'));
  if (!image) return null;

  let grid;
  try {
    const res = await fetch(image.url);
    if (!res.ok) return null;
    grid = parseGrid(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
  if (!grid) return null;

  return {
    number: numberForTimestamp(message.createdAt, timeZone, 0),
    guesses: grid.guesses,
    solved: grid.solved,
    hardMode: null,
    grid: grid.patterns,
    user: { id: player.id, name: player.globalName || player.username },
  };
}
