import { Command } from "commander";
import chalk from "chalk";
import { UsageTracker } from "../../core/usage.js";

export function createUsageCommand(): Command {
  return new Command("usage")
    .description("Show token usage and estimated cost")
    .option("-d, --days <number>", "Number of days to look back", "1")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const tracker = new UsageTracker();
      const days = parseInt(options.days, 10) || 1;
      const summary = await tracker.getSummary(days);

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      const period = days === 1 ? "today" : `last ${days} day(s)`;
      console.log(chalk.bold(`\nToken Usage — ${period}\n`));

      if (summary.entries === 0) {
        console.log(chalk.dim("  No usage recorded for this period.\n"));
        return;
      }

      console.log(
        `  Total tokens:   ${summary.totalTokens.toLocaleString()} (${summary.totalInputTokens.toLocaleString()} in / ${summary.totalOutputTokens.toLocaleString()} out)`,
      );
      console.log(
        `  Estimated cost: ${chalk.green("$" + summary.estimatedCost.toFixed(4))}`,
      );
      console.log(`  Invocations:    ${summary.entries}`);

      // Per-skill breakdown
      const skills = Object.entries(summary.perSkill);
      if (skills.length > 0) {
        console.log(chalk.bold("\n  Per-skill breakdown:\n"));

        // Table header
        const header = `  ${"Skill".padEnd(20)} ${"Invocations".padStart(12)} ${"Input".padStart(10)} ${"Output".padStart(10)} ${"Cost".padStart(10)}`;
        console.log(chalk.dim(header));
        console.log(chalk.dim("  " + "─".repeat(header.length - 2)));

        for (const [name, data] of skills.sort(
          (a, b) => b[1].estimatedCost - a[1].estimatedCost,
        )) {
          console.log(
            `  ${name.padEnd(20)} ${String(data.invocations).padStart(12)} ${data.inputTokens.toLocaleString().padStart(10)} ${data.outputTokens.toLocaleString().padStart(10)} ${("$" + data.estimatedCost.toFixed(4)).padStart(10)}`,
          );
        }
      }

      console.log();
    });
}
