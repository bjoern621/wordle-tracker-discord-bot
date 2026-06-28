import "dotenv/config";
import { DEFAULT_BACKFILL_LIMIT, DEFAULT_TIME_ZONE } from "../constants.js";

export interface Config {
    token: string;
    /** Restrict the bot to a single server. null means every server it is in. */
    guildId: string | null;
    /** Restrict ingestion to one channel. null means any channel it can see. */
    channelId: string | null;
    /** Group timezone. Daily summaries report "yesterday", resolved in this zone. */
    timeZone: string;
    /** Manual name -> user-id overrides for summary entries that are plain @text. */
    aliases: Map<string, string>;
    /** Parse the per-game "X was playing" grid image for same-day results. */
    enableActivityImage: boolean;
    /** Reaction added once a result is captured. Empty string disables it. */
    confirmReaction: string;
    /** Reaction marking that a newer message corrected a stored result. */
    overrideReaction: string;
    backfillOnStart: boolean;
    backfillLimit: number;
}

// "Tim=792090533392678933, Björn=386925022285004800" -> Map(name -> id)
function parseAliases(raw: string | undefined): Map<string, string> {
    const map = new Map<string, string>();
    for (const pair of (raw ?? "").split(",")) {
        const [name, id] = pair.split("=").map((s) => s.trim());
        if (name && id) map.set(name.toLowerCase(), id);
    }
    return map;
}

function boolEnv(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value.trim() === "") return fallback;
    return /^(1|true|yes)$/i.test(value);
}

function loadConfig(): Config {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        console.error(
            "DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.",
        );
        process.exit(1);
    }

    return {
        token,
        guildId: process.env.GUILD_ID?.trim() || null,
        channelId: process.env.WORDLE_CHANNEL_ID?.trim() || null,
        timeZone: process.env.TIMEZONE?.trim() || DEFAULT_TIME_ZONE,
        aliases: parseAliases(process.env.PLAYER_ALIASES),
        enableActivityImage: boolEnv(process.env.ENABLE_ACTIVITY_IMAGE, true),
        confirmReaction: process.env.CONFIRM_REACTION?.trim() ?? "✅",
        overrideReaction: process.env.OVERRIDE_REACTION?.trim() ?? "🔁",
        backfillOnStart: boolEnv(process.env.BACKFILL_ON_START, false),
        backfillLimit:
            Number.parseInt(process.env.BACKFILL_LIMIT ?? "", 10) ||
            DEFAULT_BACKFILL_LIMIT,
    };
}

export const config = loadConfig();
