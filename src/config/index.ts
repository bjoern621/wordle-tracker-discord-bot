import "dotenv/config";

export interface Config {
    token: string;
    /** Postgres connection string. */
    databaseUrl: string;
    /** Group timezone. Daily summaries report "yesterday", resolved in this zone. */
    timeZone: string;
    /** Manual name -> user-id overrides for summary entries that are plain @text. */
    aliases: Map<string, string>;
    /** Parse the per-game "X was playing" grid image for same-day results. */
    enableActivityImage: boolean;
    /** Reaction added once a result is captured. */
    confirmReaction: string;
    /** Reaction marking that a newer message corrected a stored result. */
    overrideReaction: string;
    backfillOnStart: boolean;
    backfillLimit: number;
}

// Every variable is required: a missing or malformed value is a configuration
// error, never a reason to fall back to a guess. All problems are collected so
// one run reports the full list, then the process exits.
const errors: string[] = [];

function str(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        errors.push(`${name} is required but missing or empty.`);
        return "";
    }
    return value;
}

function bool(name: string): boolean {
    const value = process.env[name]?.trim();
    if (!value) {
        errors.push(`${name} is required but missing or empty (true or false).`);
        return false;
    }
    if (/^(1|true|yes)$/i.test(value)) return true;
    if (/^(0|false|no)$/i.test(value)) return false;
    errors.push(`${name} must be true or false, got "${value}".`);
    return false;
}

function positiveInt(name: string): number {
    const value = process.env[name]?.trim();
    if (!value) {
        errors.push(`${name} is required but missing or empty.`);
        return 0;
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
        errors.push(`${name} must be a positive integer, got "${value}".`);
        return 0;
    }
    return n;
}

function timeZone(name: string): string {
    const value = str(name);
    if (!value) return "";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
    } catch {
        errors.push(`${name} is not a valid IANA time zone, got "${value}".`);
    }
    return value;
}

// "Tim=792090533392678933, Björn=386925022285004800" -> Map(name -> id).
// Optional: an empty or unset value yields an empty map. A non-empty value with
// a malformed entry is still a configuration error.
function aliases(name: string): Map<string, string> {
    const map = new Map<string, string>();
    const raw = process.env[name]?.trim();
    if (!raw) return map;
    for (const pair of raw.split(",")) {
        const [alias, id] = pair.split("=").map((s) => s.trim());
        if (alias && id) map.set(alias.toLowerCase(), id);
        else errors.push(`${name} has an invalid entry "${pair.trim()}" (expected name=id).`);
    }
    return map;
}

function loadConfig(): Config {
    const config: Config = {
        token: str("DISCORD_TOKEN"),
        databaseUrl: str("DATABASE_URL"),
        timeZone: timeZone("TIMEZONE"),
        aliases: aliases("PLAYER_ALIASES"),
        enableActivityImage: bool("ENABLE_ACTIVITY_IMAGE"),
        confirmReaction: str("CONFIRM_REACTION"),
        overrideReaction: str("OVERRIDE_REACTION"),
        backfillOnStart: bool("BACKFILL_ON_START"),
        backfillLimit: positiveInt("BACKFILL_LIMIT"),
    };

    if (errors.length) {
        console.error("Configuration is invalid. Fix these in .env and restart:");
        for (const e of errors) console.error(`  - ${e}`);
        process.exit(1);
    }

    return config;
}

export const config = loadConfig();
