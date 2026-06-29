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

    const number = numberForTimestamp(message.createdAt, ctx.timeZone, 0);
    const who = { kind: 'known' as const, user: { id: player.id, name: player.globalName || player.username } };

    // An unfinished grid is recorded immediately as a failure, on any day: a game
    // in progress counts as not-yet-solved and breaks the streak. The stored guess
    // count is the rows actually played so far (1-5, since a sixth row is a
    // terminal failure, not an unfinished game); solved is false, so the game
    // scores FAIL_SCORE regardless of that count. If the player comes back and
    // finishes, the Activity edits its message; that edit re-ingests with a newer
    // timestamp and overrides this row with the real score (planResultWrite: most
    // recent message wins). The next-day summary is a second correction path when
    // the edit is missed. The partial grid is dropped so it cannot be borrowed onto
    // a row a later summary marks solved.
    if (!grid.complete) {
      return [{ number, guesses: grid.guesses, solved: false, hardMode: null, grid: null, player: who }];
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
