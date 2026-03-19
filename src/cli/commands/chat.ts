import { Command } from "commander";
import { createInterface } from "node:readline";
import chalk from "chalk";
import type { DexConfig } from "../../core/config.js";
import type { Logger } from "../../core/logger.js";
import { createAgent } from "../../core/agent.js";
import { KNOWN_TOOLS } from "../../core/tools.js";
import { getFileTree } from "../../utils/fs.js";

export function createChatCommand(
  config: DexConfig,
  logger: Logger,
): Command {
  return new Command("chat")
    .description("Interactive AI chat with tool use")
    .option(
      "--tools <tools>",
      `Comma-separated tools to enable (${KNOWN_TOOLS.join(", ")})`,
      KNOWN_TOOLS.join(","),
    )
    .option("--no-tools", "Disable all tools")
    .action(async (opts: { tools?: string | boolean }) => {
      const enabledTools =
        opts.tools === false
          ? []
          : typeof opts.tools === "string"
            ? opts.tools.split(",").filter(Boolean)
            : KNOWN_TOOLS;

      const agent = createAgent(config);
      const cwd = process.cwd();

      // Gather initial context
      let projectContext = "";
      try {
        const tree = await getFileTree(cwd, 2);
        projectContext = `\nProject structure:\n\`\`\`\n${tree}\n\`\`\`\n`;
      } catch {}

      const systemPrompt = `You are a helpful AI development assistant. You are working in the directory: ${cwd}
${projectContext}
${enabledTools.length > 0 ? `You have access to tools: ${enabledTools.join(", ")}. Use them when needed to help the user.` : ""}
Be concise and helpful. When modifying files, explain what you changed.`;

      console.log(
        chalk.bold(`\ndex chat`) +
          chalk.gray(
            ` (${config.model}${enabledTools.length > 0 ? `, tools: ${enabledTools.join(",")}` : ""})`,
          ),
      );
      console.log(chalk.gray("Type your message. Ctrl+C to exit.\n"));

      const rl = createInterface({
        input: process.stdin,
        output: process.stderr,
        prompt: chalk.cyan("you › "),
        terminal: process.stdin.isTTY ?? false,
      });

      rl.prompt();

      rl.on("line", async (line) => {
        const input = line.trim();
        if (!input) {
          rl.prompt();
          return;
        }

        if (input === "/quit" || input === "/exit") {
          rl.close();
          return;
        }

        process.stderr.write(chalk.green("\ndex › "));

        try {
          for await (const msg of agent.query(input, {
            systemPrompt,
            tools: enabledTools,
            cwd,
          })) {
            switch (msg.type) {
              case "text":
                if (msg.content) process.stdout.write(msg.content);
                break;
              case "tool_use":
                process.stderr.write(
                  chalk.gray(`\n[tool: ${msg.toolName}]\n`),
                );
                break;
              case "tool_result":
                if (config.verbose && msg.content) {
                  process.stderr.write(
                    chalk.gray(
                      `[result: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? "..." : ""}]\n`,
                    ),
                  );
                }
                break;
              case "done":
                if (msg.content && config.verbose) {
                  try {
                    const usage = JSON.parse(msg.content);
                    process.stderr.write(
                      chalk.gray(
                        `\n[${usage.inputTokens} in / ${usage.outputTokens} out, ${usage.turns} turn(s)]\n`,
                      ),
                    );
                  } catch {}
                }
                break;
              case "error":
                process.stderr.write(
                  chalk.red(`\n[error: ${msg.content}]\n`),
                );
                break;
            }
          }
        } catch (err) {
          process.stderr.write(
            chalk.red(
              `\nError: ${err instanceof Error ? err.message : err}\n`,
            ),
          );
        }

        process.stdout.write("\n");
        process.stderr.write("\n");
        rl.prompt();
      });

      rl.on("close", () => {
        console.log(chalk.gray("\nGoodbye!"));
        process.exit(0);
      });
    });
}
