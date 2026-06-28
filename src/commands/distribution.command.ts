import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserResults } from '../db/results.repository.js';
import { periodRange } from '../domain/wordle.js';
import { summarize, histogram } from '../stats/stats.js';
import { EMBED_COLOR } from '../constants.js';

/** `/distribution`: histogram of a player's guess counts across all puzzles. */
export const distributionCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('distribution')
    .setDescription('Guess distribution for a player')
    .addUserOption((o) => o.setName('user').setDescription('Player (default: you)')),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user') || interaction.user;
    const [from, to] = periodRange('all');
    const rows = await getUserResults(interaction.guildId!, user.id, from, to);
    if (!rows.length) {
      await interaction.reply(`No results recorded for ${user.username}.`);
      return;
    }
    const s = summarize(rows);
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`Guess distribution - ${user.username}`)
      .setDescription('```\n' + histogram(s.distribution) + '\n```');
    await interaction.reply({ embeds: [embed] });
  },
};
