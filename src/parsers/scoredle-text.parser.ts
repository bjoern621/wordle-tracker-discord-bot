// Scoredle share text: the third-party Scoredle game posts "Scoredle 4/6" plus a
// per-guess emoji grid annotated with candidate counts. A failed game wraps the
// grid in Discord spoiler tags and reveals the guessed words. The text carries no
// puzzle number, so the number comes from the message timestamp. The grid colours
// reuse the manual-share representation. Attributed to the message author.

import type { Message } from 'discord.js';
import type { ParseContext, ParsedGame, WordleParser } from '../types.js';
import { numberForTimestamp } from '../domain/wordle.js';
import { parseEmojiGrid } from './emoji-grid.js';

// "Scoredle 4/6" or "Scoredle X/6*"; the score is 1-6 or X, trailing * is hard mode.
const SCOREDLE_RE = /Scoredle\s+([1-6X])\s*\/\s*6(\*?)/i;

class ScoredleTextParser implements WordleParser {
  readonly source = 'scoredle' as const;

  async parse(message: Message, ctx: ParseContext): Promise<ParsedGame[] | null> {
    const author = message.author;
    if (!author || author.system) return null;

    const match = message.content?.match(SCOREDLE_RE);
    if (!match) return null;

    const tries = match[1].toUpperCase();
    const solved = tries !== 'X';
    return [
      {
        number: numberForTimestamp(message.createdAt, ctx.timeZone, 0),
        guesses: solved ? Number.parseInt(tries, 10) : 6,
        solved,
        hardMode: match[2] === '*',
        grid: parseEmojiGrid(message.content),
        words: null,
        answer: null,
        firstGuessAt: null,
        lastGuessAt: null,
        player: { kind: 'known', user: { id: author.id, name: author.globalName || author.username } },
      },
    ];
  }
}

export const scoredleTextParser = new ScoredleTextParser();
