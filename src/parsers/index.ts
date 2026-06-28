// Parser registry. Ingest tries each parser in order and stops at the first that
// returns games, so order is priority: daily summary, then manual share text,
// then the per-game activity image.

import type { WordleParser } from '../types.js';
import { dailySummaryParser } from './daily-summary.parser.js';
import { shareTextParser } from './share-text.parser.js';
import { activityImageParser } from './activity-image.parser.js';

export const parsers: readonly WordleParser[] = [
  dailySummaryParser,
  shareTextParser,
  activityImageParser,
];
