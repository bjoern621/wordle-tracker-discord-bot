import type { BotCommand } from './command.js';
import { leaderboardCommand } from './leaderboard.command.js';
import { statsCommand } from './stats.command.js';
import { historyCommand } from './history.command.js';
import { compareCommand } from './compare.command.js';
import { shareCommand } from './share.command.js';
import { backfillCommand } from './backfill.command.js';
import { setChannelCommand } from './set-channel.command.js';

export type { BotCommand } from './command.js';

export const commands: readonly BotCommand[] = [
  leaderboardCommand,
  statsCommand,
  historyCommand,
  compareCommand,
  shareCommand,
  backfillCommand,
  setChannelCommand,
];
