// Shared domain types that cross module boundaries.

import type { Message } from 'discord.js';

/** Source that produced a stored result. Also the parser priority order. */
export type ResultSource = 'summary' | 'text' | 'activity';

/** Leaderboard period selectable in slash commands. */
export type Period = 'all' | 'month' | 'week';

/** A player the parser already knows by id and display name. */
export interface KnownUser {
  id: string;
  name: string;
}

/**
 * Who played a parsed game. `known` is resolved by the parser (share text uses
 * the message author, the activity image uses the interaction user). `participant`
 * is a daily-summary entry that ingest resolves against learned identities.
 */
export type PlayerRef =
  | { kind: 'known'; user: KnownUser }
  | { kind: 'participant'; id?: string; name?: string };

/** One player's finished game extracted from a message, before storage. */
export interface ParsedGame {
  /** Puzzle number (e.g. 1835). */
  number: number;
  /** Guesses used (1-6); 6 for a failed game. */
  guesses: number;
  solved: boolean;
  /** Per-guess colour rows (B/Y/G), or null when the source carries no grid. */
  grid: string[] | null;
  /** Hard mode flag, or null when the source does not report it. */
  hardMode: boolean | null;
  player: PlayerRef;
}

/** Context handed to every parser for a single message. */
export interface ParseContext {
  timeZone: string;
  enableActivityImage: boolean;
}

/**
 * Strategy contract for turning a Discord message into Wordle games. Parsers are
 * tried in registry order; the first to return a non-empty list wins.
 */
export interface WordleParser {
  /** Stored in `results.source` for games this parser produces. */
  readonly source: ResultSource;
  /** Returns the games carried by the message, or null when it does not apply. */
  parse(message: Message, ctx: ParseContext): Promise<ParsedGame[] | null>;
}

/** Outcome of ingesting one message. */
export interface IngestOutcome {
  source: ResultSource;
  count: number;
  /** True when a stored result's score changed (used to pick the reaction). */
  changed: boolean;
}
