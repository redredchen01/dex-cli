import { Command } from "commander";
import { exec } from "node:child_process";
import type { SkillRegistry } from "../../skills/registry.js";
import type { DexConfig } from "../../core/config.js";
import type { Logger } from "../../core/logger.js";
import { createAcpServer } from "../../acp/server.js";
import { createWebServer } from "../../web/server.js";

const DEFAULT_HTTP_PORT = 3141;

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} ${url}`);
}

export function createServeCommand(
  registry: SkillRegistry,
  config: DexConfig,
  logger: Logger,
): Command {
  return new Command("serve")
    .description("Start ACP server (stdio) or web dashboard (--http)")
    .option("--http", "Start HTTP web dashboard instead of stdio ACP")
    .option("-p, --port <port>", "Port for HTTP transport", String(DEFAULT_HTTP_PORT))
    .action(async (opts: { http?: boolean; port?: string }) => {
      if (opts.http) {
        const port = parseInt(opts.port ?? String(DEFAULT_HTTP_PORT), 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          logger.error("Invalid port number");
          process.exitCode = 1;
          return;
        }

        const web = createWebServer({ port, registry, config, logger });
        try {
          await web.start(port);
        } catch (err) {
          logger.error(
            `Failed to start web server: ${err instanceof Error ? err.message : err}`,
          );
          process.exitCode = 1;
          return;
        }

        const url = `http://localhost:${port}`;
        logger.info(`dex dashboard running at ${url}`);
        openBrowser(url);
        return;
      }

      // Default: stdio ACP server
      logger.info("Starting ACP server on stdio...");
      const server = createAcpServer(registry, config, logger);
      server.start();
    });
}
