import { Events, MessageFlags, type Client, type Guild } from 'discord.js';
import { config } from './config/index.js';
import { createClient } from './discord/client.js';
import { ingestMessage } from './ingest/ingest.js';
import { backfillChannel } from './ingest/backfill.js';
import { commands } from './commands/index.js';
import { HISTORY_MONTH_SELECT, handleHistorySelect } from './commands/history.command.js';
import { syncGuild } from './identity/identity.js';
import { loadGuildChannels, trackedChannels } from './settings/guild-channels.js';
import { scheduleWeeklyLeaderboard } from './reports/leaderboard-schedule.js';
import { MEMBER_SYNC_INTERVAL_MS, OFFICIAL_WORDLE_APP_ID } from './constants.js';

const client = createClient();
const commandMap = new Map(commands.map((c) => [c.data.name, c]));
const commandData = commands.map((c) => c.data.toJSON());

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Commands are registered per guild, which updates clients instantly. Global
// registration is cached by Discord and can take up to an hour to propagate.
async function registerGuildCommands(guild: Guild): Promise<void> {
  try {
    await guild.commands.set(commandData);
  } catch (err) {
    console.error(`Registering commands for guild ${guild.id} failed:`, errMessage(err));
  }
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

  // Register commands in every guild the bot is currently in. Guilds joined
  // later are handled by the GuildCreate event below.
  await Promise.all(ready.guilds.cache.map((guild) => registerGuildCommands(guild)));
  console.log(`Registered ${commandData.length} slash commands across ${ready.guilds.cache.size} guild(s)`);

  syncAllGuilds(ready);
  setInterval(() => syncAllGuilds(ready), MEMBER_SYNC_INTERVAL_MS);

  scheduleWeeklyLeaderboard(ready);

  if (config.backfillOnStart) await backfillConfiguredChannels(ready);
});

// A newly joined guild needs its commands registered. This fires only for real
// joins after startup, not for the initial guild cache load.
client.on(Events.GuildCreate, async (guild) => {
  await registerGuildCommands(guild);
  void syncGuild(guild);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await ingestMessage(message);
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
  if (interaction.isStringSelectMenu()) {
    if (!interaction.guildId) return; // server-only
    try {
      if (interaction.customId.startsWith(`${HISTORY_MONTH_SELECT}:`)) {
        await handleHistorySelect(interaction);
      }
    } catch (err) {
      console.error('Component interaction failed:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: 'Something went wrong.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
    return;
  }

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
