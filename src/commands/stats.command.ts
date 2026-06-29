import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserResults } from '../db/results.repository.js';
import { summarize } from '../stats/stats.js';
import { pct, fixed } from '../stats/format.js';
import { renderStatsPng, type StatTile, type StatBar } from '../render/stats-image.js';
import { greenFor, FAILED } from '../render/theme.js';
import { config } from '../config/index.js';
import { periodOption, customFromOption, customToOption, resolveRange } from './shared.js';

/** `/stats`: detailed per-player figures (win rate, averages, streaks, distribution) for a period. */
export const statsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Detailed stats for a player')
    .addUserOption((o) => o.setName('user').setDescription('Player (default: you)'))
    .addStringOption(periodOption)
    .addStringOption(customFromOption)
    .addStringOption(customToOption),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user') || interaction.user;
    const range = await resolveRange(interaction, config.timeZone);
    if (!range) return;
    const rows = await getUserResults(interaction.guildId!, user.id, range.from, range.to);
    if (!rows.length) {
      await interaction.reply(`No results recorded for ${user.username} in that period.`);
      return;
    }
    const s = summarize(rows);

    const tiles: StatTile[] = [
      { label: 'Games', value: String(s.games) },
      { label: 'Win rate', value: `${pct(s.winRate)} (${s.wins})` },
      { label: 'Avg score', value: fixed(s.avgScore) },
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

    const png = renderStatsPng({ name: user.username, period: range.label, tiles, bars });
    const file = new AttachmentBuilder(png, { name: 'stats.png' });
    await interaction.reply({ files: [file] });
  },
};
