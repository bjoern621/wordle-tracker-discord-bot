// Resolves daily-summary participants to a user id. Summaries list players as
// either <@id> mentions or plain @nickname text. Plain names are matched against
// learned identities (from interaction metadata), the guild member list, and any
// manual aliases from config.

import { config } from './config.js';

const idToName = new Map(); // id -> preferred display name
const nameToId = new Map(); // lowercased name -> id

function index(name, id) {
  if (name) nameToId.set(name.toLowerCase(), id);
}

export function learnUser(user) {
  if (!user?.id) return;
  idToName.set(user.id, user.globalName || user.username || user.id);
  index(user.globalName, user.id);
  index(user.username, user.id);
}

export async function syncGuild(guild) {
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
    console.error('Member sync failed (is the Server Members intent enabled?):', err.message);
  }
}

export function displayName(id) {
  return idToName.get(id) || null;
}

// participant is { id } or { name }. Returns { id, name } or null if unresolved.
export function resolve(participant) {
  if (participant.id) {
    return { id: participant.id, name: displayName(participant.id) || participant.id };
  }
  const key = participant.name.toLowerCase();
  const id = config.aliases.get(key) || nameToId.get(key);
  if (id) return { id, name: displayName(id) || participant.name };
  return null;
}

// Stable fallback id for a name that cannot be resolved, so the result is still
// recorded rather than dropped. Merges automatically once an alias is added.
export function syntheticId(name) {
  return { id: `name:${name.toLowerCase()}`, name };
}
