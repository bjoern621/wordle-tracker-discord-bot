// Static, environment-independent constants shared across the bot.

/**
 * Official Discord Wordle Activity application id. Its messages carry the player
 * in `interactionMetadata.user`, a result-grid image, and a once-a-day summary
 * listing everyone's score for the previous day.
 */
export const OFFICIAL_WORDLE_APP_ID = '1211781489931452447';

/** Embed accent colour (Wordle "correct" green). */
export const EMBED_COLOR = 0x538d4e;

/** How often guild member lists are re-synced for identity resolution. */
export const MEMBER_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Discord returns message history in pages of at most this many messages. */
export const MESSAGE_PAGE_SIZE = 100;

/** Failed games count as this score when averaging (one worse than a 6/6). */
export const FAIL_SCORE = 7;
