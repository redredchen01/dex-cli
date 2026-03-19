import { Command } from "commander";
import chalk from "chalk";
import type { DexConfig } from "../../core/config.js";
import { setConfigValue } from "../../core/config.js";

export function createConfigCommand(config: DexConfig): Command {
  const cmd = new Command("config").description("Manage configuration");

  const isJson = () => !!(config as Record<string, unknown>).jsonOutput;

  cmd
    .command("list")
    .description("Show current configuration")
    .action(() => {
      if (isJson()) {
        const safe = { ...config };
        if (safe.apiKey) safe.apiKey = "****" + safe.apiKey.slice(-4);
        delete (safe as Record<string, unknown>).jsonOutput;
        console.log(JSON.stringify(safe, null, 2));
        return;
      }

      console.log(chalk.bold("\nCurrent Configuration:\n"));
      for (const [key, value] of Object.entries(config)) {
        if (key === "jsonOutput") continue;
        if (key === "apiKey" && value) {
          console.log(`  ${key}: ${chalk.gray("****" + String(value).slice(-4))}`);
        } else {
          console.log(`  ${key}: ${chalk.cyan(JSON.stringify(value))}`);
        }
      }
      console.log();
    });

  cmd
    .command("set")
    .description("Set a configuration value")
    .argument("<key>", "Configuration key")
    .argument("<value>", "Configuration value")
    .option("-g, --global", "Set globally (default)", true)
    .option("-l, --local", "Set for current project")
    .action(async (key: string, value: string, opts: { local?: boolean }) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }

      await setConfigValue(key, parsed, !opts.local);

      if (isJson()) {
        console.log(JSON.stringify({ key, value: parsed }));
      } else {
        console.log(chalk.green(`Set ${key} = ${JSON.stringify(parsed)}`));
      }
    });

  cmd
    .command("get")
    .description("Get a configuration value")
    .argument("<key>", "Configuration key")
    .action((key: string) => {
      const value = config[key];
      if (isJson()) {
        console.log(JSON.stringify({ key, value: value ?? null }));
        return;
      }

      if (value === undefined) {
        console.log(`${key}: ${chalk.gray("(not set)")}`);
      } else {
        console.log(`${key}: ${JSON.stringify(value)}`);
      }
    });

  return cmd;
}
