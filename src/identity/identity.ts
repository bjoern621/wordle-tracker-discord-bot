// Resolves daily-summary participants to a user id. Summaries list players as
// either <@id> mentions or plain @nickname text. Plain names are matched against
// learned identities (from interaction metadata), the guild member list, and any
// manual aliases from config.

import type { Guild, User } from 'discord.js';
import type { KnownUser } from '../types.js';
import { config } from '../config/index.js';

const idToName = new Map<string, string>(); // id -> preferred display name
const nameToId = new Map<string, string>(); // lowercased name -> id

function index(name: string | null | undefined, id: string): void {
  if (name) nameToId.set(name.toLowerCase(), id);
}

export function learnUser(user: Pick<User, 'id' | 'username' | 'globalName'> | null | undefined): void {
  if (!user?.id) return;
  idToName.set(user.id, user.globalName || user.username || user.id);
  index(user.globalName, user.id);
  index(user.username, user.id);
}

export async function syncGuild(guild: Guild): Promise<void> {
  try {
    const members = await guild.members.fetch();
    for (const m of members.values()) {
      index(m.nickname, m.id);
      index(m.displayName, m.id);
      index(m.user.globalName, m.id);
      index(m.user.username, m.id);
      if (!idToName.has(m.id)) idToName.set(m.id, m.displayName);
    }
    console.log(`Identity: indexed ${members.size} members of ${guild.name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Member sync failed (is the Server Members intent enabled?):', message);
  }
}

export function displayName(id: string): string | null {
  return idToName.get(id) || null;
}

/** Resolves a participant ({ id } or { name }) to a known user, or null. */
export function resolve(participant: { id?: string; name?: string }): KnownUser | null {
  if (participant.id) {
    return { id: participant.id, name: displayName(participant.id) || participant.id };
  }
  const name = participant.name;
  if (!name) return null;
  const key = name.toLowerCase();
  const id = config.aliases.get(key) || nameToId.get(key);
  if (id) return { id, name: displayName(id) || name };
  return null;
}

/**
 * Stable fallback id for a name that cannot be resolved, so the result is still
 * recorded rather than dropped. Merges automatically once an alias is added.
 */
export function syntheticId(name: string): KnownUser {
  return { id: `name:${name.toLowerCase()}`, name };
}
