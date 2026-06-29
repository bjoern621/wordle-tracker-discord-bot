import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserResults, type UserResultRow } from '../db/results.repository.js';
import { summarize, headToHead, openerStrength } from '../stats/stats.js';
import { pct, fixed, bestLabel, openerLabel } from '../stats/format.js';
import { renderComparePng, type CompareStat, type Lead } from '../render/compare-image.js';
import { config } from '../config/index.js';
import { periodOption, customFromOption, customToOption, resolveRange } from './shared.js';

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
    .addUserOption((o) => o.setName('user2').setDescription('Second player (default: you)'))
    .addStringOption(periodOption)
    .addStringOption(customFromOption)
    .addStringOption(customToOption),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const u1 = interaction.options.getUser('user1', true);
    const u2 = interaction.options.getUser('user2') || interaction.user;
    if (u1.id === u2.id) {
      await interaction.reply('Pick two different players to compare.');
      return;
    }
    const range = await resolveRange(interaction, config.timeZone);
    if (!range) return;
    const rows1 = await getUserResults(interaction.guildId!, u1.id, range.from, range.to);
    const rows2 = await getUserResults(interaction.guildId!, u2.id, range.from, range.to);
    const h = headToHead(rows1, rows2);
    if (h.common === 0) {
      await interaction.reply(`${u1.username} and ${u2.username} have no puzzles in common yet.`);
      return;
    }
    // Every tile except the last is computed over the shared puzzles only, so it
    // lines up with the head-to-head record rather than each player's full run.
    const shared1 = sharedWith(rows1, rows2);
    const shared2 = sharedWith(rows2, rows1);
    const s1 = summarize(shared1);
    const s2 = summarize(shared2);
    const o1 = openerStrength(shared1);
    const o2 = openerStrength(shared2);

    const stats: CompareStat[] = [
      { label: 'Win rate', v1: pct(s1.winRate), v2: pct(s2.winRate), lead: higher(s1.winRate, s2.winRate) },
      { label: 'Avg score', v1: fixed(s1.avgScore), v2: fixed(s2.avgScore), lead: lower(s1.avgScore, s2.avgScore) },
      { label: 'Best', v1: bestLabel(s1.best), v2: bestLabel(s2.best), lead: lower(s1.best, s2.best) },
      { label: 'Opener', v1: openerLabel(o1), v2: openerLabel(o2), lead: higher(o1, o2) },
      { label: 'Longest streak', v1: String(s1.longest), v2: String(s2.longest), lead: higher(s1.longest, s2.longest) },
      // Total games over the whole period (not just shared), so the card shows
      // who plays more beyond the puzzles they have in common.
      { label: 'Games played', v1: String(rows1.length), v2: String(rows2.length), lead: higher(rows1.length, rows2.length) },
    ];

    const png = renderComparePng({
      name1: u1.username,
      name2: u2.username,
      span: range.label,
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
