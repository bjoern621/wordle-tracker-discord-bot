// Daily summary: the official Activity posts one message per day listing every
// player's score for the previous day, with @mentions, plus a preview image that
// packs one grid per listed player. The primary source. The score (N/6) comes
// from the text; the grid colours come from the image when they can be matched.

import type { Message } from 'discord.js';
import type { ParseContext, ParsedGame, PlayerRef, WordleParser } from '../types.js';
import { OFFICIAL_WORDLE_APP_ID } from '../constants.js';
import { numberForTimestamp } from '../domain/wordle.js';
import { readSummaryGrids, type SummaryGrid } from '../grid/summary-grid-reader.js';

const SUMMARY_RE = /here are yesterday'?s results/i;
const SCORE_LINE_RE = /([1-6X])\s*\/\s*6\s*:\s*(.+)$/i;
const PARTICIPANT_RE = /<@!?(\d+)>|@([^\s@]+)/g;

interface Entry {
  guesses: number;
  solved: boolean;
  player: PlayerRef;
}

// Downloads and reads the preview image's grids, or returns [] when there is no
// image or it cannot be fetched or read. CDN urls are signed and refreshed each
// time the message is fetched, so backfill gets a live url.
async function fetchSummaryGrids(message: Message): Promise<SummaryGrid[]> {
  const image = [...message.attachments.values()].find((a) => a.contentType?.startsWith('image/'));
  if (!image) return [];
  try {
    const res = await fetch(image.url);
    if (!res.ok) return [];
    return readSummaryGrids(Buffer.from(await res.arrayBuffer()));
  } catch {
    return [];
  }
}

class DailySummaryParser implements WordleParser {
  readonly source = 'summary' as const;

  async parse(message: Message, ctx: ParseContext): Promise<ParsedGame[] | null> {
    if (message.author?.id !== OFFICIAL_WORDLE_APP_ID) return null;
    const content = message.content || '';
    if (!SUMMARY_RE.test(content)) return null;

    const number = numberForTimestamp(message.createdAt, ctx.timeZone, -1);

    // Entries in render order: lines top-to-bottom (best score first), mentions
    // left-to-right within a line. The preview grids render in this same order.
    const entries: Entry[] = [];
    for (const line of content.split('\n')) {
      const score = line.match(SCORE_LINE_RE);
      if (!score) continue;
      const tries = score[1].toUpperCase();
      const solved = tries !== 'X';
      const guesses = solved ? Number.parseInt(tries, 10) : 6;
      for (const p of score[2].matchAll(PARTICIPANT_RE)) {
        const player: PlayerRef = p[1]
          ? { kind: 'participant', id: p[1] }
          : { kind: 'participant', name: p[2] };
        entries.push({ guesses, solved, player });
      }
    }
    if (!entries.length) return null;

    // Grid i belongs to entry i. The renderer omits some players (a failure, or
    // one who did not play in-app), always the trailing ones, so a shorter grid
    // list still aligns from the top. Attach a grid only when its own score
    // matches the listed score; that drops any misread or misaligned card instead
    // of mislabelling it.
    const grids = await fetchSummaryGrids(message);
    return entries.map((e, i) => {
      const card = grids[i];
      const matched = card && card.complete && card.guesses === e.guesses && card.solved === e.solved;
      return {
        number,
        guesses: e.guesses,
        solved: e.solved,
        grid: matched ? card.patterns : null,
        words: null,
        answer: null,
        hardMode: null, // the summary does not report hard mode
        firstGuessAt: null, // the summary carries no per-guess timing
        lastGuessAt: null,
        player: e.player,
      };
    });
  }
}

export const dailySummaryParser = new DailySummaryParser();
