import type { BotCommand } from './command.js';
import { leaderboardCommand } from './leaderboard.command.js';
import { statsCommand } from './stats.command.js';
import { calendarCommand } from './calendar.command.js';
import { distributionCommand } from './distribution.command.js';
import { compareCommand } from './compare.command.js';
import { backfillCommand } from './backfill.command.js';
import { setChannelCommand } from './set-channel.command.js';

export type { BotCommand } from './command.js';

export const commands: readonly BotCommand[] = [
  leaderboardCommand,
  statsCommand,
  calendarCommand,
  distributionCommand,
  compareCommand,
  backfillCommand,
  setChannelCommand,
];
