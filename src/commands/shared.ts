import type { SlashCommandStringOption } from 'discord.js';
import type { Period } from '../types.js';

/** Shared "period" string option used by leaderboard and stats. */
export function periodOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return option
    .setName('period')
    .setDescription('Time range (default: all time)')
    .addChoices(
      { name: 'All time', value: 'all' },
      { name: 'This month', value: 'month' },
      { name: 'This week', value: 'week' },
    );
}

export const PERIOD_LABEL: Record<Period, string> = {
  all: 'All time',
  month: 'This month',
  week: 'This week',
};

/** Narrows a raw option string to a Period, defaulting to all time. */
export function periodFrom(value: string | null): Period {
  return value === 'month' || value === 'week' ? value : 'all';
}
