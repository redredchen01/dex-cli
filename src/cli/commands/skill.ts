import { Command } from "commander";
import { mkdir, writeFile, readFile, cp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import type { SkillRegistry } from "../../skills/registry.js";
import { validateManifest } from "../../skills/validator.js";
import { getGlobalConfigDir } from "../../core/config.js";
import { stripTypes } from "../../utils/typescript.js";
import type { Logger } from "../../core/logger.js";

// Skill names must be lowercase alphanumeric with hyphens (no path traversal)
const VALID_SKILL_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Compile handler.ts → handler.js if no .js file exists.
 * Ensures compatibility with all Node.js versions.
 */
async function compileHandlerIfNeeded(dir: string): Promise<void> {
  const jsPath = join(dir, "handler.js");
  const tsPath = join(dir, "handler.ts");

  if (existsSync(jsPath)) return; // Already has .js
  if (!existsSync(tsPath)) return; // No .ts either

  const tsCode = await readFile(tsPath, "utf-8");
  const jsCode = stripTypes(tsCode);
  await writeFile(jsPath, jsCode);
}

export function createSkillCommand(
  registry: SkillRegistry,
  logger: Logger,
): Command {
  const cmd = new Command("skill").description("Manage skills");

  cmd
    .command("list")
    .description("List all available skills")
    .action(() => {
      const skills = registry.list();
      if (skills.length === 0) {
        console.log("No skills installed.");
        return;
      }

      console.log(chalk.bold("\nAvailable Skills:\n"));
      for (const skill of skills) {
        const tag = skill.builtIn
          ? chalk.gray(" [built-in]")
          : chalk.cyan(" [user]");
        const aliases = skill.manifest.aliases?.length
          ? chalk.gray(` (aliases: ${skill.manifest.aliases.join(", ")})`)
          : "";
        console.log(
          `  ${chalk.green(skill.manifest.name)}${tag}${aliases}`,
        );
        console.log(`    ${skill.manifest.description}`);
      }
      console.log();
    });

  cmd
    .command("info")
    .description("Show skill details")
    .argument("<name>", "Skill name")
    .action((name: string) => {
      const skill = registry.get(name);
      const m = skill.manifest;

      console.log(chalk.bold(`\n${m.name} v${m.version}`));
      console.log(`${m.description}\n`);
      console.log(`  Path: ${skill.path}`);
      console.log(`  Built-in: ${skill.builtIn}`);
      if (m.aliases?.length) {
        console.log(`  Aliases: ${m.aliases.join(", ")}`);
      }
      if (m.inputs.args?.length) {
        console.log(`  Args:`);
        for (const arg of m.inputs.args) {
          console.log(
            `    <${arg.name}> - ${arg.description}${arg.required ? " (required)" : ""}`,
          );
        }
      }
      if (m.inputs.flags?.length) {
        console.log(`  Flags:`);
        for (const flag of m.inputs.flags) {
          console.log(
            `    --${flag.name}${flag.short ? ` (-${flag.short})` : ""} - ${flag.description ?? flag.type}`,
          );
        }
      }
      if (m.inputs.context?.length) {
        console.log(`  Context: ${m.inputs.context.join(", ")}`);
      }
      console.log();
    });

  cmd
    .command("init")
    .description("Create a new skill skeleton")
    .argument("<name>", "Skill name")
    .action(async (name: string) => {
      if (!VALID_SKILL_NAME.test(name)) {
        logger.error(
          "Skill name must be lowercase alphanumeric with hyphens (e.g., my-skill).",
        );
        return;
      }

      const dir = join(process.cwd(), name);
      if (existsSync(dir)) {
        logger.error(`Directory "${name}" already exists.`);
        return;
      }

      await mkdir(dir, { recursive: true });

      const manifest = {
        name,
        version: "0.1.0",
        description: `${name} skill`,
        inputs: {
          args: [],
          flags: [],
          context: [],
        },
      };

      await writeFile(
        join(dir, "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );

      // Generate both .ts (for editing) and .js (for compatibility)
      const handlerTs = `import type { SkillHandler } from "dex-cli";

const handler: SkillHandler = async (ctx) => {
  const prompt = "Hello from ${name} skill!";

  for await (const msg of ctx.agent.query(prompt)) {
    if (msg.type === "text" && msg.content) {
      process.stdout.write(msg.content);
    }
  }
  process.stdout.write("\\n");
};

export default handler;
`;
      await writeFile(join(dir, "handler.ts"), handlerTs);

      console.log(chalk.green(`\nCreated skill skeleton in ./${name}/`));
      console.log(`  Edit ${name}/handler.ts to implement logic`);
      console.log(`  Edit ${name}/manifest.json to configure inputs`);
      console.log(`  Run: dex skill add ./${name}`);
      console.log();
    });

  cmd
    .command("add")
    .description("Install a skill from a directory")
    .argument("<path>", "Path to skill directory")
    .action(async (skillPath: string) => {
      const srcDir = resolve(process.cwd(), skillPath);

      if (!existsSync(join(srcDir, "manifest.json"))) {
        logger.error("No manifest.json found in the specified directory.");
        return;
      }

      // Validate the full manifest
      let manifest;
      try {
        const raw = JSON.parse(
          await readFile(join(srcDir, "manifest.json"), "utf-8"),
        );
        manifest = validateManifest(raw);
      } catch (err) {
        logger.error(
          `Invalid manifest: ${err instanceof Error ? err.message : err}`,
        );
        return;
      }

      const destDir = join(getGlobalConfigDir(), "skills", manifest.name);
      await mkdir(destDir, { recursive: true });
      await cp(srcDir, destDir, { recursive: true });

      // Compile handler.ts → handler.js for Node.js compatibility
      await compileHandlerIfNeeded(destDir);

      console.log(
        chalk.green(`Installed skill "${manifest.name}" to ${destDir}`),
      );
    });

  cmd
    .command("remove")
    .description("Remove an installed skill")
    .argument("<name>", "Skill name")
    .action(async (name: string) => {
      // Validate name format to prevent path traversal
      if (!VALID_SKILL_NAME.test(name)) {
        logger.error("Invalid skill name.");
        return;
      }

      const dir = join(getGlobalConfigDir(), "skills", name);
      if (!existsSync(dir)) {
        logger.error(`Skill "${name}" not found in user skills.`);
        return;
      }

      // Extra safety: ensure the resolved path is inside the skills dir
      const skillsDir = join(getGlobalConfigDir(), "skills");
      if (!resolve(dir).startsWith(resolve(skillsDir))) {
        logger.error("Invalid skill path.");
        return;
      }

      await rm(dir, { recursive: true });
      registry.remove(name);
      console.log(chalk.green(`Removed skill "${name}".`));
    });

  return cmd;
}
