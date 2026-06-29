import type { ChatInputCommandInteraction, SlashCommandStringOption } from 'discord.js';
import { PERIODS, PERIOD_LABEL, resolvePeriod, type ResolvedPeriod } from '../domain/wordle.js';

/** Shared "period" string option used by the leaderboard and stats commands. */
export function periodOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return option
    .setName('period')
    .setDescription('Time range (default: all time; ignored when from/to are set)')
    .addChoices(...PERIODS.map((value) => ({ name: PERIOD_LABEL[value], value })));
}

/** Custom range start. Pairs with `customToOption` and overrides the period dropdown. */
export function customFromOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return option.setName('from').setDescription('Custom range start, YYYY-MM-DD (use with "to")');
}

/** Custom range end. Pairs with `customFromOption` and overrides the period dropdown. */
export function customToOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return option.setName('to').setDescription('Custom range end, YYYY-MM-DD (use with "from")');
}

/**
 * Resolves the period dropdown and optional custom from/to dates into one range.
 * Replies with a help message and returns null when the custom dates are invalid,
 * so callers can `if (!range) return;`.
 */
export async function resolveRange(
  interaction: ChatInputCommandInteraction,
  timeZone: string,
): Promise<ResolvedPeriod | null> {
  const result = resolvePeriod(
    interaction.options.getString('period'),
    interaction.options.getString('from'),
    interaction.options.getString('to'),
    timeZone,
  );
  if (!result.ok) {
    await interaction.reply(result.error);
    return null;
  }
  return result.range;
}
