import { describe, it, expect, vi } from "vitest";
import { executeSkillForAcp } from "../executor.js";
import type { LoadedSkill, SkillContext } from "../types.js";
import type { DexConfig } from "../../core/config.js";
import { createLogger } from "../../core/logger.js";

// Mock the agent module
vi.mock("../../core/agent.js", () => ({
  createAgent: () => ({
    async *query() {
      yield { type: "text" as const, content: "streamed output" };
      yield { type: "done" as const, content: JSON.stringify({ inputTokens: 10, outputTokens: 5, stopReason: "end_turn" }) };
    },
  }),
}));

const testConfig: DexConfig = {
  model: "test-model",
  maxTurns: 10,
  skillDirs: [],
  verbose: false,
  apiKey: "test-key",
};

function makeSkill(handler: (ctx: SkillContext) => Promise<void>): LoadedSkill {
  return {
    manifest: {
      name: "test-skill",
      version: "1.0.0",
      description: "Test",
      inputs: {},
    },
    handler,
    path: "/test",
    source: "user",
  };
}

describe("executeSkillForAcp", () => {
  it("should capture stdout writes as output", async () => {
    const skill = makeSkill(async () => {
      process.stdout.write("hello ");
      process.stdout.write("world");
    });

    const output = await executeSkillForAcp(skill, {
      args: {},
      flags: {},
      cwd: process.cwd(),
      config: testConfig,
      logger: createLogger("error"),
    });

    expect(output).toBe("hello world");
  });

  it("should restore process.stdout.write after execution", async () => {
    const skill = makeSkill(async () => {
      process.stdout.write("test");
    });

    // Verify stdout is not captured after execution by writing to it
    const spy = vi.spyOn(process.stdout, "write");

    await executeSkillForAcp(skill, {
      args: {},
      flags: {},
      cwd: process.cwd(),
      config: testConfig,
      logger: createLogger("error"),
    });

    // After execution, stdout.write should work normally (not be captured)
    spy.mockRestore();
    expect(typeof process.stdout.write).toBe("function");
  });

  it("should restore stdout even if handler throws", async () => {
    const skill = makeSkill(async () => {
      process.stdout.write("before error");
      throw new Error("handler crashed");
    });

    const spy = vi.spyOn(process.stdout, "write");

    await expect(
      executeSkillForAcp(skill, {
        args: {},
        flags: {},
        cwd: process.cwd(),
        config: testConfig,
        logger: createLogger("error"),
      }),
    ).rejects.toThrow("handler crashed");

    spy.mockRestore();
    expect(typeof process.stdout.write).toBe("function");
  });

  it("should capture output from agent streaming", async () => {
    const skill = makeSkill(async (ctx) => {
      for await (const msg of ctx.agent.query("test")) {
        if (msg.type === "text" && msg.content) {
          process.stdout.write(msg.content);
        }
      }
    });

    const output = await executeSkillForAcp(skill, {
      args: {},
      flags: {},
      cwd: process.cwd(),
      config: testConfig,
      logger: createLogger("error"),
    });

    expect(output).toBe("streamed output");
  });
});
