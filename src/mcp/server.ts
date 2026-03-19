import type { SkillRegistry } from "../skills/registry.js";
import type { DexConfig } from "../core/config.js";
import type { Logger } from "../core/logger.js";
import { createStdioTransport } from "../acp/transport.js";
import type { JsonRpcRequest, JsonRpcResponse } from "../acp/types.js";
import { JSON_RPC_ERRORS } from "../acp/types.js";
import { getVersion } from "../core/version.js";
import { getAllToolDefinitions, executeToolCall, KNOWN_TOOLS } from "../core/tools.js";
import { executeSkillForAcp } from "../skills/executor.js";
import type {
  McpToolDefinition,
  McpInitializeResult,
  McpToolsListResult,
  McpToolsCallResult,
} from "./types.js";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const SKILL_TOOL_PREFIX = "dex_";

function skillNameToToolName(skillName: string): string {
  return `${SKILL_TOOL_PREFIX}${skillName}`;
}

function toolNameToSkillName(toolName: string): string | null {
  if (toolName.startsWith(SKILL_TOOL_PREFIX)) {
    return toolName.slice(SKILL_TOOL_PREFIX.length);
  }
  return null;
}

function buildSkillTools(registry: SkillRegistry): McpToolDefinition[] {
  return registry.list().map((skill) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Convert skill args to JSON Schema properties
    if (skill.manifest.inputs.args) {
      for (const arg of skill.manifest.inputs.args) {
        properties[arg.name] = {
          type: "string",
          description: arg.description,
        };
        if (arg.required) {
          required.push(arg.name);
        }
      }
    }

    // Convert skill flags to JSON Schema properties
    if (skill.manifest.inputs.flags) {
      for (const flag of skill.manifest.inputs.flags) {
        properties[flag.name] = {
          type: flag.type,
          description: flag.description ?? flag.name,
          ...(flag.default !== undefined ? { default: flag.default } : {}),
        };
      }
    }

    return {
      name: skillNameToToolName(skill.manifest.name),
      description: skill.manifest.description,
      inputSchema: {
        type: "object" as const,
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    };
  });
}

function buildBuiltInTools(): McpToolDefinition[] {
  return getAllToolDefinitions().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema as McpToolDefinition["inputSchema"],
  }));
}

export function createMcpServer(
  registry: SkillRegistry,
  config: DexConfig,
  logger: Logger,
) {
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
        const result: McpInitializeResult = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: "dex",
            version: getVersion(),
          },
        };
        return { jsonrpc: "2.0", id, result };
      }

      case "notifications/initialized": {
        // Client acknowledgement — no response needed but we return success
        return { jsonrpc: "2.0", id, result: {} };
      }

      case "tools/list": {
        const skillTools = buildSkillTools(registry);
        const builtInTools = buildBuiltInTools();
        const result: McpToolsListResult = {
          tools: [...skillTools, ...builtInTools],
        };
        return { jsonrpc: "2.0", id, result };
      }

      case "tools/call": {
        const toolName = params?.name as string;
        const args = (params?.arguments ?? {}) as Record<string, unknown>;

        if (!toolName || typeof toolName !== "string") {
          return makeError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Missing or invalid tool name");
        }

        // Check if it's a skill tool (prefixed with dex_)
        const skillName = toolNameToSkillName(toolName);
        if (skillName && registry.has(skillName)) {
          try {
            const skill = registry.get(skillName);
            const cwd = (args.cwd as string) || process.cwd();

            // Separate args and flags for skill execution
            const skillArgs: Record<string, string> = {};
            const skillFlags: Record<string, string | boolean | number> = {};

            if (skill.manifest.inputs.args) {
              for (const argDef of skill.manifest.inputs.args) {
                if (args[argDef.name] !== undefined) {
                  skillArgs[argDef.name] = String(args[argDef.name]);
                }
              }
            }
            if (skill.manifest.inputs.flags) {
              for (const flagDef of skill.manifest.inputs.flags) {
                if (args[flagDef.name] !== undefined) {
                  skillFlags[flagDef.name] = args[flagDef.name] as string | boolean | number;
                }
              }
            }

            const output = await executeSkillForAcp(skill, {
              args: skillArgs,
              flags: skillFlags,
              cwd,
              config,
              logger,
            });

            const result: McpToolsCallResult = {
              content: [{ type: "text", text: output || "Done" }],
            };
            return { jsonrpc: "2.0", id, result };
          } catch (err) {
            const result: McpToolsCallResult = {
              content: [{
                type: "text",
                text: err instanceof Error ? err.message : String(err),
              }],
              isError: true,
            };
            return { jsonrpc: "2.0", id, result };
          }
        }

        // Check if it's a built-in tool
        if (KNOWN_TOOLS.includes(toolName)) {
          try {
            const cwd = (args.cwd as string) || process.cwd();
            const output = await executeToolCall(toolName, args, cwd, KNOWN_TOOLS);
            const result: McpToolsCallResult = {
              content: [{ type: "text", text: output }],
              isError: output.startsWith("Error:"),
            };
            return { jsonrpc: "2.0", id, result };
          } catch (err) {
            const result: McpToolsCallResult = {
              content: [{
                type: "text",
                text: err instanceof Error ? err.message : String(err),
              }],
              isError: true,
            };
            return { jsonrpc: "2.0", id, result };
          }
        }

        return makeError(
          id,
          JSON_RPC_ERRORS.METHOD_NOT_FOUND,
          `Unknown tool: ${toolName}`,
        );
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
    },
    stop: () => {
      transport.stop();
    },
  };
}
