import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { getResultsByDay } from '../db/results.repository.js';
import { periodRange, numberToIso, isoToNumber } from '../domain/wordle.js';
import { buildWeeklyGrid, fixed } from '../stats/stats.js';
import { renderWeeklyPng, type WeeklyImageRow } from '../render/weekly-image.js';
import { config } from '../config/index.js';

// "1835" -> "Mon" for that puzzle's calendar date.
function weekdayShort(number: number): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${numberToIso(number)}T00:00:00Z`),
  );
}

// "1835" -> "Jun 28".
function dateLabel(number: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${numberToIso(number)}T00:00:00Z`),
  );
}

/** `/weekly`: this week's results as one day-by-day row per player who played. */
export const weeklyCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('weekly')
    .setDescription("This week's results, one day-by-day row per player"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const [from, to] = periodRange('week', config.timeZone);
    const rows = await getResultsByDay(interaction.guildId!, from, to);
    if (!rows.length) {
      await interaction.reply('No Wordle results recorded this week yet.');
      return;
    }

    // Always show the whole week, Monday through Sunday, even on days nobody played.
    const monday = isoToNumber(from);
    const weekNumbers = Array.from({ length: 7 }, (_, i) => monday + i);
    const grid = buildWeeklyGrid(rows, weekNumbers);
    const first = grid.numbers[0];
    const last = grid.numbers[grid.numbers.length - 1];
    const range = first === last ? `#${first}` : `#${first}-${last}`;
    const span = first === last ? dateLabel(first) : `${dateLabel(first)} - ${dateLabel(last)}`;

    const columns = grid.numbers.map((n) => ({
      weekday: weekdayShort(n),
      day: Number(numberToIso(n).slice(8, 10)),
    }));
    const imageRows: WeeklyImageRow[] = grid.players.map((p) => ({
      name: p.username || p.userId,
      avg: fixed(p.avgScore),
      cells: grid.numbers.map((n) => p.byNumber.get(n) ?? null),
    }));

    const png = renderWeeklyPng({ title: `Weekly Wordle - ${range}`, span, columns, rows: imageRows });
    const file = new AttachmentBuilder(png, { name: 'weekly.png' });
    await interaction.reply({
      content: 'Brighter green = fewer guesses. Red = failed. avg counts fails as 7.',
      files: [file],
    });
  },
};
