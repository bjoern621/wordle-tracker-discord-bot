// Parser registry. Each parser gates on the message's author and format, so for
// any real message at most one applies. Ingest tries them in order and stops at
// the first that returns games; the order is a tiebreaker should two parsers'
// guards ever overlap, preferring richer sources: daily summary, then manual
// share text, then Scoredle share text, then the per-game activity image.

import type { WordleParser } from '../types.js';
import { dailySummaryParser } from './daily-summary.parser.js';
import { shareTextParser } from './share-text.parser.js';
import { scoredleTextParser } from './scoredle-text.parser.js';
import { activityImageParser } from './activity-image.parser.js';

export const parsers: readonly WordleParser[] = [
  dailySummaryParser,
  shareTextParser,
  scoredleTextParser,
  activityImageParser,
];
