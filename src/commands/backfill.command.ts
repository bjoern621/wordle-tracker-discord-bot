import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from './command.js';
import { backfillChannel } from '../ingest/backfill.js';
import { trackedChannel } from '../settings/guild-channels.js';
import { config } from '../config/index.js';

/** `/backfill`: admin-only re-scan of channel history to store past results. */
export const backfillCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('backfill')
    .setDescription('Re-scan channel history for past results (admin)')
    .addIntegerOption((o) =>
      o.setName('limit').setDescription('How many past messages to scan').setMinValue(1).setMaxValue(10000),
    )
    .addBooleanOption((o) =>
      o.setName('all').setDescription('Scan the entire channel history (ignores limit)'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channelId = interaction.guildId ? trackedChannel(interaction.guildId) : null;
    if (!channelId) {
      await interaction.editReply('No channel is set for this server yet. Run `/set-channel` first.');
      return;
    }
    const scanAll = interaction.options.getBoolean('all') ?? false;
    const limit = scanAll ? undefined : interaction.options.getInteger('limit') ?? config.backfillLimit;
    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      await interaction.editReply('The configured channel is no longer a readable text channel.');
      return;
    }
    const { processed, stored, limitReached } = await backfillChannel(channel, limit);
    let reply = `Scanned ${processed} messages, stored ${stored} results.`;
    if (limitReached) {
      reply += ` Reached the ${limit}-message limit, there may be more messages to parse. Raise \`limit\` or run with \`all: true\`.`;
    }
    await interaction.editReply(reply);
  },
};
