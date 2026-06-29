import type { Message } from 'discord.js';
import type { IngestOutcome, KnownUser, ParseContext, ParsedGame, PlayerRef, ResultSource } from '../types.js';
import { parsers } from '../parsers/index.js';
import { recordResult } from '../db/results.repository.js';
import { numberToIso, rejectFuturePuzzles } from '../domain/wordle.js';
import { learnUser, resolve, syntheticId } from '../identity/identity.js';
import { trackedChannel } from '../settings/guild-channels.js';
import { config } from '../config/index.js';

function messageTimestamp(message: Message): Date {
  return message.editedAt ?? message.createdAt; // most recent wins on conflict
}

// Index whoever appears on the message so later summaries can resolve plain @names.
function learnFrom(guildId: string, message: Message): void {
  if (message.interactionMetadata?.user) learnUser(guildId, message.interactionMetadata.user);
  if (message.author && !message.author.bot) learnUser(guildId, message.author);
}

function resolvePlayer(guildId: string, ref: PlayerRef, unresolved: string[]): KnownUser {
  if (ref.kind === 'known') return ref.user;
  const resolved = resolve(guildId, ref);
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
  for (const game of games) {
    const who = resolvePlayer(guildId, game.player, unresolved);
    await recordResult({
      guildId,
      userId: who.id,
      puzzleNumber: game.number,
      puzzleDate: numberToIso(game.number),
      guesses: game.guesses,
      solved: game.solved,
      grid: game.grid ? JSON.stringify(game.grid) : null,
      words: game.words ? JSON.stringify(game.words) : null,
      answer: game.answer,
      hardMode: game.hardMode,
      firstGuessAt: game.firstGuessAt,
      lastGuessAt: game.lastGuessAt,
      source,
      messageTs: ts,
      username: who.name,
      messageId: message.id,
    });
  }
  if (unresolved.length) {
    console.warn(`#${games[0]?.number}: unresolved ${unresolved.join(', ')} (set PLAYER_ALIASES)`);
  }
  return { source, count: games.length };
}

/**
 * Inspects one message, stores any Wordle result(s) it carries, and reports the
 * outcome or null. Only messages in a guild's configured channel (set with
 * /set-channel) are considered; a guild with no channel is ignored. Keyed
 * (guild, user, puzzle), so results never double-count; the most recent message
 * wins on conflict.
 */
export async function ingestMessage(message: Message): Promise<IngestOutcome | null> {
  const guildId = message.guildId;
  if (!guildId) return null;
  if (message.channelId !== trackedChannel(guildId)) return null;

  learnFrom(guildId, message);

  const ctx: ParseContext = { timeZone: config.timeZone, enableActivityImage: config.enableActivityImage };
  const ts = messageTimestamp(message);

  for (const parser of parsers) {
    const games = await parser.parse(message, ctx);
    if (!games || !games.length) continue;
    // A puzzle dated after today cannot have been played yet; drop it so a typo or
    // a future-dated share text never inflates streaks or stats.
    const { kept, dropped } = rejectFuturePuzzles(games, config.timeZone);
    for (const game of dropped) {
      console.warn(`Ignoring future puzzle #${game.number} from ${parser.source}.`);
    }
    // The message matched this parser; if every game was a future puzzle there is
    // nothing to store, and no other parser will match the same content.
    if (!kept.length) return null;
    return storeGames(parser.source, kept, message, guildId, ts);
  }
  return null;
}
