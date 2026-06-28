import type { Message } from 'discord.js';
import type { IngestOutcome, KnownUser, ParseContext, ParsedGame, PlayerRef, ResultSource } from '../types.js';
import { parsers } from '../parsers/index.js';
import { recordResult } from '../db/results.repository.js';
import { numberToIso } from '../domain/wordle.js';
import { learnUser, resolve, syntheticId } from '../identity/identity.js';
import { config } from '../config/index.js';

function messageTimestamp(message: Message): Date {
  return message.editedAt ?? message.createdAt; // most recent wins on conflict
}

// Index whoever appears on the message so later summaries can resolve plain @names.
function learnFrom(message: Message): void {
  if (message.interactionMetadata?.user) learnUser(message.interactionMetadata.user);
  if (message.author && !message.author.bot) learnUser(message.author);
}

function resolvePlayer(ref: PlayerRef, unresolved: string[]): KnownUser {
  if (ref.kind === 'known') return ref.user;
  const resolved = resolve(ref);
  if (resolved) return resolved;
  const label = ref.name ?? ref.id ?? 'unknown';
  unresolved.push(label);
  return syntheticId(label);
}

async function storeGames(
  source: ResultSource,
  games: ParsedGame[],
  message: Message,
  guildId: string,
  ts: Date,
): Promise<IngestOutcome> {
  const unresolved: string[] = [];
  let changed = false;
  for (const game of games) {
    const who = resolvePlayer(game.player, unresolved);
    const status = await recordResult({
      guildId,
      userId: who.id,
      puzzleNumber: game.number,
      puzzleDate: numberToIso(game.number),
      guesses: game.guesses,
      solved: game.solved,
      grid: game.grid ? JSON.stringify(game.grid) : null,
      hardMode: !!game.hardMode,
      source,
      messageTs: ts,
      username: who.name,
      messageId: message.id,
    });
    if (status === 'updated') changed = true;
  }
  if (unresolved.length) {
    console.warn(`#${games[0]?.number}: unresolved ${unresolved.join(', ')} (set PLAYER_ALIASES)`);
  }
  return { source, count: games.length, changed };
}

/**
 * Inspects one message, stores any Wordle result(s) it carries, and reports the
 * outcome or null. Keyed (guild, user, puzzle), so results never double-count;
 * the most recent message wins on conflict.
 */
export async function ingestMessage(message: Message): Promise<IngestOutcome | null> {
  if (config.guildId && message.guildId !== config.guildId) return null;
  if (config.channelId && message.channelId !== config.channelId) return null;
  if (!message.guildId) return null;

  learnFrom(message);

  const ctx: ParseContext = { timeZone: config.timeZone, enableActivityImage: config.enableActivityImage };
  const ts = messageTimestamp(message);

  for (const parser of parsers) {
    const games = await parser.parse(message, ctx);
    if (games && games.length) {
      return storeGames(parser.source, games, message, message.guildId, ts);
    }
  }
  return null;
}
