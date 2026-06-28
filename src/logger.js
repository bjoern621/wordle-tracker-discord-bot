// Phase 0 logger: dumps raw messages and embeds from a channel so the real
// format of the official Wordle Activity can be inspected before a parser is
// written. Output is one JSON object per line in data/dump-<timestamp>.jsonl,
// plus a short human-readable summary on the console.

import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const token = process.env.DISCORD_TOKEN;
const channelFilter = process.env.WORDLE_CHANNEL_ID?.trim() || null;
const authorFilter = process.env.WORDLE_APP_ID?.trim() || null;
const backfillLimit = Number.parseInt(process.env.BACKFILL_LIMIT ?? '0', 10) || 0;
// When set, image attachments and embed images are downloaded next to the dump
// so the grid parser can be tested and re-tuned offline (CDN URLs expire).
const saveImages = /^(1|true|yes)$/i.test(process.env.SAVE_IMAGES ?? '');

if (!token) {
  console.error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });
const outFile = join(dataDir, `dump-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
console.log(`Writing raw dumps to ${outFile}`);

const imagesDir = join(dataDir, 'images');
if (saveImages) {
  mkdirSync(imagesDir, { recursive: true });
  console.log(`Saving images to ${imagesDir}`);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function serialize(message, event) {
  return {
    capturedAt: new Date().toISOString(),
    event,
    id: message.id,
    createdAt: message.createdAt?.toISOString() ?? null,
    editedAt: message.editedAt?.toISOString() ?? null,
    guildId: message.guildId,
    channelId: message.channelId,
    channelName: message.channel?.name ?? null,
    webhookId: message.webhookId ?? null,
    applicationId: message.applicationId ?? null,
    type: message.type,
    author: message.author
      ? {
          id: message.author.id,
          username: message.author.username,
          globalName: message.author.globalName ?? null,
          bot: message.author.bot,
          system: message.author.system,
        }
      : null,
    interactionMetadata: message.interactionMetadata ?? null,
    content: message.content,
    embeds: message.embeds.map((e) => e.toJSON()),
    attachments: [...message.attachments.values()].map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      contentType: a.contentType,
      width: a.width,
      height: a.height,
      size: a.size,
    })),
    components: safe(() => message.components.map((c) => c.toJSON())) ?? [],
    stickers: [...(message.stickers?.values() ?? [])].map((s) => ({ id: s.id, name: s.name })),
  };
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function describe(record) {
  const who = record.author
    ? `${record.author.username}${record.author.bot ? ' [bot]' : ''} (${record.author.id})`
    : 'unknown';
  const imageHints = [];
  for (const e of record.embeds) {
    if (e.image?.url) imageHints.push('embed.image');
    if (e.thumbnail?.url) imageHints.push('embed.thumbnail');
  }
  for (const a of record.attachments) {
    if (a.contentType?.startsWith('image/')) imageHints.push(`attachment:${a.contentType}`);
  }
  const textHint =
    record.content?.length ||
    record.embeds.some((e) => e.description || (e.fields?.length ?? 0) > 0 || e.title)
      ? 'has-text'
      : 'no-text';
  const flags = [
    `embeds:${record.embeds.length}`,
    `attachments:${record.attachments.length}`,
    textHint,
    imageHints.length ? `images[${imageHints.join(',')}]` : 'no-images',
  ].join(' ');
  return `[${record.event}] #${record.channelName ?? record.channelId} by ${who} | ${flags}`;
}

const EXT_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

function extFor(contentType, url) {
  const ct = contentType?.split(';')[0].trim().toLowerCase();
  if (ct && EXT_BY_TYPE[ct]) return EXT_BY_TYPE[ct];
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    /* fall through */
  }
  return 'bin';
}

// Downloads url into data/images/<base>.<ext>. Returns the path relative to the
// dump file (e.g. "images/123-att-456.png") or null on failure.
async function download(url, base, contentType) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const name = `${base}.${extFor(contentType ?? res.headers.get('content-type'), url)}`;
    writeFileSync(join(imagesDir, name), buf);
    return join('images', name);
  } catch {
    return null;
  }
}

// Mutates the serialized record in place, adding a localPath to every image
// attachment and to each embed image/thumbnail it manages to download.
async function saveImageFiles(data) {
  for (const a of data.attachments) {
    if (!a.contentType?.startsWith('image/')) continue;
    a.localPath = await download(a.url, `${data.id}-att-${a.id}`, a.contentType);
  }
  for (let i = 0; i < data.embeds.length; i += 1) {
    const e = data.embeds[i];
    if (e.image?.url) e.image.localPath = await download(e.image.url, `${data.id}-emb${i}-image`);
    if (e.thumbnail?.url) e.thumbnail.localPath = await download(e.thumbnail.url, `${data.id}-emb${i}-thumb`);
  }
}

async function record(message, event) {
  if (channelFilter && message.channelId !== channelFilter) return;
  if (authorFilter && message.author?.id !== authorFilter && message.applicationId !== authorFilter) {
    return;
  }
  const data = serialize(message, event);
  if (saveImages) await saveImageFiles(data);
  appendFileSync(outFile, `${JSON.stringify(data)}\n`);
  console.log(describe(data));
}

async function backfill(channel, limit) {
  let remaining = limit;
  let before;
  let total = 0;
  while (remaining > 0) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, remaining), before });
    if (batch.size === 0) break;
    for (const message of batch.values()) {
      await record(message, 'backfill');
      total += 1;
    }
    before = batch.last().id;
    remaining -= batch.size;
    if (batch.size < 100) break;
  }
  return total;
}

const onError = (err) => console.error('record failed:', err.message);
client.on('messageCreate', (message) => record(message, 'create').catch(onError));
client.on('messageUpdate', (_old, message) => record(message, 'update').catch(onError));

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log('Channels visible to the bot (use one of these IDs for WORDLE_CHANNEL_ID):');
  for (const guild of client.guilds.cache.values()) {
    console.log(`  Guild: ${guild.name} (${guild.id})`);
    for (const ch of guild.channels.cache.values()) {
      if (ch.isTextBased?.()) console.log(`    #${ch.name} -> ${ch.id}`);
    }
  }

  if (backfillLimit > 0 && channelFilter) {
    try {
      const channel = await client.channels.fetch(channelFilter);
      console.log(`Backfilling up to ${backfillLimit} past messages from #${channel.name}...`);
      const total = await backfill(channel, backfillLimit);
      console.log(`Backfill done: ${total} messages dumped.`);
    } catch (err) {
      console.error('Backfill failed:', err.message);
    }
  } else if (backfillLimit > 0) {
    console.log('BACKFILL_LIMIT is set but WORDLE_CHANNEL_ID is empty. Set the channel ID to backfill.');
  }

  console.log('Listening for new messages. Press Ctrl+C to stop.');
});

client.login(token);
