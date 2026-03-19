import { Command } from "commander";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import chalk from "chalk";
import type { DexConfig } from "../../core/config.js";
import { getGlobalConfigDir } from "../../core/config.js";
import type { SkillRegistry } from "../../skills/registry.js";
import { getVersion } from "../../core/version.js";

const exec = promisify(execFile);

interface Check {
  name: string;
  run: () => Promise<{ ok: boolean; detail: string }>;
}

export function createDoctorCommand(
  config: DexConfig,
  registry: SkillRegistry,
): Command {
  return new Command("doctor")
    .description("Check system setup and diagnose issues")
    .action(async () => {
      console.log(chalk.bold(`\ndex v${getVersion()} — System Check\n`));

      const checks: Check[] = [
        {
          name: "Node.js",
          async run() {
            const version = process.version;
            const major = parseInt(version.slice(1));
            return {
              ok: major >= 20,
              detail: `${version}${major < 20 ? " (requires >=20)" : ""}`,
            };
          },
        },
        {
          name: "Git",
          async run() {
            try {
              const { stdout } = await exec("git", ["--version"]);
              return { ok: true, detail: stdout.trim() };
            } catch {
              return { ok: false, detail: "Not installed" };
            }
          },
        },
        {
          name: "API Key",
          async run() {
            const key = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
            if (!key) {
              return {
                ok: false,
                detail:
                  "Not set. Run: export ANTHROPIC_API_KEY=<key> or dex config set apiKey <key>",
              };
            }
            return {
              ok: true,
              detail: `****${key.slice(-4)}`,
            };
          },
        },
        {
          name: "Provider",
          async run() {
            const provider = config.provider ?? "anthropic";
            return { ok: true, detail: provider };
          },
        },
        {
          name: "Model",
          async run() {
            return { ok: true, detail: config.model };
          },
        },
        {
          name: "Global config",
          async run() {
            const dir = getGlobalConfigDir();
            return {
              ok: existsSync(dir),
              detail: existsSync(dir)
                ? dir
                : `${dir} (not created — run: dex init)`,
            };
          },
        },
        {
          name: "Skills loaded",
          async run() {
            const skills = registry.list();
            const builtIn = skills.filter((s) => s.source === "built-in").length;
            const user = skills.filter((s) => s.source === "user").length;
            const project = skills.filter((s) => s.source === "project").length;
            return {
              ok: builtIn > 0,
              detail: `${builtIn} built-in, ${user} user, ${project} project`,
            };
          },
        },
        {
          name: "Git repository",
          async run() {
            try {
              await exec("git", ["rev-parse", "--is-inside-work-tree"], {
                cwd: process.cwd(),
              });
              return { ok: true, detail: process.cwd() };
            } catch {
              return {
                ok: false,
                detail: "Current directory is not a git repo",
              };
            }
          },
        },
      ];

      let allOk = true;
      for (const check of checks) {
        const result = await check.run();
        const icon = result.ok ? chalk.green("✔") : chalk.red("✖");
        console.log(`  ${icon} ${chalk.bold(check.name)}: ${result.detail}`);
        if (!result.ok) allOk = false;
      }

      console.log();
      if (allOk) {
        console.log(chalk.green("All checks passed. Ready to go!"));
      } else {
        console.log(
          chalk.yellow("Some checks failed. Fix the issues above to get started."),
        );
      }
      console.log();
    });
}
