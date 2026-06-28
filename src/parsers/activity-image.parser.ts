// Per-game image: the Activity's solo "X was playing" message whose attachment
// shows the result grid, sampled into a colour grid. Only solo messages are
// parsed; "X and Y were playing" / "X and N others" produce an ambiguous
// combined image.

import type { Message } from 'discord.js';
import type { ParseContext, ParsedGame, WordleParser } from '../types.js';
import { OFFICIAL_WORDLE_APP_ID } from '../constants.js';
import { numberForTimestamp } from '../domain/wordle.js';
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

    return [
      {
        number: numberForTimestamp(message.createdAt, ctx.timeZone, 0),
        guesses: grid.guesses,
        solved: grid.solved,
        hardMode: null,
        grid: grid.patterns,
        player: { kind: 'known', user: { id: player.id, name: player.globalName || player.username } },
      },
    ];
  }
}

export const activityImageParser = new ActivityImageParser();
