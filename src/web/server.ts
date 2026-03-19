import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { SkillRegistry } from "../skills/registry.js";
import type { DexConfig } from "../core/config.js";
import type { Logger } from "../core/logger.js";
import { UsageTracker } from "../core/usage.js";
import { executeSkillForAcp } from "../skills/executor.js";
import { getDashboardHtml } from "./dashboard.js";

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
