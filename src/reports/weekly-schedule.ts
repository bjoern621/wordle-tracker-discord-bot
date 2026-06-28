// Posts a weekly results recap to every tracked channel on Monday at 00:05,
// covering the Monday-Sunday week that just ended. The schedule is anchored to
// the group timezone, so the report lands at local 00:05 across DST changes.

import type { Client } from 'discord.js';
import { config } from '../config/index.js';
import { trackedChannels } from '../settings/guild-channels.js';
import { lastWeekRange } from '../domain/wordle.js';
import { nextWeeklyReportTime } from './report-time.js';
import { buildWeeklyReport } from './weekly-report.js';

const REPORT_HEADING = "📊 Last week's Wordle recap";

// Builds last week's report for each guild and sends it to that guild's channel.
async function postWeeklyReports(client: Client): Promise<void> {
  const [from, to] = lastWeekRange(config.timeZone);
  for (const { guildId, channelId } of trackedChannels()) {
    try {
      const report = await buildWeeklyReport(guildId, from, to, REPORT_HEADING);
      if (!report) {
        console.log(`Weekly report for guild ${guildId}: no results for ${from}..${to}, skipping.`);
        continue;
      }
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel?.isSendable()) {
        console.warn(`Weekly report: channel ${channelId} for guild ${guildId} is not sendable, skipping.`);
        continue;
      }
      await channel.send({ content: report.content, files: [report.file] });
      console.log(`Weekly report posted for guild ${guildId} (${from}..${to}).`);
    } catch (err) {
      console.error(`Weekly report for guild ${guildId} failed:`, err);
    }
  }
}

/**
 * Arms a one-shot timer for the next Monday 00:05, posts the recap when it
 * fires, then re-arms for the following week. A week is well under the
 * setTimeout range, so a single timer per cycle suffices.
 */
export function scheduleWeeklyReport(client: Client): void {
  const next = nextWeeklyReportTime(config.timeZone);
  const delay = Math.max(0, next.getTime() - Date.now());
  console.log(`Weekly report scheduled for ${next.toISOString()} (in ${Math.round(delay / 60_000)} min).`);
  setTimeout(() => {
    void postWeeklyReports(client);
    scheduleWeeklyReport(client);
  }, delay);
}
