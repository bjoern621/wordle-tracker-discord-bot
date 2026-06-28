import 'dotenv/config';

function parseAliases(raw) {
  // "Tim=792090533392678933, Björn=386925022285004800" -> Map(name -> id)
  const map = new Map();
  for (const pair of (raw ?? '').split(',')) {
    const [name, id] = pair.split('=').map((s) => s.trim());
    if (name && id) map.set(name.toLowerCase(), id);
  }
  return map;
}

export const config = {
  token: process.env.DISCORD_TOKEN,
  // Restrict the bot to a single server. Empty means every server it is in.
  // When set, command registration, member sync and ingestion only touch this guild.
  guildId: process.env.GUILD_ID?.trim() || null,
  // Restrict ingestion to one channel. Empty means any channel the bot can see.
  channelId: process.env.WORDLE_CHANNEL_ID?.trim() || null,
  // Group timezone. Daily summaries report "yesterday", resolved in this zone.
  timeZone: process.env.TIMEZONE?.trim() || 'Europe/Berlin',
  // Manual name -> user-id overrides for summary entries that are plain @text.
  aliases: parseAliases(process.env.PLAYER_ALIASES),
  // Parse the per-game "X was playing" grid image for same-day results.
  enableActivityImage: !/^(0|false|no)$/i.test(process.env.ENABLE_ACTIVITY_IMAGE ?? 'true'),
  // Reaction added to a message once its result is captured. Empty to disable.
  confirmReaction: process.env.CONFIRM_REACTION?.trim() ?? '✅',
  // Reaction marking that a newer message corrected a previously stored result.
  overrideReaction: process.env.OVERRIDE_REACTION?.trim() ?? '🔁',
  backfillOnStart: /^(1|true|yes)$/i.test(process.env.BACKFILL_ON_START ?? ''),
  backfillLimit: Number.parseInt(process.env.BACKFILL_LIMIT ?? '5000', 10) || 5000,
};

if (!config.token) {
  console.error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
