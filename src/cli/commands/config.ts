import { Command } from "commander";
import chalk from "chalk";
import type { DexConfig } from "../../core/config.js";
import {
  setConfigValue,
  listProfiles,
  loadProfile,
  saveProfile,
  deleteProfile,
  ensurePresetProfiles,
  PRESET_PROFILES,
} from "../../core/config.js";

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

  const profile = new Command("profile").description(
    "Manage config profiles",
  );

  profile
    .command("list")
    .description("List available profiles")
    .action(async () => {
      await ensurePresetProfiles();
      const profiles = await listProfiles();
      const active = config.activeProfile;

      if (isJson()) {
        console.log(JSON.stringify({ profiles, active: active ?? null }));
        return;
      }

      console.log(chalk.bold("\nAvailable Profiles:\n"));
      if (profiles.length === 0) {
        console.log("  (none)");
      } else {
        for (const name of profiles) {
          const marker = name === active ? chalk.green(" (active)") : "";
          const isPreset = name in PRESET_PROFILES ? chalk.gray(" [preset]") : "";
          console.log(`  ${chalk.cyan(name)}${marker}${isPreset}`);
        }
      }
      console.log();
    });

  profile
    .command("use")
    .description("Switch active profile")
    .argument("<name>", "Profile name")
    .action(async (name: string) => {
      await ensurePresetProfiles();
      const p = await loadProfile(name);
      if (!p) {
        console.error(chalk.red(`Profile "${name}" not found.`));
        process.exitCode = 1;
        return;
      }

      await setConfigValue("activeProfile", name, true);

      if (isJson()) {
        console.log(JSON.stringify({ activeProfile: name }));
      } else {
        console.log(chalk.green(`Switched to profile "${name}".`));
      }
    });

  profile
    .command("create")
    .description("Create a profile from current config")
    .argument("<name>", "Profile name")
    .action(async (name: string) => {
      const { apiKey: _apiKey, activeProfile: _ap, ...rest } = config;
      await saveProfile(name, rest);

      if (isJson()) {
        console.log(JSON.stringify({ created: name }));
      } else {
        console.log(chalk.green(`Profile "${name}" created.`));
      }
    });

  profile
    .command("delete")
    .description("Delete a profile")
    .argument("<name>", "Profile name")
    .action(async (name: string) => {
      const deleted = await deleteProfile(name);
      if (!deleted) {
        console.error(chalk.red(`Profile "${name}" not found.`));
        process.exitCode = 1;
        return;
      }

      // Clear activeProfile if it was the deleted one
      if (config.activeProfile === name) {
        await setConfigValue("activeProfile", undefined, true);
      }

      if (isJson()) {
        console.log(JSON.stringify({ deleted: name }));
      } else {
        console.log(chalk.green(`Profile "${name}" deleted.`));
      }
    });

  cmd.addCommand(profile);

  return cmd;
}
