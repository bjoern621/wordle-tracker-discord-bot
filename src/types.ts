// Shared domain types that cross module boundaries.

import type { Message } from 'discord.js';

/** Source that produced a stored result. */
export type ResultSource = 'summary' | 'share-text' | 'scoredle' | 'activity' | 'status';

/** Leaderboard period selectable in slash commands. */
export type Period = 'all' | 'year' | 'month' | 'week' | 'lastweek' | 'day';

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
  /**
   * Rows played (1-6). A win or a failed game on the last guess fills all 6 rows,
   * so `solved` distinguishes them. An unfinished game carries its partial row
   * count (1-5), not 6; it still scores as a loss because `solved` is false.
   */
  guesses: number;
  solved: boolean;
  /** Per-guess colour rows (B/Y/G), or null when the source carries no grid. */
  grid: string[] | null;
  /**
   * The word guessed on each row, lowercase, one per grid row. Only a pasted
   * /status reveals the letters; every other source carries null.
   */
  words: string[] | null;
  /** The puzzle's answer, lowercase, or null when the source does not reveal it. */
  answer: string | null;
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
 * Strategy contract for turning a Discord message into Wordle games. Each parser
 * recognizes its own format and returns null for messages it does not apply to.
 * Ingest tries them in registry order and takes the first non-empty result.
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
}
