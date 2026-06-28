// In-memory view of each guild's tracked channel, backed by the guild_settings
// table. Ingest checks this on every message, so it stays in memory rather than
// hitting the database per message. Loaded once on startup and kept in sync as
// /set-channel runs.

import {
  getAllGuildChannels,
  upsertGuildChannel,
  type GuildChannel,
} from '../db/guild-settings.repository.js';

const channels = new Map<string, string>(); // guild_id -> channel_id

/** Loads all persisted guild settings into memory. Call once on startup. */
export async function loadGuildChannels(): Promise<void> {
  channels.clear();
  for (const { guildId, channelId } of await getAllGuildChannels()) {
    channels.set(guildId, channelId);
  }
}

/** The channel the bot tracks in a guild, or null if none is set. */
export function trackedChannel(guildId: string): string | null {
  return channels.get(guildId) ?? null;
}

/** Every configured guild and its channel. */
export function trackedChannels(): GuildChannel[] {
  return [...channels].map(([guildId, channelId]) => ({ guildId, channelId }));
}

/** Persists and caches the tracked channel for a guild. */
export async function setTrackedChannel(guildId: string, channelId: string): Promise<void> {
  await upsertGuildChannel(guildId, channelId);
  channels.set(guildId, channelId);
}
