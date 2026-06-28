// Data access for the `guild_settings` table. One row per guild, naming the
// channel the bot tracks Wordle results in there.

import { pool } from './pool.js';

export interface GuildChannel {
  guildId: string;
  channelId: string;
}

/** Every guild's configured channel. Loaded into memory once on startup. */
export async function getAllGuildChannels(): Promise<GuildChannel[]> {
  const { rows } = await pool.query<GuildChannel>(
    `SELECT guild_id AS "guildId", channel_id AS "channelId" FROM guild_settings`,
  );
  return rows;
}

/** Sets (or replaces) the tracked channel for a guild. */
export async function upsertGuildChannel(guildId: string, channelId: string): Promise<void> {
  await pool.query(
    `INSERT INTO guild_settings (guild_id, channel_id, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (guild_id) DO UPDATE SET
       channel_id = excluded.channel_id,
       updated_at = now()`,
    [guildId, channelId],
  );
}
