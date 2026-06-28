import type { TextBasedChannel } from 'discord.js';
import { MESSAGE_PAGE_SIZE } from '../constants.js';
import { ingestMessage } from './ingest.js';

export interface BackfillResult {
  processed: number;
  stored: number;
  /**
   * True when the scan stopped because it reached `limit` rather than the end of
   * the channel history, meaning older messages may still be unparsed.
   */
  limitReached: boolean;
}

/**
 * Walks a channel's history newest-to-oldest in pages, ingesting each message.
 * Returns counts of messages seen and results stored. Pass `limit` as undefined
 * to scan the entire history.
 */
export async function backfillChannel(channel: TextBasedChannel, limit?: number): Promise<BackfillResult> {
  const unlimited = limit === undefined;
  let before: string | undefined;
  let remaining = limit ?? Infinity;
  let processed = 0;
  let stored = 0;

  while (remaining > 0) {
    const pageSize = unlimited ? MESSAGE_PAGE_SIZE : Math.min(MESSAGE_PAGE_SIZE, remaining);
    const batch = await channel.messages.fetch({ limit: pageSize, before });
    if (batch.size === 0) break;

    for (const message of batch.values()) {
      processed += 1;
      const result = await ingestMessage(message);
      if (result) stored += 1;
    }

    before = batch.last()?.id;
    remaining -= batch.size;
    if (batch.size < MESSAGE_PAGE_SIZE) break;
  }

  // A short final page means history ran out; otherwise the loop ended because
  // `remaining` hit 0, so there may be older messages beyond the limit.
  return { processed, stored, limitReached: !unlimited && remaining <= 0 };
}
