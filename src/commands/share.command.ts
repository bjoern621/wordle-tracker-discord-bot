import { AttachmentBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from './command.js';
import { getUserGame, getLatestUserGame } from '../db/results.repository.js';
import { buildShareView, type ShareOptions } from '../share/share-model.js';
import { buildShareText } from '../share/share-text.js';
import { renderSharePng } from '../render/share-image.js';

// Reads the overlay toggles. Hard mode shows by default; everything else is off
// unless asked for, so a bare /share is just the number and the grid.
function readOptions(interaction: ChatInputCommandInteraction): ShareOptions {
  const flag = (name: string, fallback = false) => interaction.options.getBoolean(name) ?? fallback;
  const format = interaction.options.getString('format') === 'text' ? 'text' : 'image';
  return {
    format,
    words: flag('words'),
    wordsLeft: flag('words_left'),
    nextGuess: flag('next_guess'),
    answer: flag('answer'),
    opener: flag('opener'),
    time: flag('time'),
    hardMode: flag('hard_mode', true),
    spoiler: flag('spoiler'),
  };
}

/** `/share`: re-post one of a player's games as an image card or the classic emoji block. */
export const shareCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('share')
    .setDescription('Share a Wordle game as an image or text')
    .addUserOption((o) => o.setName('user').setDescription('Player (default: you)'))
    .addIntegerOption((o) =>
      o.setName('puzzle').setDescription('Puzzle number (default: most recent)').setMinValue(1),
    )
    .addStringOption((o) =>
      o
        .setName('format')
        .setDescription('How to render it (default: image)')
        .addChoices({ name: 'Image', value: 'image' }, { name: 'Text', value: 'text' }),
    )
    .addBooleanOption((o) => o.setName('words').setDescription('Show the guessed words (needs /status)'))
    .addBooleanOption((o) =>
      o.setName('words_left').setDescription('Show candidates remaining per row (needs /status)'),
    )
    .addBooleanOption((o) =>
      o.setName('next_guess').setDescription("Show the solver's best next guess (needs /status)"),
    )
    .addBooleanOption((o) => o.setName('answer').setDescription('Reveal the answer (needs /status)'))
    .addBooleanOption((o) =>
      o.setName('opener').setDescription('Show opener strength (greens+yellows on guess 1)'),
    )
    .addBooleanOption((o) => o.setName('time').setDescription('Show how long the game took, when known'))
    .addBooleanOption((o) => o.setName('hard_mode').setDescription('Show the hard-mode badge (default: on)'))
    .addBooleanOption((o) => o.setName('spoiler').setDescription('Text format: hide the grid behind a spoiler')),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser('user') || interaction.user;
    const puzzle = interaction.options.getInteger('puzzle');

    await interaction.deferReply();

    const row =
      puzzle != null
        ? await getUserGame(interaction.guildId!, user.id, puzzle)
        : await getLatestUserGame(interaction.guildId!, user.id);
    if (!row) {
      await interaction.editReply(
        puzzle != null
          ? `No result recorded for ${user.username} on Wordle ${puzzle}.`
          : `No results recorded for ${user.username} yet.`,
      );
      return;
    }

    const opts = readOptions(interaction);
    const view = buildShareView(row, user.username, opts);

    if (opts.format === 'text') {
      await interaction.editReply({ content: buildShareText(view) });
      return;
    }
    const file = new AttachmentBuilder(renderSharePng(view), { name: 'share.png' });
    await interaction.editReply({ files: [file] });
  },
};
