import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from './command.js';
import { backfillChannel } from '../ingest/backfill.js';
import { config } from '../config/index.js';

export const backfillCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('backfill')
    .setDescription('Re-scan channel history for past results (admin)')
    .addIntegerOption((o) =>
      o.setName('limit').setDescription('How many past messages to scan').setMinValue(1).setMaxValue(10000),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const limit = interaction.options.getInteger('limit') ?? config.backfillLimit;
    // WORDLE_CHANNEL_ID is required and validated in-guild at startup, so this is
    // always the configured channel of the server the command runs in.
    const channel = await interaction.client.channels.fetch(config.channelId);
    if (!channel?.isTextBased()) {
      await interaction.editReply('The configured channel is no longer a readable text channel.');
      return;
    }
    const { processed, stored } = await backfillChannel(channel, limit);
    await interaction.editReply(`Scanned ${processed} messages, stored ${stored} results.`);
  },
};
