import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { periodRange } from '../domain/wordle.js';
import { buildLeaderboard } from '../reports/leaderboard-report.js';
import { config } from '../config/index.js';
import { periodOption, periodFrom } from './shared.js';

/**
 * `/leaderboard`: ranks players for a chosen period. Day and week render a
 * day-by-day grid; month, year, and all time render an aggregate card.
 */
export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Player ranking for a period')
    .addStringOption(periodOption),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const period = periodFrom(interaction.options.getString('period'));
    const [from, to] = periodRange(period, config.timeZone);
    const report = await buildLeaderboard(interaction.guildId!, period, from, to);
    if (!report) {
      await interaction.reply('No Wordle results recorded for that period yet.');
      return;
    }
    await interaction.reply({ content: report.content, files: report.files });
  },
};
