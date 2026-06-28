// Per-game image: the Activity's solo "X was playing" message whose attachment
// shows the result grid, sampled into a colour grid. Only solo messages are
// parsed; "X and Y were playing" / "X and N others" produce an ambiguous
// combined image.

import type { Message } from 'discord.js';
import type { ParseContext, ParsedGame, WordleParser } from '../types.js';
import { OFFICIAL_WORDLE_APP_ID } from '../constants.js';
import { currentNumber, numberForTimestamp } from '../domain/wordle.js';
import { parseGrid } from '../grid/grid-reader.js';

const MULTI_PLAYER_RE = /\band\b|\bothers\b/i;

class ActivityImageParser implements WordleParser {
  readonly source = 'activity' as const;

  async parse(message: Message, ctx: ParseContext): Promise<ParsedGame[] | null> {
    if (!ctx.enableActivityImage) return null;
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

    const number = numberForTimestamp(message.createdAt, ctx.timeZone, 0);
    const who = { kind: 'known' as const, user: { id: player.id, name: player.globalName || player.username } };

    // An unfinished grid only counts once its puzzle day has passed: a player who
    // opened the puzzle, guessed a few times and never came back is recorded as a
    // failure instead of vanishing. While the day is still current the game may
    // yet be finished, so it is left unrecorded (a later edit re-ingests it). The
    // partial grid is dropped so it cannot be borrowed onto a row the next-day
    // summary later marks solved.
    if (!grid.complete) {
      if (number >= currentNumber(ctx.timeZone)) return null;
      return [{ number, guesses: 6, solved: false, hardMode: null, grid: null, player: who }];
    }

    return [
      {
        number,
        guesses: grid.guesses,
        solved: grid.solved,
        hardMode: null,
        grid: grid.patterns,
        player: who,
      },
    ];
  }
}

export const activityImageParser = new ActivityImageParser();
