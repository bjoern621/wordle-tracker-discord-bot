import {
    EmbedBuilder,
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { getResults } from "../db/results.repository.js";
import { periodRange } from "../domain/wordle.js";
import { aggregateLeaderboard, fixed } from "../stats/stats.js";
import { config } from "../config/index.js";
import { EMBED_COLOR } from "../constants.js";
import { periodOption, PERIOD_LABEL, periodFrom } from "./shared.js";

/** `/leaderboard`: ranks all players by average score for a chosen period. */
export const leaderboardCommand: BotCommand = {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Ranking of all players by average score")
        .addStringOption(periodOption),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const period = periodFrom(interaction.options.getString("period"));
        const [from, to] = periodRange(period, config.timeZone);
        const rows = aggregateLeaderboard(
            await getResults(interaction.guildId!, from, to),
        );
        if (!rows.length) {
            await interaction.reply(
                "No Wordle results recorded for that period yet.",
            );
            return;
        }
        const header = `${"#".padStart(2)}  ${"Player".padEnd(16)} ${"Games".padStart(4)} ${"Win%".padStart(4)}  Avg score`;
        const lines = rows.map((r, i) => {
            const name = (r.username || r.userId).slice(0, 16).padEnd(16);
            const wr = r.games ? Math.round((r.wins / r.games) * 100) : 0;
            return `${String(i + 1).padStart(2)}. ${name} ${String(r.games).padStart(3)}g ${String(wr).padStart(3)}%  avg ${fixed(r.avgScore)}`;
        });
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`Wordle Leaderboard - ${PERIOD_LABEL[period]}`)
            .setDescription(
                "```\n" + header + "\n" + lines.join("\n") + "\n```",
            )
            .setFooter({
                text: "avg = average score, failed games count as 7",
            });
        await interaction.reply({ embeds: [embed] });
    },
};
