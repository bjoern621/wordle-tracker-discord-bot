import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from './command.js';
import { setTrackedChannel } from '../settings/guild-channels.js';

/**
 * `/set-channel`: picks the channel the bot tracks Wordle results in for this
 * server. The choice is stored in the database, so the bot resumes tracking the
 * same channel after a restart. Until a channel is set, the bot ignores the
 * server entirely. Admin only.
 */
export const setChannelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('set-channel')
    .setDescription('Choose the channel the bot tracks Wordle results in (admin)')
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel to track (default: this channel)')
        .addChannelTypes(ChannelType.GuildText),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'Run this in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: 'Pick a text channel.', flags: MessageFlags.Ephemeral });
      return;
    }
    await setTrackedChannel(interaction.guildId, channel.id);
    await interaction.reply({
      content: `Now tracking Wordle results in <#${channel.id}>. Run \`/backfill\` to import past results.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
