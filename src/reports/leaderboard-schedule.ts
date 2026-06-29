// Posts last week's leaderboard to every tracked channel on Monday at 00:05,
// covering the Monday-Sunday week that just ended. The schedule is anchored to
// the group timezone, so the post lands at local 00:05 across DST changes.

import type { Client } from 'discord.js';
import { config } from '../config/index.js';
import { trackedChannels } from '../settings/guild-channels.js';
import { lastWeekRange } from '../domain/wordle.js';
import { nextWeeklyReportTime } from './report-time.js';
import { buildLeaderboard } from './leaderboard-report.js';

const REPORT_HEADING = "📊 Last week's Wordle leaderboard";

// Builds last week's leaderboard for each guild and sends it to that guild's channel.
async function postWeeklyLeaderboards(client: Client): Promise<void> {
  const [from, to] = lastWeekRange(config.timeZone);
  for (const { guildId, channelId } of trackedChannels()) {
    try {
      const report = await buildLeaderboard(guildId, 'week', from, to, REPORT_HEADING);
      if (!report) {
        console.log(`Weekly leaderboard for guild ${guildId}: no results for ${from}..${to}, skipping.`);
        continue;
      }
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel?.isSendable()) {
        console.warn(`Weekly leaderboard: channel ${channelId} for guild ${guildId} is not sendable, skipping.`);
        continue;
      }
      await channel.send({ content: report.content, files: report.files });
      console.log(`Weekly leaderboard posted for guild ${guildId} (${from}..${to}).`);
    } catch (err) {
      console.error(`Weekly leaderboard for guild ${guildId} failed:`, err);
    }
  }
}

/**
 * Arms a one-shot timer for the next Monday 00:05, posts the leaderboard when it
 * fires, then re-arms for the following week. A week is well under the
 * setTimeout range, so a single timer per cycle suffices.
 */
export function scheduleWeeklyLeaderboard(client: Client): void {
  const next = nextWeeklyReportTime(config.timeZone);
  const delay = Math.max(0, next.getTime() - Date.now());
  console.log(`Weekly leaderboard scheduled for ${next.toISOString()} (in ${Math.round(delay / 60_000)} min).`);
  setTimeout(() => {
    void postWeeklyLeaderboards(client);
    scheduleWeeklyLeaderboard(client);
  }, delay);
}
