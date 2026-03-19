import { Command } from "commander";
import type { SkillRegistry } from "../skills/registry.js";
import type { LoadedSkill } from "../skills/types.js";
import { executeSkill } from "../skills/executor.js";
import type { DexConfig } from "../core/config.js";
import type { Logger } from "../core/logger.js";

export function registerSkillShortcuts(
  program: Command,
  registry: SkillRegistry,
  config: DexConfig,
  logger: Logger,
): void {
  for (const skill of registry.list()) {
    // Skip if name conflicts with built-in commands
    const existing = program.commands.find(
      (c) => c.name() === skill.manifest.name,
    );
    if (existing) {
      logger.debug(
        `Skill "${skill.manifest.name}" conflicts with built-in command, skipping shortcut`,
      );
      continue;
    }

    registerSkillCommand(program, skill, config, logger);

    // Register aliases
    if (skill.manifest.aliases) {
      for (const alias of skill.manifest.aliases) {
        const aliasExisting = program.commands.find(
          (c) => c.name() === alias,
        );
        if (!aliasExisting) {
          registerSkillCommand(program, skill, config, logger, alias);
        }
      }
    }
  }
}

function registerSkillCommand(
  program: Command,
  skill: LoadedSkill,
  config: DexConfig,
  logger: Logger,
  nameOverride?: string,
): void {
  const { manifest } = skill;
  const cmd = program
    .command(nameOverride ?? manifest.name)
    .description(manifest.description);

  // Register args
  if (manifest.inputs.args) {
    for (const arg of manifest.inputs.args) {
      if (arg.required) {
        cmd.argument(`<${arg.name}>`, arg.description);
      } else {
        cmd.argument(`[${arg.name}]`, arg.description);
      }
    }
  }

  // Register flags
  if (manifest.inputs.flags) {
    for (const flag of manifest.inputs.flags) {
      const long = `--${flag.name}`;
      const short = flag.short ? `-${flag.short}, ` : "";
      const flagStr =
        flag.type === "boolean"
          ? `${short}${long}`
          : `${short}${long} <value>`;
      cmd.option(flagStr, flag.description ?? "", flag.default as string | boolean | undefined);
    }
  }

  cmd.action(async (...actionArgs: unknown[]) => {
    const opts = cmd.opts();
    const args: Record<string, string> = {};

    // Map positional args
    if (manifest.inputs.args) {
      manifest.inputs.args.forEach((arg, i) => {
        if (actionArgs[i] !== undefined) {
          args[arg.name] = String(actionArgs[i]);
        }
      });
    }

    await executeSkill(skill, {
      args,
      flags: opts,
      cwd: process.cwd(),
      config,
      logger,
    });
  });
}
