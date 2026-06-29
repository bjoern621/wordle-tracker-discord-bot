import {
  ActionRowBuilder,
  AttachmentBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserResults, type UserResultRow } from '../db/results.repository.js';
import { periodRange, numberToIso } from '../domain/wordle.js';
import { buildMonth } from '../stats/calendar.js';
import { renderMonthPng } from '../render/month-image.js';
import { config } from '../config/index.js';

/** custom_id prefix for the month picker; the suffix is the target user id. */
export const HISTORY_MONTH_SELECT = 'history-month';

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

// "2026-03" -> "March 2026".
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

// Distinct months with a recorded game, oldest first.
function playedMonths(rows: UserResultRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(numberToIso(r.number).slice(0, 7));
  return [...set].sort();
}

function monthMenu(userId: string, months: string[], current: string): Row {
  const recent = [...months].reverse().slice(0, 25); // dropdown caps at 25 options
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${HISTORY_MONTH_SELECT}:${userId}`)
    .setPlaceholder('Jump to a month')
    .addOptions(recent.map((m) => ({ label: monthLabel(m), value: m, default: m === current })));
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu);
}

interface MonthView {
  content: string;
  files: AttachmentBuilder[];
  components: Row[];
}

// Builds the month image plus its navigation. Pure: callers pass the already
// fetched rows and display name so it can serve both the command and the
// component handlers.
function buildMonthView(rows: UserResultRow[], userId: string, name: string, month: string): MonthView {
  const months = playedMonths(rows);
  const data = buildMonth(rows, month, config.timeZone);
  const file = new AttachmentBuilder(renderMonthPng(data), { name: 'month.png' });
  const content = `**${name}**\nSolved **${data.solved}** of **${data.played}** played.`;

  return { content, files: [file], components: [monthMenu(userId, months, month)] };
}

/** `/history`: a player's Wordle month, day-by-day, with prev/next navigation. */
export const historyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription("A player's Wordle results for a month, day-by-day")
    .addUserOption((o) => o.setName('user').setDescription('Player (default: you)')),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user') || interaction.user;
    const [from, to] = periodRange('all');
    const rows = await getUserResults(interaction.guildId!, user.id, from, to);
    if (!rows.length) {
      await interaction.reply(`No results recorded for ${user.username}.`);
      return;
    }

    const months = playedMonths(rows);
    const current = months[months.length - 1]; // open on the most recent month with games
    await interaction.reply(buildMonthView(rows, user.id, user.username, current));
  },
};

async function rerender(
  interaction: StringSelectMenuInteraction,
  userId: string,
  month: string,
): Promise<void> {
  const [from, to] = periodRange('all');
  const rows = await getUserResults(interaction.guildId!, userId, from, to);
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  const name = user?.username ?? 'Player';
  await interaction.update({ ...buildMonthView(rows, userId, name, month), attachments: [] });
}

/** Month picked from the dropdown: swap the view in place. */
export async function handleHistorySelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const userId = interaction.customId.slice(HISTORY_MONTH_SELECT.length + 1);
  await rerender(interaction, userId, interaction.values[0]);
}
