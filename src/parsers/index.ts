// Parser registry. Each parser gates on the message's author and format, so for
// any real message at most one applies. Ingest tries them in order and stops at
// the first that returns games; the order is a tiebreaker should two parsers'
// guards ever overlap, preferring richer sources: pasted /status text (the only
// source with the guessed words), then the daily summary, then manual share text,
// then Scoredle share text, then the per-game activity image. The /status header
// also matches the manual-share pattern, so it must be tried first.

import type { WordleParser } from '../types.js';
import { statusTextParser } from './status-text.parser.js';
import { dailySummaryParser } from './daily-summary.parser.js';
import { shareTextParser } from './share-text.parser.js';
import { scoredleTextParser } from './scoredle-text.parser.js';
import { activityImageParser } from './activity-image.parser.js';

export const parsers: readonly WordleParser[] = [
  statusTextParser,
  dailySummaryParser,
  shareTextParser,
  scoredleTextParser,
  activityImageParser,
];
