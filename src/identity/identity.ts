// Resolves daily-summary participants to a user id. Summaries list players as
// either <@id> mentions or plain @nickname text. Plain names are matched against
// learned identities (from interaction metadata), the guild member list, and any
// manual aliases from config.
//
// A user id (a Discord snowflake) is globally unique and authoritative: when a
// participant carries one, it is trusted directly. Names and nicknames are
// ambiguous and scoped to a single server (the same nickname can belong to
// different people in different guilds), so the name indexes are kept per guild
// and every lookup is scoped to the guild the message came from.

import type { Guild, User } from 'discord.js';
import type { KnownUser } from '../types.js';
import { config } from '../config/index.js';

interface GuildIndex {
  idToName: Map<string, string>; // id -> preferred display name in this guild
  nameToId: Map<string, string>; // lowercased name -> id in this guild
}

const guilds = new Map<string, GuildIndex>();

function indexFor(guildId: string): GuildIndex {
  let g = guilds.get(guildId);
  if (!g) {
    g = { idToName: new Map(), nameToId: new Map() };
    guilds.set(guildId, g);
  }
  return g;
}

function index(g: GuildIndex, name: string | null | undefined, id: string): void {
  if (name) g.nameToId.set(name.toLowerCase(), id);
}

export function learnUser(
  guildId: string,
  user: Pick<User, 'id' | 'username' | 'globalName'> | null | undefined,
): void {
  if (!user?.id) return;
  const g = indexFor(guildId);
  g.idToName.set(user.id, user.globalName || user.username || user.id);
  index(g, user.globalName, user.id);
  index(g, user.username, user.id);
}

export async function syncGuild(guild: Guild): Promise<void> {
  try {
    const members = await guild.members.fetch();
    const g = indexFor(guild.id);
    for (const m of members.values()) {
      index(g, m.nickname, m.id);
      index(g, m.displayName, m.id);
      index(g, m.user.globalName, m.id);
      index(g, m.user.username, m.id);
      if (!g.idToName.has(m.id)) g.idToName.set(m.id, m.displayName);
    }
    console.log(`Identity: indexed ${members.size} members of ${guild.name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Member sync failed (is the Server Members intent enabled?):', message);
  }
}

export function displayName(guildId: string, id: string): string | null {
  return guilds.get(guildId)?.idToName.get(id) || null;
}

/** Resolves a participant ({ id } or { name }) to a known user, or null. */
export function resolve(guildId: string, participant: { id?: string; name?: string }): KnownUser | null {
  // A user id is authoritative: trust it directly, only looking up a friendlier
  // display name for it.
  if (participant.id) {
    return { id: participant.id, name: displayName(guildId, participant.id) || participant.id };
  }
  const name = participant.name;
  if (!name) return null;
  const key = name.toLowerCase();
  const id = config.aliases.get(key) || guilds.get(guildId)?.nameToId.get(key);
  if (id) return { id, name: displayName(guildId, id) || name };
  return null;
}

/**
 * Stable fallback id for a name that cannot be resolved, so the result is still
 * recorded rather than dropped. Merges automatically once an alias is added.
 */
export function syntheticId(name: string): KnownUser {
  return { id: `name:${name.toLowerCase()}`, name };
}
