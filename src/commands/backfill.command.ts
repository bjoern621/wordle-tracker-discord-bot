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
    const limit = interaction.options.getInteger('limit') || config.backfillLimit;
    const channel = config.channelId
      ? await interaction.client.channels.fetch(config.channelId)
      : interaction.channel;
    if (!channel || !channel.isTextBased()) {
      await interaction.editReply('No readable text channel to scan.');
      return;
    }
    const { processed, stored } = await backfillChannel(channel, limit);
    await interaction.editReply(`Scanned ${processed} messages, stored ${stored} results.`);
  },
};
