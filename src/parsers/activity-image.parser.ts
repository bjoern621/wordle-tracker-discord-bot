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

    // Every state the image shows is stored with its colour grid, the unfinished
    // game included. An in-progress grid (fewer than six rows, no winning row) is
    // recorded right away as a not-yet-solved loss, on any day: it breaks the
    // streak and scores FAIL_SCORE. Its guess count is the rows actually played so
    // far (1-5, since a sixth row is a terminal failure, not an unfinished game)
    // and its grid is the partial pattern, which has no all-green row. If the
    // player finishes, the Activity edits its message; the edit re-ingests with a
    // newer timestamp and overrides this row with the real score and complete grid
    // (planResultWrite: most recent message wins). The next-day summary is a second
    // correction path when the edit is missed. A correction never keeps the partial
    // grid: the merge only carries a grid between rows of the same outcome, so a
    // partial grid can never end up on a row marked solved (see results-merge.ts).
    return [
      {
        number,
        guesses: grid.guesses,
        solved: grid.solved,
        hardMode: null,
        grid: grid.patterns,
        words: null,
        answer: null,
        player: who,
      },
    ];
  }
}

export const activityImageParser = new ActivityImageParser();
