import { Command } from "commander";
import chalk from "chalk";
import type { SkillRegistry } from "../../skills/registry.js";
import { executeSkill, executeSkillForAcp } from "../../skills/executor.js";
import type { DexConfig } from "../../core/config.js";
import type { Logger } from "../../core/logger.js";

interface ChainStep {
  skillName: string;
  args: string[];
}

function parseChain(chain: string): ChainStep[] {
  const segments = chain.split(" -> ");
  return segments.map((segment) => {
    const parts = segment.trim().split(/\s+/);
    const skillName = parts[0];
    const args = parts.slice(1);
    return { skillName, args };
  });
}

export function createChainCommand(
  registry: SkillRegistry,
  config: DexConfig,
  logger: Logger,
): Command {
  return new Command("chain")
    .description(
      'Chain skills: output of each becomes stdin for the next (e.g. "review -> commit-msg")',
    )
    .argument("<pipeline>", 'Chain string, e.g. "review -> fix src/app.ts"')
    .action(async (pipeline: string) => {
      const steps = parseChain(pipeline);

      if (steps.length === 0) {
        logger.error("Empty chain. Provide at least one skill.");
        process.exit(1);
      }

      let previousOutput: string | undefined;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const isLast = i === steps.length - 1;
        const stepLabel = `Step ${i + 1}/${steps.length}: ${step.skillName}`;

        const skill = registry.get(step.skillName);
        const { manifest } = skill;

        // Map positional args from the chain step
        const parsedArgs: Record<string, string> = {};
        if (manifest.inputs.args) {
          manifest.inputs.args.forEach((arg, idx) => {
            if (step.args[idx] !== undefined) {
              parsedArgs[arg.name] = step.args[idx];
            }
          });
        }

        const opts = {
          args: parsedArgs,
          flags: {} as Record<string, string | boolean | number>,
          cwd: process.cwd(),
          config,
          logger,
          stdinOverride: previousOutput,
        };

        if (isLast) {
          // Final step: run interactively (output goes to stdout)
          console.log(chalk.cyan(`${stepLabel}...`));
          await executeSkill(skill, opts);
          console.log(chalk.green(`${stepLabel}... ✔`));
        } else {
          // Intermediate step: capture output
          console.log(chalk.cyan(`${stepLabel}...`));
          previousOutput = await executeSkillForAcp(skill, opts);
          console.log(chalk.green(`${stepLabel}... ✔`));
        }
      }
    });
}
