import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserResults } from '../db/results.repository.js';
import { periodRange } from '../domain/wordle.js';
import { summarize, histogram, pct, fixed } from '../stats/stats.js';
import { config } from '../config/index.js';
import { EMBED_COLOR } from '../constants.js';
import { periodOption, PERIOD_LABEL, periodFrom } from './shared.js';

/** `/stats`: detailed per-player figures (win rate, averages, streaks, distribution) for a period. */
export const statsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Detailed stats for a player')
    .addUserOption((o) => o.setName('user').setDescription('Player (default: you)'))
    .addStringOption(periodOption),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user') || interaction.user;
    const period = periodFrom(interaction.options.getString('period'));
    const [from, to] = periodRange(period, config.timeZone);
    const rows = await getUserResults(interaction.guildId!, user.id, from, to);
    if (!rows.length) {
      await interaction.reply(`No results recorded for ${user.username} in that period.`);
      return;
    }
    const s = summarize(rows);
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`${user.username} - ${PERIOD_LABEL[period]}`)
      .addFields(
        { name: 'Games', value: String(s.games), inline: true },
        { name: 'Win rate', value: `${pct(s.winRate)} (${s.wins}/${s.games})`, inline: true },
        { name: 'Avg guesses', value: fixed(s.avgGuesses), inline: true },
        { name: 'Avg score', value: fixed(s.avgScore), inline: true },
        { name: 'Best', value: s.best ? `${s.best}/6` : '-', inline: true },
        { name: 'Fails', value: String(s.fails), inline: true },
        { name: 'Current streak', value: String(s.current), inline: true },
        { name: 'Longest streak', value: String(s.longest), inline: true },
        { name: 'Guess distribution', value: '```\n' + histogram(s.distribution) + '\n```' },
      );
    await interaction.reply({ embeds: [embed] });
  },
};
