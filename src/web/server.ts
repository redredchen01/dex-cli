import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { SkillRegistry } from "../skills/registry.js";
import type { DexConfig } from "../core/config.js";
import type { Logger } from "../core/logger.js";
import { UsageTracker } from "../core/usage.js";
import { executeSkillForAcp } from "../skills/executor.js";
import { getDashboardHtml } from "./dashboard.js";
import { KNOWN_TOOLS, getToolsForSkill, executeToolCall } from "../core/tools.js";
import { createAgent } from "../core/agent.js";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json",
  });
  res.end(body);
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    ...corsHeaders(),
    "Content-Type": "text/html; charset=utf-8",
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function maskApiKey(key: string | undefined): string {
  if (!key) return "(not set)";
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function buildOpenApiSchema(): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    info: {
      title: "Dex REST API",
      description: "REST API for the Dex AI development tool. Enables agent integration via HTTP.",
      version: "1.1.0",
    },
    paths: {
      "/api/skills": {
        get: {
          summary: "List registered skills",
          operationId: "listSkills",
          responses: {
            "200": {
              description: "Array of registered skills",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        source: { type: "string", enum: ["built-in", "user", "project"] },
                        version: { type: "string" },
                        aliases: { type: "array", items: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/run": {
        post: {
          summary: "Execute a registered skill",
          operationId: "runSkill",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["skill"],
                  properties: {
                    skill: { type: "string", description: "Name of the skill to execute" },
                    args: { type: "object", additionalProperties: { type: "string" }, description: "Positional arguments" },
                    flags: { type: "object", additionalProperties: {}, description: "Flags for the skill" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Skill output",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      output: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": { description: "Invalid request" },
            "404": { description: "Unknown skill" },
            "500": { description: "Execution error" },
          },
        },
      },
      "/api/tools": {
        get: {
          summary: "List built-in tools",
          operationId: "listTools",
          responses: {
            "200": {
              description: "Array of available tools",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        input_schema: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/tools/call": {
        post: {
          summary: "Execute a built-in tool directly",
          operationId: "callTool",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "input"],
                  properties: {
                    name: { type: "string", description: "Tool name (e.g. search_files, bash)" },
                    input: { type: "object", additionalProperties: {}, description: "Tool input parameters" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Tool execution result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": { description: "Invalid request" },
            "404": { description: "Unknown tool" },
            "500": { description: "Execution error" },
          },
        },
      },
      "/api/chat": {
        post: {
          summary: "Stateless chat endpoint for agent integration",
          operationId: "chat",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: {
                    message: { type: "string", description: "The chat message / prompt" },
                    tools: { type: "boolean", description: "Whether to enable built-in tools", default: false },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Chat response with usage stats",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      response: { type: "string" },
                      usage: {
                        type: "object",
                        properties: {
                          inputTokens: { type: "integer" },
                          outputTokens: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "Invalid request" },
            "500": { description: "Chat error" },
          },
        },
      },
    },
  };
}

export interface WebServerOptions {
  port: number;
  registry: SkillRegistry;
  config: DexConfig;
  logger: Logger;
}

export function createWebServer(opts: WebServerOptions) {
  const { registry, config, logger } = opts;
  const tracker = new UsageTracker();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    try {
      if (req.method === "GET" && path === "/") {
        html(res, getDashboardHtml());
        return;
      }

      if (req.method === "GET" && path === "/api/skills") {
        const skills = registry.list().map((s) => ({
          name: s.manifest.name,
          description: s.manifest.description,
          source: s.source,
          version: s.manifest.version,
          aliases: s.manifest.aliases ?? [],
        }));
        json(res, skills);
        return;
      }

      if (req.method === "GET" && path === "/api/usage") {
        const summary = await tracker.getSummary(1); // today
        json(res, summary);
        return;
      }

      if (req.method === "GET" && path === "/api/config") {
        const safeConfig: Record<string, unknown> = {
          model: config.model,
          maxTurns: config.maxTurns,
          provider: config.provider ?? "anthropic",
          verbose: config.verbose,
          skillDirs: config.skillDirs,
          apiKey: maskApiKey(config.apiKey),
        };
        if (config.activeProfile) {
          safeConfig.activeProfile = config.activeProfile;
        }
        json(res, safeConfig);
        return;
      }

      if (req.method === "GET" && path === "/api/openapi.json") {
        json(res, buildOpenApiSchema());
        return;
      }

      if (req.method === "GET" && path === "/api/tools") {
        const tools = getToolsForSkill(KNOWN_TOOLS).map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        }));
        json(res, tools);
        return;
      }

      if (req.method === "POST" && path === "/api/tools/call") {
        const body = await readBody(req);
        let parsed: { name?: string; input?: Record<string, unknown> };
        try {
          parsed = JSON.parse(body);
        } catch {
          json(res, { error: "Invalid JSON body" }, 400);
          return;
        }

        const toolName = parsed.name;
        if (!toolName || typeof toolName !== "string") {
          json(res, { error: "Missing tool name" }, 400);
          return;
        }
        if (!KNOWN_TOOLS.includes(toolName)) {
          json(res, { error: `Unknown tool: ${toolName}` }, 404);
          return;
        }

        try {
          const result = await executeToolCall(
            toolName,
            parsed.input ?? {},
            process.cwd(),
            KNOWN_TOOLS,
          );
          json(res, { result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Tool execution failed";
          json(res, { error: message }, 500);
        }
        return;
      }

      if (req.method === "POST" && path === "/api/chat") {
        const body = await readBody(req);
        let parsed: { message?: string; tools?: boolean };
        try {
          parsed = JSON.parse(body);
        } catch {
          json(res, { error: "Invalid JSON body" }, 400);
          return;
        }

        const message = parsed.message;
        if (!message || typeof message !== "string") {
          json(res, { error: "Missing message" }, 400);
          return;
        }

        try {
          const agent = createAgent(config);
          const enableTools = parsed.tools === true;
          const textChunks: string[] = [];
          let usageInfo = { inputTokens: 0, outputTokens: 0 };

          for await (const msg of agent.query(message, {
            tools: enableTools ? KNOWN_TOOLS : undefined,
            cwd: process.cwd(),
          })) {
            if (msg.type === "text" && msg.content) {
              textChunks.push(msg.content);
            }
            if (msg.type === "done" && msg.content) {
              try {
                const usage = JSON.parse(msg.content);
                usageInfo = {
                  inputTokens: usage.inputTokens ?? 0,
                  outputTokens: usage.outputTokens ?? 0,
                };
              } catch {
                // ignore parse errors on done message
              }
            }
          }

          json(res, {
            response: textChunks.join(""),
            usage: usageInfo,
          });
        } catch (err) {
          const message_ = err instanceof Error ? err.message : "Chat failed";
          json(res, { error: message_ }, 500);
        }
        return;
      }

      if (req.method === "POST" && path === "/api/run") {
        const body = await readBody(req);
        let parsed: { skill?: string; args?: Record<string, string>; flags?: Record<string, string | boolean | number> };
        try {
          parsed = JSON.parse(body);
        } catch {
          json(res, { error: "Invalid JSON body" }, 400);
          return;
        }

        const skillName = parsed.skill;
        if (!skillName || typeof skillName !== "string") {
          json(res, { error: "Missing skill name" }, 400);
          return;
        }

        if (!registry.has(skillName)) {
          json(res, { error: `Unknown skill: ${skillName}` }, 404);
          return;
        }

        const skill = registry.get(skillName);
        try {
          const output = await executeSkillForAcp(skill, {
            args: parsed.args ?? {},
            flags: parsed.flags ?? {},
            cwd: process.cwd(),
            config,
            logger,
          });
          json(res, { output });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Skill execution failed";
          json(res, { error: message }, 500);
        }
        return;
      }

      // 404
      json(res, { error: "Not found" }, 404);
    } catch (err) {
      logger.error(`HTTP error: ${err instanceof Error ? err.message : err}`);
      json(res, { error: "Internal server error" }, 500);
    }
  });

  return {
    start(port: number): Promise<void> {
      return new Promise((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, () => {
          resolve();
        });
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
    server,
  };
}
