import { Command } from "commander";
import type { SkillRegistry } from "../../skills/registry.js";
import type { DexConfig } from "../../core/config.js";
import type { Logger } from "../../core/logger.js";
import { createAcpServer } from "../../acp/server.js";

export function createServeCommand(
  registry: SkillRegistry,
  config: DexConfig,
  logger: Logger,
): Command {
  return new Command("serve")
    .description("Start ACP server (stdio)")
    .option("-p, --port <port>", "Port for HTTP transport (default: stdio)")
    .action(async () => {
      logger.info("Starting ACP server on stdio...");
      const server = createAcpServer(registry, config, logger);
      server.start();
    });
}
