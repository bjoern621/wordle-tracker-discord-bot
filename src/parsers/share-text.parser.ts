// Manual share text: a player pastes "Wordle 1,835 4/6" plus the emoji grid.
// Carries the full per-guess colour grid. Attributed to the message author.

import type { Message } from 'discord.js';
import type { ParseContext, ParsedGame, WordleParser } from '../types.js';
import { parseEmojiGrid } from './emoji-grid.js';

// The number may carry thousands separators (1,835 or 1.835). The score is 1-6
// or X (failed). A trailing * marks hard mode.
const SHARE_RE = /Wordle\s+(\d[\d.,]*)\s+([1-6X])\s*\/\s*6(\*?)/i;

class ShareTextParser implements WordleParser {
  readonly source = 'share-text' as const;

  async parse(message: Message, _ctx: ParseContext): Promise<ParsedGame[] | null> {
    const author = message.author;
    if (!author || author.system) return null;

    const match = message.content?.match(SHARE_RE);
    if (!match) return null;

    const number = Number.parseInt(match[1].replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(number)) return null;

    const tries = match[2].toUpperCase();
    const solved = tries !== 'X';
    return [
      {
        number,
        guesses: solved ? Number.parseInt(tries, 10) : 6,
        solved,
        hardMode: match[3] === '*',
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

export const shareTextParser = new ShareTextParser();
