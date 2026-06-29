// Pasted /status text from the official Wordle app. A player runs /status, sees
// their own ephemeral reply, and pastes it into the channel. Alone among the
// sources this reveals the letters: the actual word guessed on each row and the
// puzzle answer, not just the colour grid. Each tile is a literal `:<letter><colour>:`
// token (e.g. :cyellow:, :rgreen:), which is what a copied paste carries; the
// rendered custom emoji is not parsed. Attributed to the message author.

import type { Message } from 'discord.js';
import type { ParseContext, ParsedGame, WordleParser } from '../types.js';

// "Wordle 1836 X/6" or "Wordle 1836 4/6*"; the number may carry thousands
// separators, the score is 1-6 or X, a trailing * marks hard mode.
const HEADER_RE = /Wordle\s+(\d[\d.,]*)\s+([1-6X])\s*\/\s*6(\*?)/i;
// "The word is crude" reveals the answer.
const ANSWER_RE = /The word is\s+([a-z]{5})\b/i;
// One tile: a single guessed letter and its colour.
const TILE_RE = /:([a-z])(grey|yellow|green):/gi;

const COLOUR: Record<string, string> = { grey: 'B', yellow: 'Y', green: 'G' };

interface Row {
  word: string;
  cells: string;
}

// Reads the tile tokens line by line. A row is the five tiles of one guess, so a
// line that does not yield exactly five letters (chatter, the header, blanks) is
// dropped, the same five-cell rule the colour-only grids use.
function parseRows(content: string): Row[] {
  const rows: Row[] = [];
  for (const line of content.split('\n')) {
    let word = '';
    let cells = '';
    for (const tile of line.matchAll(TILE_RE)) {
      word += tile[1].toLowerCase();
      cells += COLOUR[tile[2].toLowerCase()];
    }
    if (word.length === 5) rows.push({ word, cells });
  }
  return rows;
}

class StatusTextParser implements WordleParser {
  readonly source = 'status' as const;

  async parse(message: Message, _ctx: ParseContext): Promise<ParsedGame[] | null> {
    const author = message.author;
    if (!author || author.system) return null;

    const content = message.content;
    if (!content) return null;

    const header = content.match(HEADER_RE);
    if (!header) return null;

    const rows = parseRows(content);
    if (!rows.length) return null; // no letter tiles: a plain share, left to other parsers

    const answerMatch = content.match(ANSWER_RE);
    if (!answerMatch) return null; // the /status format always names the answer

    const number = Number.parseInt(header[1].replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(number)) return null;

    const solved = header[2].toUpperCase() !== 'X';
    return [
      {
        number,
        guesses: rows.length,
        solved,
        grid: rows.map((row) => row.cells),
        words: rows.map((row) => row.word),
        answer: answerMatch[1].toLowerCase(),
        hardMode: header[3] === '*',
        firstGuessAt: null,
        lastGuessAt: null,
        player: { kind: 'known', user: { id: author.id, name: author.globalName || author.username } },
      },
    ];
  }
}

export const statusTextParser = new StatusTextParser();
