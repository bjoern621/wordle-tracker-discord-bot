import type { TextBasedChannel } from 'discord.js';
import { MESSAGE_PAGE_SIZE } from '../constants.js';
import { ingestMessage } from './ingest.js';

export interface BackfillResult {
  processed: number;
  stored: number;
}

/**
 * Walks a channel's history newest-to-oldest in pages, ingesting each message.
 * Returns counts of messages seen and results stored.
 */
export async function backfillChannel(channel: TextBasedChannel, limit = 1000): Promise<BackfillResult> {
  let before: string | undefined;
  let remaining = limit;
  let processed = 0;
  let stored = 0;

  while (remaining > 0) {
    const batch = await channel.messages.fetch({ limit: Math.min(MESSAGE_PAGE_SIZE, remaining), before });
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

  return { processed, stored };
}
