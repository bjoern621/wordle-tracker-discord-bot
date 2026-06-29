import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { buildLeaderboard } from '../reports/leaderboard-report.js';
import { config } from '../config/index.js';
import { periodOption, customFromOption, customToOption, resolveRange } from './shared.js';

/**
 * `/leaderboard`: ranks players for a chosen period or custom date range. Short
 * spans render a day-by-day grid; longer spans render an aggregate card.
 */
export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Player ranking for a period')
    .addStringOption(periodOption)
    .addStringOption(customFromOption)
    .addStringOption(customToOption),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const range = await resolveRange(interaction, config.timeZone);
    if (!range) return;
    const report = await buildLeaderboard(interaction.guildId!, range.from, range.to, range.label);
    if (!report) {
      await interaction.reply('No Wordle results recorded for that period yet.');
      return;
    }
    await interaction.reply({ content: report.content, files: report.files });
  },
};
