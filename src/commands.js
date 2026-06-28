import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { getResults, getUserResults } from './db.js';
import { periodRange } from './wordle.js';
import { summarize, headToHead, histogram, pct, fixed, aggregateLeaderboard } from './stats.js';
import { backfillChannel } from './backfill.js';
import { config } from './config.js';

const PERIOD_OPTION = (option) =>
  option
    .setName('period')
    .setDescription('Time range (default: all time)')
    .addChoices(
      { name: 'All time', value: 'all' },
      { name: 'This month', value: 'month' },
      { name: 'This week', value: 'week' },
    );

const PERIOD_LABEL = { all: 'All time', month: 'This month', week: 'This week' };
const COLOR = 0x538d4e;

const leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Ranking of all players by average score')
    .addStringOption(PERIOD_OPTION),
  async execute(interaction) {
    const period = interaction.options.getString('period') || 'all';
    const [from, to] = periodRange(period, config.timeZone);
    const rows = aggregateLeaderboard(await getResults(interaction.guildId, from, to));
    if (!rows.length) {
      await interaction.reply('No Wordle results recorded for that period yet.');
      return;
    }
    const lines = rows.map((r, i) => {
      const name = (r.username || r.userId).slice(0, 16).padEnd(16);
      const wr = r.games ? Math.round((r.wins / r.games) * 100) : 0;
      return `${String(i + 1).padStart(2)}. ${name} ${String(r.games).padStart(3)}g ${String(wr).padStart(3)}%  avg ${fixed(r.avgScore)}`;
    });
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`Wordle Leaderboard - ${PERIOD_LABEL[period]}`)
      .setDescription('```\n' + lines.join('\n') + '\n```')
      .setFooter({ text: 'avg = average score, failed games count as 7' });
    await interaction.reply({ embeds: [embed] });
  },
};

const stats = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Detailed stats for a player')
    .addUserOption((o) => o.setName('user').setDescription('Player (default: you)'))
    .addStringOption(PERIOD_OPTION),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const period = interaction.options.getString('period') || 'all';
    const [from, to] = periodRange(period, config.timeZone);
    const rows = await getUserResults(interaction.guildId, user.id, from, to);
    if (!rows.length) {
      await interaction.reply(`No results recorded for ${user.username} in that period.`);
      return;
    }
    const s = summarize(rows);
    const embed = new EmbedBuilder()
      .setColor(COLOR)
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

const distribution = {
  data: new SlashCommandBuilder()
    .setName('distribution')
    .setDescription('Guess distribution for a player')
    .addUserOption((o) => o.setName('user').setDescription('Player (default: you)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const [from, to] = periodRange('all');
    const rows = await getUserResults(interaction.guildId, user.id, from, to);
    if (!rows.length) {
      await interaction.reply(`No results recorded for ${user.username}.`);
      return;
    }
    const s = summarize(rows);
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`Guess distribution - ${user.username}`)
      .setDescription('```\n' + histogram(s.distribution) + '\n```');
    await interaction.reply({ embeds: [embed] });
  },
};

const compare = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Head-to-head between two players over shared puzzles')
    .addUserOption((o) => o.setName('user1').setDescription('First player').setRequired(true))
    .addUserOption((o) => o.setName('user2').setDescription('Second player (default: you)')),
  async execute(interaction) {
    const u1 = interaction.options.getUser('user1');
    const u2 = interaction.options.getUser('user2') || interaction.user;
    if (u1.id === u2.id) {
      await interaction.reply('Pick two different players to compare.');
      return;
    }
    const [from, to] = periodRange('all');
    const rows1 = await getUserResults(interaction.guildId, u1.id, from, to);
    const rows2 = await getUserResults(interaction.guildId, u2.id, from, to);
    const h = headToHead(rows1, rows2);
    if (h.common === 0) {
      await interaction.reply(`${u1.username} and ${u2.username} have no puzzles in common yet.`);
      return;
    }
    const s1 = summarize(rows1);
    const s2 = summarize(rows2);
    const embed = new EmbedBuilder()
      .setColor(COLOR)
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

const backfill = {
  data: new SlashCommandBuilder()
    .setName('backfill')
    .setDescription('Re-scan channel history for past results (admin)')
    .addIntegerOption((o) =>
      o.setName('limit').setDescription('How many past messages to scan').setMinValue(1).setMaxValue(10000),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const limit = interaction.options.getInteger('limit') || config.backfillLimit;
    const channel = config.channelId
      ? await interaction.client.channels.fetch(config.channelId)
      : interaction.channel;
    const { processed, stored } = await backfillChannel(channel, limit);
    await interaction.editReply(`Scanned ${processed} messages, stored ${stored} results.`);
  },
};

export const commands = [leaderboard, stats, distribution, compare, backfill];
