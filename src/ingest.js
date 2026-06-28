import { parseShareText, parseActivityMessage, parseDailySummary } from './parsers.js';
import { recordResult } from './db.js';
import { numberToIso } from './wordle.js';
import { learnUser, resolve, syntheticId } from './identity.js';
import { config } from './config.js';

function sourceTs(message) {
  return (message.editedAt ?? message.createdAt).getTime();
}

function store(o) {
  return recordResult({
    guild_id: o.guildId,
    user_id: o.userId,
    puzzle_number: o.number,
    puzzle_date: numberToIso(o.number),
    guesses: o.guesses,
    solved: o.solved ? 1 : 0,
    grid: o.grid ? JSON.stringify(o.grid) : null,
    hard_mode: o.hardMode == null ? null : o.hardMode ? 1 : 0,
    source: o.source,
    source_ts: o.sourceTs,
    username: o.username,
    message_id: o.messageId,
    updated_at: new Date().toISOString(),
  });
}

// Inspects one message, stores any Wordle result(s) it carries, and reports
// { source, count, changed } or null. Keyed (guild, user, puzzle), so results
// never double-count; the most recent message wins on conflict.
export async function ingestMessage(message) {
  if (config.guildId && message.guildId !== config.guildId) return null;
  if (config.channelId && message.channelId !== config.channelId) return null;
  const ts = sourceTs(message);

  if (message.interactionMetadata?.user) learnUser(message.interactionMetadata.user);
  if (message.author && !message.author.bot) learnUser(message.author);

  // 1. Daily summary: one official-bot message listing every player's score.
  const summary = parseDailySummary(message, config.timeZone);
  if (summary) {
    const unresolved = [];
    let changed = false;
    for (const r of summary.results) {
      let who = resolve(r);
      if (!who) {
        unresolved.push(r.name);
        who = syntheticId(r.name);
      }
      const status = store({
        guildId: message.guildId,
        userId: who.id,
        number: summary.number,
        guesses: r.guesses,
        solved: r.solved,
        grid: null,
        hardMode: null,
        source: 'summary',
        username: who.name,
        messageId: message.id,
        sourceTs: ts,
      });
      if (status === 'updated') changed = true;
    }
    if (unresolved.length) {
      console.warn(`Summary #${summary.number}: unresolved ${unresolved.join(', ')} (set PLAYER_ALIASES)`);
    }
    return { source: 'summary', count: summary.results.length, changed };
  }

  // 2. Manual share text from any human (carries the colour grid).
  const text = parseShareText(message.content);
  if (text && message.author && !message.author.system) {
    const status = store({
      guildId: message.guildId,
      userId: message.author.id,
      number: text.number,
      guesses: text.guesses,
      solved: text.solved,
      grid: text.grid,
      hardMode: text.hardMode,
      source: 'text',
      username: message.author.globalName || message.author.username,
      messageId: message.id,
      sourceTs: ts,
    });
    return { source: 'text', count: 1, changed: status === 'updated' };
  }

  // 3. Per-game image, single player, same day (carries the colour grid).
  if (config.enableActivityImage) {
    const activity = await parseActivityMessage(message, config.timeZone);
    if (activity) {
      const status = store({
        guildId: message.guildId,
        userId: activity.user.id,
        number: activity.number,
        guesses: activity.guesses,
        solved: activity.solved,
        grid: activity.grid,
        hardMode: activity.hardMode,
        source: 'activity',
        username: activity.user.name,
        messageId: message.id,
        sourceTs: ts,
      });
      return { source: 'activity', count: 1, changed: status === 'updated' };
    }
  }

  return null;
}
