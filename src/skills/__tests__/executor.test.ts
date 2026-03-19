import { describe, it, expect, vi } from "vitest";
import { executeSkill } from "../executor.js";
import type { LoadedSkill, SkillContext } from "../types.js";
import type { DexConfig } from "../../core/config.js";
import { createLogger } from "../../core/logger.js";

// Mock the agent module
vi.mock("../../core/agent.js", () => ({
  createAgent: () => ({
    async *query() {
      yield { type: "text", content: "mock response" };
      yield { type: "done", content: JSON.stringify({ inputTokens: 10, outputTokens: 5, stopReason: "end_turn" }) };
    },
  }),
}));

function makeTestSkill(
  handler: (ctx: SkillContext) => Promise<void>,
  context: string[] = [],
): LoadedSkill {
  return {
    manifest: {
      name: "test-skill",
      version: "1.0.0",
      description: "Test",
      inputs: { context: context as any },
    },
    handler,
    path: "/test",
    source: "user",
  };
}

const testConfig: DexConfig = {
  model: "claude-sonnet-4-6-20250527",
  maxTurns: 10,
  skillDirs: [],
  verbose: false,
};

describe("executeSkill", () => {
  it("should call handler with correct context", async () => {
    let capturedCtx: SkillContext | null = null;

    const skill = makeTestSkill(async (ctx) => {
      capturedCtx = ctx;
    });

    await executeSkill(skill, {
      args: { file: "test.ts" },
      flags: { staged: true },
      cwd: process.cwd(),
      config: testConfig,
      logger: createLogger("error"),
    });

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.args.file).toBe("test.ts");
    expect(capturedCtx!.flags.staged).toBe(true);
    expect(capturedCtx!.context.cwd).toBe(process.cwd());
    expect(capturedCtx!.agent).toBeDefined();
  });

  it("should provide agent on context", async () => {
    let hasAgent = false;

    const skill = makeTestSkill(async (ctx) => {
      hasAgent = typeof ctx.agent.query === "function";
    });

    await executeSkill(skill, {
      args: {},
      flags: {},
      cwd: process.cwd(),
      config: testConfig,
      logger: createLogger("error"),
    });

    expect(hasAgent).toBe(true);
  });

  it("should propagate handler errors", async () => {
    const skill = makeTestSkill(async () => {
      throw new Error("handler failed");
    });

    await expect(
      executeSkill(skill, {
        args: {},
        flags: {},
        cwd: process.cwd(),
        config: testConfig,
        logger: createLogger("error"),
      }),
    ).rejects.toThrow("handler failed");
  });
});
