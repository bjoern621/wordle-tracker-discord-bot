import { Client, GatewayIntentBits, Partials, Events, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { ingestMessage } from './ingest.js';
import { backfillChannel } from './backfill.js';
import { commands } from './commands.js';
import { syncGuild } from './identity.js';
import { OFFICIAL_WORDLE_APP_ID } from './wordle.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const commandMap = new Map(commands.map((c) => [c.data.name, c]));

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const data = commands.map((c) => c.data.toJSON());
  const targetGuilds = () => {
    if (!config.guildId) return [...client.guilds.cache.values()];
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) console.warn(`GUILD_ID ${config.guildId} not found among joined servers.`);
    return guild ? [guild] : [];
  };

  for (const guild of targetGuilds()) {
    await syncGuild(guild);
    await guild.commands.set(data);
    console.log(`Registered ${data.length} slash commands in ${guild.name}`);
  }
  setInterval(() => {
    for (const guild of targetGuilds()) syncGuild(guild);
  }, SIX_HOURS);

  if (config.backfillOnStart && config.channelId) {
    try {
      const channel = await client.channels.fetch(config.channelId);
      console.log('Backfilling channel history...');
      const { processed, stored } = await backfillChannel(channel, config.backfillLimit);
      console.log(`Backfill done: scanned ${processed}, stored ${stored}.`);
    } catch (err) {
      console.error('Backfill on start failed:', err.message);
    }
  }
});

async function react(message, emoji) {
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
    console.error('Ingest (create) failed:', err.message);
  }
});

// The Activity edits its messages, so a final grid or summary may only appear on
// update. Re-ingest the official bot's edits.
client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
  try {
    const message = newMessage.partial ? await newMessage.fetch() : newMessage;
    if (message.author?.id === OFFICIAL_WORDLE_APP_ID) await ingestMessage(message);
  } catch (err) {
    console.error('Ingest (update) failed:', err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (config.guildId && interaction.guildId !== config.guildId) return;
  const command = commandMap.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Command ${interaction.commandName} failed:`, err);
    const payload = { content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

client.login(config.token);
