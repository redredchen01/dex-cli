import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DexConfig } from "../../core/config.js";
import { SkillRegistry } from "../../skills/registry.js";
import type { LoadedSkill } from "../../skills/types.js";
import { createLogger } from "../../core/logger.js";

// Mock executor
vi.mock("../../skills/executor.js", () => ({
  executeSkillForAcp: vi.fn().mockResolvedValue("skill output here"),
}));

// Mock version
vi.mock("../../core/version.js", () => ({
  getVersion: () => "1.1.0-test",
}));

// Mock usage tracker
vi.mock("../../core/usage.js", () => ({
  UsageTracker: vi.fn().mockImplementation(() => ({
    getSummary: vi.fn().mockResolvedValue({
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalTokens: 1500,
      estimatedCost: 0.012,
      entries: 3,
      perSkill: {},
    }),
  })),
}));

import { createWebServer } from "../server.js";

function makeSkill(name: string): LoadedSkill {
  return {
    manifest: {
      name,
      version: "1.0.0",
      description: `${name} skill`,
      inputs: {
        args: [{ name: "file", description: "target file" }],
        flags: [{ name: "verbose", type: "boolean" as const }],
      },
    },
    handler: async () => {},
    path: `/skills/${name}`,
    source: "built-in",
  };
}

const config: DexConfig = {
  apiKey: "sk-ant-1234567890abcdef1234567890abcdef",
  model: "claude-sonnet-4-6-20250527",
  maxTurns: 10,
  skillDirs: [],
  verbose: false,
};

async function request(
  port: number,
  path: string,
  options?: RequestInit,
): Promise<{ status: number; json: () => Promise<any>; text: () => Promise<string> }> {
  const res = await fetch(`http://localhost:${port}${path}`, options);
  return {
    status: res.status,
    json: () => res.json(),
    text: () => res.text(),
  };
}

describe("Web Server", () => {
  let registry: SkillRegistry;
  let webServer: ReturnType<typeof createWebServer>;
  const port = 31410 + Math.floor(Math.random() * 100);

  beforeEach(async () => {
    registry = new SkillRegistry();
    registry.register(makeSkill("review"));
    registry.register(makeSkill("explain"));

    const logger = createLogger("error");
    webServer = createWebServer({ port, registry, config, logger });
    await webServer.start(port);
  });

  afterEach(async () => {
    await webServer.stop();
  });

  it("GET / should return HTML dashboard", async () => {
    const res = await request(port, "/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("dex dashboard");
    expect(body).toContain("1.1.0-test");
  });

  it("GET /api/skills should return skill list", async () => {
    const res = await request(port, "/api/skills");
    expect(res.status).toBe(200);
    const skills = await res.json();
    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe("review");
    expect(skills[1].name).toBe("explain");
    expect(skills[0].source).toBe("built-in");
  });

  it("GET /api/usage should return usage summary", async () => {
    const res = await request(port, "/api/usage");
    expect(res.status).toBe(200);
    const usage = await res.json();
    expect(usage.totalTokens).toBe(1500);
    expect(usage.estimatedCost).toBe(0.012);
    expect(usage.entries).toBe(3);
  });

  it("GET /api/config should return masked config", async () => {
    const res = await request(port, "/api/config");
    expect(res.status).toBe(200);
    const cfg = await res.json();
    expect(cfg.model).toBe("claude-sonnet-4-6-20250527");
    expect(cfg.apiKey).not.toContain("1234567890abcdef");
    expect(cfg.apiKey).toContain("...");
  });

  it("POST /api/run should execute a skill", async () => {
    const res = await request(port, "/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: "review", args: {}, flags: {} }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.output).toBe("skill output here");
  });

  it("POST /api/run should return 404 for unknown skill", async () => {
    const res = await request(port, "/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Unknown skill");
  });

  it("POST /api/run should return 400 for missing skill name", async () => {
    const res = await request(port, "/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("GET /unknown should return 404", async () => {
    const res = await request(port, "/unknown");
    expect(res.status).toBe(404);
  });

  it("should include CORS headers", async () => {
    const raw = await fetch(`http://localhost:${port}/api/skills`);
    expect(raw.headers.get("access-control-allow-origin")).toBe("*");
  });
});
