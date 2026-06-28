// Daily summary: the official Activity posts one message per day listing every
// player's score for the previous day, with @mentions. The primary source. It
// carries the score (N/6) only, never the grid colours.

import type { Message } from 'discord.js';
import type { ParseContext, ParsedGame, PlayerRef, WordleParser } from '../types.js';
import { OFFICIAL_WORDLE_APP_ID } from '../constants.js';
import { numberForTimestamp } from '../domain/wordle.js';

const SUMMARY_RE = /here are yesterday'?s results/i;
const SCORE_LINE_RE = /([1-6X])\s*\/\s*6\s*:\s*(.+)$/i;
const PARTICIPANT_RE = /<@!?(\d+)>|@([^\s@]+)/g;

class DailySummaryParser implements WordleParser {
  readonly source = 'summary' as const;

  async parse(message: Message, ctx: ParseContext): Promise<ParsedGame[] | null> {
    if (message.author?.id !== OFFICIAL_WORDLE_APP_ID) return null;
    const content = message.content || '';
    if (!SUMMARY_RE.test(content)) return null;

    const number = numberForTimestamp(message.createdAt, ctx.timeZone, -1);
    const games: ParsedGame[] = [];
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
        games.push({ number, guesses, solved, grid: null, hardMode: false, player });
      }
    }
    return games.length ? games : null;
  }
}

export const dailySummaryParser = new DailySummaryParser();
