import { Command } from "commander";
import { join } from "node:path";
import { mkdir, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import chalk from "chalk";
import type { SkillRegistry } from "../../skills/registry.js";
import type { Logger } from "../../core/logger.js";

/** Map a dex skill name to an OpenClaw-safe tool name (underscores, prefixed). */
function toolName(skillName: string): string {
  return `dex_${skillName.replace(/-/g, "_")}`;
}

interface SkillMeta {
  name: string;
  description: string;
  args?: { name: string; description: string; required?: boolean }[];
  flags?: {
    name: string;
    short?: string;
    type: "string" | "boolean" | "number";
    description?: string;
    default?: string | boolean | number;
  }[];
}

function buildParameterSchema(skill: SkillMeta): string {
  const fields: string[] = [];

  if (skill.args) {
    for (const arg of skill.args) {
      if (arg.required) {
        fields.push(`    ${arg.name}: Type.String(),`);
      } else {
        fields.push(`    ${arg.name}: Type.Optional(Type.String()),`);
      }
    }
  }

  if (skill.flags) {
    for (const flag of skill.flags) {
      const typeStr =
        flag.type === "boolean"
          ? "Type.Boolean()"
          : flag.type === "number"
            ? "Type.Number()"
            : "Type.String()";
      fields.push(`    ${flag.name}: Type.Optional(${typeStr}),`);
    }
  }

  if (fields.length === 0) {
    return "Type.Object({})";
  }

  return `Type.Object({\n${fields.join("\n")}\n  })`;
}

function buildCliArgs(skill: SkillMeta): string {
  const lines: string[] = [];

  if (skill.args) {
    for (const arg of skill.args) {
      lines.push(`    if (params.${arg.name}) args.push(params.${arg.name});`);
    }
  }

  if (skill.flags) {
    for (const flag of skill.flags) {
      if (flag.type === "boolean") {
        lines.push(
          `    if (params.${flag.name}) args.push("--${flag.name}");`,
        );
      } else {
        lines.push(
          `    if (params.${flag.name} !== undefined) args.push("--${flag.name}", String(params.${flag.name}));`,
        );
      }
    }
  }

  return lines.join("\n");
}

function generateIndexTs(skills: SkillMeta[]): string {
  const registrations = skills
    .map((skill) => {
      const tName = toolName(skill.name);
      const paramSchema = buildParameterSchema(skill);
      const cliArgs = buildCliArgs(skill);

      return `  api.registerTool({
    name: "${tName}",
    description: ${JSON.stringify(skill.description)},
    parameters: ${paramSchema},
    async execute(_id: string, params: Record<string, unknown>) {
      const args = ["run", "${skill.name}"];
${cliArgs}
      const result = await execPromise("dex", args);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });`;
    })
    .join("\n\n");

  return `import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function execPromise(cmd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return (stdout + (stderr ? "\\nSTDERR:\\n" + stderr : "")).trim();
}

// OpenClaw plugin entry point
export default function register(api: any, Type: any) {
${registrations}
}
`;
}

function generateSkillMd(skill: SkillMeta): string {
  const tName = toolName(skill.name);
  const paramDocs: string[] = [];

  if (skill.args) {
    for (const arg of skill.args) {
      const req = arg.required ? " (required)" : "";
      paramDocs.push(`- \`${arg.name}\`: ${arg.description}${req}`);
    }
  }

  if (skill.flags) {
    for (const flag of skill.flags) {
      const defStr =
        flag.default !== undefined ? ` (default: ${flag.default})` : "";
      paramDocs.push(
        `- \`${flag.name}\`: ${flag.description ?? flag.name}${defStr}`,
      );
    }
  }

  const paramSection =
    paramDocs.length > 0 ? `\n\nParameters:\n${paramDocs.join("\n")}` : "";

  return `---
name: ${tName}
description: ${skill.description}
---
Use the \`${tName}\` tool to ${skill.description.toLowerCase()}.${paramSection}
`;
}

function generateManifest(skills: SkillMeta[]): object {
  return {
    id: "dex",
    name: "dex",
    description:
      "AI development tools — code review, commit messages, refactoring, and more",
    version: "1.1.0",
    skills: skills.map((s) => `skills/${s.name}`),
  };
}

function extractSkillMetas(registry: SkillRegistry): SkillMeta[] {
  return registry.list().map((s) => ({
    name: s.manifest.name,
    description: s.manifest.description,
    args: s.manifest.inputs.args,
    flags: s.manifest.inputs.flags,
  }));
}

export function createOpenClawCommand(
  registry: SkillRegistry,
  logger: Logger,
): Command {
  const cmd = new Command("openclaw").description(
    "Generate OpenClaw plugin integration",
  );

  cmd
    .command("init")
    .description(
      "Generate an OpenClaw plugin in the current directory",
    )
    .action(async () => {
      const cwd = process.cwd();
      const skills = extractSkillMetas(registry);

      if (skills.length === 0) {
        logger.error("No skills loaded. Cannot generate plugin.");
        process.exitCode = 1;
        return;
      }

      // Write manifest.json
      const manifest = generateManifest(skills);
      await writeFile(
        join(cwd, "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );
      console.log(chalk.green("  Created manifest.json"));

      // Write index.ts
      await writeFile(join(cwd, "index.ts"), generateIndexTs(skills));
      console.log(chalk.green("  Created index.ts"));

      // Write skills/ directory with SKILL.md for each skill
      const skillsDir = join(cwd, "skills");
      await mkdir(skillsDir, { recursive: true });

      for (const skill of skills) {
        const skillDir = join(skillsDir, skill.name);
        await mkdir(skillDir, { recursive: true });
        await writeFile(join(skillDir, "SKILL.md"), generateSkillMd(skill));
      }
      console.log(
        chalk.green(`  Created skills/ with ${skills.length} SKILL.md files`),
      );

      console.log(
        chalk.cyan(
          "\nOpenClaw plugin generated. Place it in ~/.openclaw/plugins/dex/",
        ),
      );
    });

  cmd
    .command("export")
    .description(
      "Export a standalone OpenClaw plugin package to a target directory",
    )
    .argument(
      "[target]",
      "Target directory",
      join(process.env.HOME ?? "~", ".openclaw", "plugins", "dex"),
    )
    .action(async (target: string) => {
      const skills = extractSkillMetas(registry);

      if (skills.length === 0) {
        logger.error("No skills loaded. Cannot generate plugin.");
        process.exitCode = 1;
        return;
      }

      // Create target directory
      await mkdir(target, { recursive: true });

      // Write manifest.json
      const manifest = generateManifest(skills);
      await writeFile(
        join(target, "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );

      // Write index.ts
      await writeFile(join(target, "index.ts"), generateIndexTs(skills));

      // Write skills/ directory
      const skillsDir = join(target, "skills");
      await mkdir(skillsDir, { recursive: true });

      for (const skill of skills) {
        const skillDir = join(skillsDir, skill.name);
        await mkdir(skillDir, { recursive: true });
        await writeFile(join(skillDir, "SKILL.md"), generateSkillMd(skill));
      }

      console.log(chalk.green(`OpenClaw plugin exported to ${target}`));
      console.log(
        chalk.gray(
          `  ${skills.length} skills registered as OpenClaw tools`,
        ),
      );
    });

  return cmd;
}
