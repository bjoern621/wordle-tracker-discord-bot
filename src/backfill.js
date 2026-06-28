import { ingestMessage } from './ingest.js';

// Walks a channel's history newest-to-oldest in pages of 100, ingesting each
// message. Returns counts of messages seen and results stored.
export async function backfillChannel(channel, limit = 1000) {
  let before;
  let remaining = limit;
  let processed = 0;
  let stored = 0;

  while (remaining > 0) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, remaining), before });
    if (batch.size === 0) break;

    for (const message of batch.values()) {
      processed += 1;
      // eslint-disable-next-line no-await-in-loop
      const result = await ingestMessage(message);
      if (result) stored += 1;
    }

    before = batch.last().id;
    remaining -= batch.size;
    if (batch.size < 100) break;
  }

  return { processed, stored };
}
