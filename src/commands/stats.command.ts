import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserResults } from '../db/results.repository.js';
import { periodRange } from '../domain/wordle.js';
import { summarize, pct, fixed } from '../stats/stats.js';
import { renderStatsPng, type StatTile, type StatBar } from '../render/stats-image.js';
import { greenFor, FAILED } from '../render/theme.js';
import { config } from '../config/index.js';
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

    const tiles: StatTile[] = [
      { label: 'Games', value: String(s.games) },
      { label: 'Win rate', value: `${pct(s.winRate)} (${s.wins})` },
      { label: 'Avg score', value: fixed(s.avgScore) },
      { label: 'Best', value: s.best ? `${s.best}/6` : '-' },
      { label: 'Current streak', value: String(s.current) },
      { label: 'Longest streak', value: String(s.longest) },
      { label: 'Hard mode', value: `${pct(s.hardMode / s.games)} (${s.hardMode})` },
    ];

    const bars: StatBar[] = s.distribution.map((count, i) => ({
      label: String(i + 1),
      count,
      share: s.games ? count / s.games : 0,
      color: greenFor(i + 1),
    }));
    bars.push({
      label: 'X',
      count: s.fails,
      share: s.games ? s.fails / s.games : 0,
      color: FAILED,
    });

    const png = renderStatsPng({ name: user.username, period: PERIOD_LABEL[period], tiles, bars });
    const file = new AttachmentBuilder(png, { name: 'stats.png' });
    await interaction.reply({ files: [file] });
  },
};
