import { Command } from "commander";
import { createInterface } from "node:readline";
import { exec } from "node:child_process";
import chalk from "chalk";
import Anthropic from "@anthropic-ai/sdk";
import { setConfigValue, getGlobalConfigDir } from "../../core/config.js";
import type { DexConfig } from "../../core/config.js";

const CONSOLE_URL = "https://console.anthropic.com/settings/keys";

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`);
}

async function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: process.stdin.isTTY ?? false,
    });

    // Hide input on TTY
    if (process.stdin.isTTY) {
      process.stderr.write(question);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);

      let input = "";
      const onData = (ch: Buffer) => {
        const c = ch.toString();
        if (c === "\n" || c === "\r") {
          stdin.setRawMode(wasRaw);
          stdin.removeListener("data", onData);
          process.stderr.write("\n");
          rl.close();
          resolve(input);
        } else if (c === "\u0003") {
          // Ctrl+C
          stdin.setRawMode(wasRaw);
          process.exit(1);
        } else if (c === "\u007f" || c === "\b") {
          // Backspace
          if (input.length > 0) input = input.slice(0, -1);
        } else {
          input += c;
        }
      };
      stdin.on("data", onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

async function validateApiKey(key: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey: key });
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return true;
  } catch (err: any) {
    if (err?.status === 401) return false;
    // Other errors (rate limit, etc.) mean the key is valid
    return true;
  }
}

export function createLoginCommand(config: DexConfig): Command {
  return new Command("login")
    .description("Authenticate with your Anthropic API key")
    .option("--no-browser", "Don't open browser automatically")
    .action(async (opts: { browser?: boolean }) => {
      console.log(chalk.bold("\ndex login\n"));

      // Check if already logged in
      if (config.apiKey) {
        console.log(
          chalk.green("✔") +
            ` Already authenticated (key: ****${config.apiKey.slice(-4)})`,
        );
        console.log(
          chalk.gray("  Run dex logout to remove, or continue to replace.\n"),
        );
      }

      // Open browser to Anthropic Console
      if (opts.browser !== false) {
        console.log(`Opening Anthropic Console to create an API key...`);
        console.log(chalk.gray(`  ${CONSOLE_URL}\n`));
        openBrowser(CONSOLE_URL);
      } else {
        console.log(`Get your API key from: ${chalk.cyan(CONSOLE_URL)}\n`);
      }

      // Prompt for key
      const key = await promptHidden("Paste your API key: ");

      if (!key) {
        console.log(chalk.red("\nNo key provided. Aborted."));
        return;
      }

      if (!key.startsWith("sk-ant-")) {
        console.log(
          chalk.yellow(
            "\n⚠ Key doesn't start with 'sk-ant-'. Are you sure this is correct?",
          ),
        );
      }

      // Validate
      process.stderr.write("Validating key...");
      const valid = await validateApiKey(key);

      if (!valid) {
        console.log(chalk.red(" ✖ Invalid API key."));
        return;
      }

      console.log(chalk.green(" ✔ Valid!"));

      // Save
      await setConfigValue("apiKey", key, true);
      console.log(
        chalk.green(`\nAPI key saved to ${getGlobalConfigDir()}/config.json`),
      );
      console.log(chalk.gray("You're ready to go! Try: dex review\n"));
    });
}

export function createLogoutCommand(): Command {
  return new Command("logout")
    .description("Remove stored API key")
    .action(async () => {
      await setConfigValue("apiKey", undefined, true);
      console.log(chalk.green("API key removed."));
      console.log(
        chalk.gray(
          "You can still use ANTHROPIC_API_KEY environment variable.\n",
        ),
      );
    });
}
