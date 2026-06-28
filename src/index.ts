import { Events, MessageFlags, type Message } from 'discord.js';
import { config } from './config/index.js';
import { createClient } from './discord/client.js';
import { ingestMessage } from './ingest/ingest.js';
import { backfillChannel } from './ingest/backfill.js';
import { commands } from './commands/index.js';
import { syncGuild } from './identity/identity.js';
import { MEMBER_SYNC_INTERVAL_MS, OFFICIAL_WORDLE_APP_ID } from './constants.js';

const client = createClient();
const commandMap = new Map(commands.map((c) => [c.data.name, c]));

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

client.once(Events.ClientReady, async (ready) => {
  console.log(`Logged in as ${ready.user.tag}`);

  const guild = ready.guilds.cache.get(config.guildId);
  if (!guild) {
    console.error(`GUILD_ID ${config.guildId} is not a server the bot has joined. Invite it there first.`);
    process.exit(1);
  }

  const channel = await ready.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased() || !('guildId' in channel) || channel.guildId !== config.guildId) {
    console.error(`WORDLE_CHANNEL_ID ${config.channelId} is not a readable text channel in GUILD_ID ${config.guildId}.`);
    process.exit(1);
  }

  const data = commands.map((c) => c.data.toJSON());
  await syncGuild(guild);
  await guild.commands.set(data);
  console.log(`Registered ${data.length} slash commands in ${guild.name}`);
  setInterval(() => void syncGuild(guild), MEMBER_SYNC_INTERVAL_MS);

  if (config.backfillOnStart) {
    try {
      console.log('Backfilling channel history...');
      const { processed, stored, limitReached } = await backfillChannel(channel, config.backfillLimit);
      console.log(`Backfill done: scanned ${processed}, stored ${stored}.`);
      if (limitReached) {
        console.warn(
          `Backfill stopped at the ${config.backfillLimit}-message limit; there may be more history to parse. Raise BACKFILL_LIMIT or run /backfill all:true.`,
        );
      }
    } catch (err) {
      console.error('Backfill on start failed:', errMessage(err));
    }
  }
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
  if (interaction.guildId !== config.guildId) return;
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
