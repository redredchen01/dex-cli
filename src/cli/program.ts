import { Command } from "commander";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { loadConfig, getGlobalConfigDir } from "../core/config.js";
import { createLogger } from "../core/logger.js";
import { SkillRegistry } from "../skills/registry.js";
import { loadBuiltInSkills, loadUserSkills } from "../skills/loader.js";
import { registerSkillShortcuts } from "./shortcuts.js";
import { createRunCommand } from "./commands/run.js";
import { createServeCommand } from "./commands/serve.js";
import { createSkillCommand } from "./commands/skill.js";
import { createConfigCommand } from "./commands/config.js";
import { createDoctorCommand } from "./commands/doctor.js";
import { createCompletionCommand } from "./commands/completion.js";
import { createChatCommand } from "./commands/chat.js";
import { getVersion } from "../core/version.js";

export async function createProgram(): Promise<Command> {
  // Pre-parse --verbose and --json before full parse
  const hasVerbose =
    process.argv.includes("--verbose") || process.argv.includes("-v");
  const hasJson = process.argv.includes("--json");

  const config = await loadConfig();
  if (hasVerbose) config.verbose = true;

  const logger = createLogger(config.verbose ? "debug" : "info");
  const registry = new SkillRegistry();

  // Load skills
  await loadBuiltInSkills(registry, logger);

  const userSkillDirs = [
    join(getGlobalConfigDir(), "skills"),
    ...config.skillDirs,
  ];
  await loadUserSkills(registry, userSkillDirs, logger);

  logger.debug(`Loaded ${registry.list().length} skills`);

  // Build CLI program
  const program = new Command("dex")
    .version(getVersion())
    .description("AI development tool with extensible skill system")
    .option("-v, --verbose", "Enable verbose output")
    .option("--json", "Output results as JSON");

  // Store json flag on config for handlers to access
  program.hook("preAction", () => {
    if (hasJson) {
      (config as Record<string, unknown>).jsonOutput = true;
    }
  });

  // Global error handler
  program.exitOverride();
  program.configureOutput({
    writeErr: (str) => {
      if (!hasJson) {
        process.stderr.write(str);
      }
    },
  });

  // Built-in commands
  program.addCommand(createRunCommand(registry, config, logger));
  program.addCommand(createServeCommand(registry, config, logger));
  program.addCommand(createSkillCommand(registry, logger));
  program.addCommand(createConfigCommand(config));
  program.addCommand(createDoctorCommand(config, registry));
  program.addCommand(createCompletionCommand(registry));
  program.addCommand(createChatCommand(config, logger));

  // Init command
  program
    .command("init")
    .description("Initialize .dex/ in current project")
    .action(async () => {
      const dir = join(process.cwd(), ".dex");
      if (existsSync(dir)) {
        logger.info(".dex/ already exists.");
        return;
      }
      await mkdir(dir, { recursive: true });
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        join(dir, "config.json"),
        JSON.stringify({}, null, 2) + "\n",
      );
      console.log(chalk.green("Initialized .dex/ in current directory."));

      // Show setup hint if API key is not configured
      if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
        console.log(
          chalk.yellow(
            "\nAPI key not configured. Set it with:\n" +
              "  export ANTHROPIC_API_KEY=<your-key>\n" +
              "  # or\n" +
              "  dex config set apiKey <your-key>\n",
          ),
        );
      }
    });

  // Register skill shortcuts (dex review, dex commit-msg, etc.)
  registerSkillShortcuts(program, registry, config, logger);

  return program;
}
