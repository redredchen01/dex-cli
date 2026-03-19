import { Command } from "commander";
import type { SkillRegistry } from "../../skills/registry.js";
import { executeSkill } from "../../skills/executor.js";
import type { DexConfig } from "../../core/config.js";
import type { Logger } from "../../core/logger.js";

export function createRunCommand(
  registry: SkillRegistry,
  config: DexConfig,
  logger: Logger,
): Command {
  const cmd = new Command("run")
    .description("Run a skill by name")
    .argument("<skill>", "Skill name to run")
    .argument("[args...]", "Arguments to pass to the skill")
    .allowUnknownOption(true)
    .action(async (skillName: string, positionalArgs: string[]) => {
      const skill = registry.get(skillName);
      const { manifest } = skill;

      // Dynamically register skill flags so Commander can parse them properly
      const subCmd = new Command(skillName).allowUnknownOption(true);

      if (manifest.inputs.flags) {
        for (const flag of manifest.inputs.flags) {
          const long = `--${flag.name}`;
          const short = flag.short ? `-${flag.short}, ` : "";
          const flagStr =
            flag.type === "boolean"
              ? `${short}${long}`
              : `${short}${long} <value>`;
          subCmd.option(
            flagStr,
            flag.description ?? "",
            flag.default as string | boolean | undefined,
          );
        }
      }

      // Re-parse the raw args to extract flags
      const rawArgs = process.argv.slice(
        process.argv.indexOf(skillName) + 1,
      );
      subCmd.parse(rawArgs, { from: "user" });
      const flags = subCmd.opts();

      // Map positional args
      const parsedArgs: Record<string, string> = {};
      if (manifest.inputs.args) {
        manifest.inputs.args.forEach((arg, i) => {
          if (positionalArgs[i] !== undefined) {
            parsedArgs[arg.name] = positionalArgs[i];
          }
        });
      }

      await executeSkill(skill, {
        args: parsedArgs,
        flags,
        cwd: process.cwd(),
        config,
        logger,
      });
    });

  return cmd;
}
