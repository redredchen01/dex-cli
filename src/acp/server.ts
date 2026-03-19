import type { SkillRegistry } from "../skills/registry.js";
import type { DexConfig } from "../core/config.js";
import type { Logger } from "../core/logger.js";
import { createStdioTransport } from "./transport.js";
import { SessionManager } from "./session.js";
import { handlePrompt } from "./handler.js";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { JSON_RPC_ERRORS } from "./types.js";
import { getVersion } from "../core/version.js";

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export function createAcpServer(
  registry: SkillRegistry,
  config: DexConfig,
  logger: Logger,
) {
  const sessions = new SessionManager();
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  function makeError(
    id: string | number,
    code: number,
    message: string,
  ): JsonRpcResponse {
    return { jsonrpc: "2.0", id, error: { code, message } };
  }

  async function handleRequest(
    req: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    const { id, method, params } = req;

    switch (method) {
      case "initialize": {
        const skills = registry.list().map((s) => ({
          name: s.manifest.name,
          description: s.manifest.description,
          parameters: {
            args: s.manifest.inputs.args,
            flags: s.manifest.inputs.flags,
            context: s.manifest.inputs.context,
          },
        }));

        return {
          jsonrpc: "2.0",
          id,
          result: {
            name: "dex",
            version: getVersion(),
            capabilities: { skills },
          },
        };
      }

      case "session/new": {
        const skillName = params?.skill;
        if (!isString(skillName)) {
          return makeError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Missing or invalid skill name");
        }
        if (!registry.has(skillName)) {
          return makeError(
            id,
            JSON_RPC_ERRORS.INVALID_PARAMS,
            `Unknown skill: ${skillName}`,
          );
        }

        const session = sessions.create(skillName);
        return {
          jsonrpc: "2.0",
          id,
          result: { sessionId: session.id, skill: skillName },
        };
      }

      case "session/prompt": {
        const sessionId = params?.sessionId;
        const prompt = params?.prompt;

        if (!isString(sessionId)) {
          return makeError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Missing or invalid sessionId");
        }
        if (!isString(prompt)) {
          return makeError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Missing or invalid prompt");
        }

        const session = sessions.get(sessionId);
        if (!session) {
          return makeError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid session");
        }
        if (session.status !== "active") {
          return makeError(
            id,
            JSON_RPC_ERRORS.INVALID_PARAMS,
            `Session is ${session.status}`,
          );
        }

        try {
          const result = await handlePrompt(
            {
              sessionId,
              skillName: session.skillName,
              prompt,
              args: (params?.args ?? {}) as Record<string, string>,
              flags: (params?.flags ?? {}) as Record<string, string | boolean | number>,
            },
            registry,
            config,
            logger,
          );

          sessions.complete(sessionId);
          return { jsonrpc: "2.0", id, result };
        } catch (err) {
          sessions.complete(sessionId);
          return makeError(
            id,
            JSON_RPC_ERRORS.INTERNAL_ERROR,
            err instanceof Error ? err.message : "Internal error",
          );
        }
      }

      case "session/cancel": {
        const sid = params?.sessionId;
        if (!isString(sid)) {
          return makeError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Missing or invalid sessionId");
        }
        sessions.cancel(sid);
        return { jsonrpc: "2.0", id, result: { cancelled: true } };
      }

      default:
        return makeError(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${method}`);
    }
  }

  const transport = createStdioTransport(handleRequest);

  return {
    start: () => {
      transport.onClose = () => process.exit(0);
      transport.start();
      // Clean up stale sessions every 10 minutes
      cleanupTimer = setInterval(() => {
        sessions.cleanup();
      }, 10 * 60 * 1000);
      cleanupTimer.unref(); // Don't prevent process exit
    },
    stop: () => {
      transport.stop();
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    },
  };
}
