import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserResults, type UserResultRow } from '../db/results.repository.js';
import { periodRange } from '../domain/wordle.js';
import { summarize, headToHead, pct, fixed } from '../stats/stats.js';
import { renderComparePng, type CompareStat, type Lead } from '../render/compare-image.js';

// Higher value leads; nulls never lead.
function higher(a: number | null, b: number | null): Lead {
  if (a == null && b == null) return 0;
  if (a == null) return 2;
  if (b == null) return 1;
  return a > b ? 1 : b > a ? 2 : 0;
}

// Lower value leads (fewer guesses is better); a null means no games, so it loses.
function lower(a: number | null, b: number | null): Lead {
  if (a == null && b == null) return 0;
  if (a == null) return 2;
  if (b == null) return 1;
  return a < b ? 1 : b < a ? 2 : 0;
}

const best = (n: number | null): string => (n == null ? '-' : `${n}/6`);

// Keeps only the rows for puzzles the other player also played.
function sharedWith(rows: UserResultRow[], other: UserResultRow[]): UserResultRow[] {
  const numbers = new Set(other.map((r) => r.number));
  return rows.filter((r) => numbers.has(r.number));
}

/** `/compare`: head-to-head record and a metric-by-metric card between two players. */
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
    // Tiles compare the two players over their shared puzzles only, so they
    // line up with the head-to-head record rather than each player's full run.
    const s1 = summarize(sharedWith(rows1, rows2));
    const s2 = summarize(sharedWith(rows2, rows1));

    const stats: CompareStat[] = [
      { label: 'Win rate', v1: pct(s1.winRate), v2: pct(s2.winRate), lead: higher(s1.winRate, s2.winRate) },
      { label: 'Avg score', v1: fixed(s1.avgScore), v2: fixed(s2.avgScore), lead: lower(s1.avgScore, s2.avgScore) },
      { label: 'Best', v1: best(s1.best), v2: best(s2.best), lead: lower(s1.best, s2.best) },
      { label: 'Current streak', v1: String(s1.current), v2: String(s2.current), lead: higher(s1.current, s2.current) },
      { label: 'Longest streak', v1: String(s1.longest), v2: String(s2.longest), lead: higher(s1.longest, s2.longest) },
    ];

    const png = renderComparePng({
      name1: u1.username,
      name2: u2.username,
      span: 'All time',
      shared: h.common,
      w1: h.w1,
      w2: h.w2,
      draw: h.draw,
      stats,
    });
    const file = new AttachmentBuilder(png, { name: 'compare.png' });
    await interaction.reply({ files: [file] });
  },
};
