import type { SlashCommandStringOption } from 'discord.js';
import { PERIODS, PERIOD_LABEL } from '../domain/wordle.js';

export { PERIOD_LABEL, periodFrom } from '../domain/wordle.js';

/** Shared "period" string option used by the leaderboard and stats commands. */
export function periodOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return option
    .setName('period')
    .setDescription('Time range (default: all time)')
    .addChoices(...PERIODS.map((value) => ({ name: PERIOD_LABEL[value], value })));
}
