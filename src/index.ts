import { Events, MessageFlags, type Client, type Message } from 'discord.js';
import { config } from './config/index.js';
import { createClient } from './discord/client.js';
import { ingestMessage } from './ingest/ingest.js';
import { backfillChannel } from './ingest/backfill.js';
import { commands } from './commands/index.js';
import { syncGuild } from './identity/identity.js';
import { loadGuildChannels, trackedChannels } from './settings/guild-channels.js';
import { MEMBER_SYNC_INTERVAL_MS, OFFICIAL_WORDLE_APP_ID } from './constants.js';

const client = createClient();
const commandMap = new Map(commands.map((c) => [c.data.name, c]));

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Re-index members of every guild the bot is in, for identity resolution.
function syncAllGuilds(client: Client): void {
  for (const guild of client.guilds.cache.values()) void syncGuild(guild);
}

// On startup, scan each configured guild's channel history once.
async function backfillConfiguredChannels(client: Client): Promise<void> {
  for (const { guildId, channelId } of trackedChannels()) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      console.warn(`Backfill: channel ${channelId} for guild ${guildId} is not readable, skipping.`);
      continue;
    }
    try {
      console.log(`Backfilling history for guild ${guildId}...`);
      const { processed, stored, limitReached } = await backfillChannel(channel, config.backfillLimit);
      console.log(`Backfill done for guild ${guildId}: scanned ${processed}, stored ${stored}.`);
      if (limitReached) {
        console.warn(
          `Backfill for guild ${guildId} stopped at the ${config.backfillLimit}-message limit; there may be more history to parse. Raise BACKFILL_LIMIT or run /backfill all:true.`,
        );
      }
    } catch (err) {
      console.error(`Backfill on start failed for guild ${guildId}:`, errMessage(err));
    }
  }
}

client.once(Events.ClientReady, async (ready) => {
  console.log(`Logged in as ${ready.user.tag}`);

  await loadGuildChannels();

  // Commands are registered globally so they work in every guild the bot joins,
  // present and future. Per-guild channel selection happens at runtime via
  // /set-channel.
  const data = commands.map((c) => c.data.toJSON());
  await ready.application.commands.set(data);
  console.log(`Registered ${data.length} global slash commands`);

  syncAllGuilds(ready);
  setInterval(() => syncAllGuilds(ready), MEMBER_SYNC_INTERVAL_MS);

  if (config.backfillOnStart) await backfillConfiguredChannels(ready);
});

async function react(message: Message, emoji: string): Promise<void> {
  if (!emoji) return;
  try {
    await message.react(emoji);
  } catch {
    // Best-effort (missing permission, deleted message, etc.).
  }
}

client.on(Events.MessageCreate, async (message) => {
  try {
    const result = await ingestMessage(message);
    if (result) await react(message, result.changed ? config.overrideReaction : config.confirmReaction);
  } catch (err) {
    console.error('Ingest (create) failed:', errMessage(err));
  }
});

// The Activity edits its messages, so a final grid or summary may only appear on
// update. Re-ingest the official bot's edits.
client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
  try {
    const message = newMessage.partial ? await newMessage.fetch() : newMessage;
    if (message.author?.id === OFFICIAL_WORDLE_APP_ID) await ingestMessage(message);
  } catch (err) {
    console.error('Ingest (update) failed:', errMessage(err));
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guildId) return; // commands are server-only
  const command = commandMap.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Command ${interaction.commandName} failed:`, err);
    const content = 'Something went wrong running that command.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => {});
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(config.token);
