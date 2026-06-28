import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserResults } from '../db/results.repository.js';
import { periodRange } from '../domain/wordle.js';
import { summarize, headToHead, fixed } from '../stats/stats.js';
import { EMBED_COLOR } from '../constants.js';

/** `/compare`: head-to-head record and average scores between two players over shared puzzles. */
export const compareCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Head-to-head between two players over shared puzzles')
    .addUserOption((o) => o.setName('user1').setDescription('First player').setRequired(true))
    .addUserOption((o) => o.setName('user2').setDescription('Second player (default: you)')),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const u1 = interaction.options.getUser('user1', true);
    const u2 = interaction.options.getUser('user2') || interaction.user;
    if (u1.id === u2.id) {
      await interaction.reply('Pick two different players to compare.');
      return;
    }
    const [from, to] = periodRange('all');
    const rows1 = await getUserResults(interaction.guildId!, u1.id, from, to);
    const rows2 = await getUserResults(interaction.guildId!, u2.id, from, to);
    const h = headToHead(rows1, rows2);
    if (h.common === 0) {
      await interaction.reply(`${u1.username} and ${u2.username} have no puzzles in common yet.`);
      return;
    }
    const s1 = summarize(rows1);
    const s2 = summarize(rows2);
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`${u1.username} vs ${u2.username}`)
      .setDescription(
        `Shared puzzles: **${h.common}**\n` +
          `Wins: **${u1.username} ${h.w1}** - **${h.w2} ${u2.username}** (draws ${h.draw})`,
      )
      .addFields(
        { name: `${u1.username} avg score`, value: fixed(s1.avgScore), inline: true },
        { name: `${u2.username} avg score`, value: fixed(s2.avgScore), inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  },
};
