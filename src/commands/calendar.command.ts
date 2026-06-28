import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserResults } from '../db/results.repository.js';
import { periodRange } from '../domain/wordle.js';
import { summarize } from '../stats/stats.js';
import { buildCalendar } from '../stats/calendar.js';
import { renderCalendarPng } from '../render/calendar-image.js';
import { config } from '../config/index.js';
import { EMBED_COLOR } from '../constants.js';

/** `/calendar`: a player's last year of Wordle days as a GitHub-style heatmap. */
export const calendarCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('calendar')
    .setDescription("A player's last year of Wordle days, GitHub-style")
    .addUserOption((o) => o.setName('user').setDescription('Player (default: you)')),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user') || interaction.user;
    const [from, to] = periodRange('all');
    const rows = await getUserResults(interaction.guildId!, user.id, from, to);
    if (!rows.length) {
      await interaction.reply(`No results recorded for ${user.username}.`);
      return;
    }

    const calendar = buildCalendar(rows, config.timeZone);
    const file = new AttachmentBuilder(renderCalendarPng(calendar), { name: 'calendar.png' });
    const s = summarize(rows);

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`${user.username} - last 12 months`)
      .setDescription(
        `Solved **${calendar.solved}** of **${calendar.played}** played in the last year.\n` +
          '⬛ not played 🟥 played, no solve 🟩 solved (brighter = fewer guesses)',
      )
      .addFields(
        { name: 'Current streak', value: String(s.current), inline: true },
        { name: 'Longest streak', value: String(s.longest), inline: true },
      )
      .setImage('attachment://calendar.png');

    await interaction.reply({ embeds: [embed], files: [file] });
  },
};
