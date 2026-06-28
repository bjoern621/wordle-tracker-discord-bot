import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { periodRange } from '../domain/wordle.js';
import { buildWeeklyReport } from '../reports/weekly-report.js';
import { config } from '../config/index.js';

/** `/weekly`: this week's results as one day-by-day row per player who played. */
export const weeklyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('weekly')
    .setDescription("This week's results, one day-by-day row per player"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const [from, to] = periodRange('week', config.timeZone);
    const report = await buildWeeklyReport(interaction.guildId!, from, to);
    if (!report) {
      await interaction.reply('No Wordle results recorded this week yet.');
      return;
    }
    await interaction.reply({ content: report.content, files: [report.file] });
  },
};
