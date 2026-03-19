import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JsonRpcRequest, JsonRpcResponse } from "../types.js";
import type { DexConfig } from "../../core/config.js";
import { SkillRegistry } from "../../skills/registry.js";
import type { LoadedSkill } from "../../skills/types.js";
import { createLogger } from "../../core/logger.js";

// We test the server logic by extracting the handleRequest function
// Since createAcpServer uses stdio, we test by invoking it indirectly

// Mock the transport to capture the handler
vi.mock("../transport.js", () => ({
  createStdioTransport: (handler: (req: JsonRpcRequest) => Promise<JsonRpcResponse>) => {
    // Store handler for tests
    (globalThis as any).__acpHandler = handler;
    return {
      start: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

// Mock executor
vi.mock("../../skills/executor.js", () => ({
  executeSkillForAcp: vi.fn().mockResolvedValue("mock output"),
}));

// Mock version
vi.mock("../../core/version.js", () => ({
  getVersion: () => "1.0.0-test",
}));

import { createAcpServer } from "../server.js";

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
    builtIn: true,
  };
}

const config: DexConfig = {
  model: "test-model",
  maxTurns: 10,
  skillDirs: [],
  verbose: false,
};

describe("ACP Server", () => {
  let handler: (req: JsonRpcRequest) => Promise<JsonRpcResponse>;
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
    registry.register(makeSkill("review"));
    registry.register(makeSkill("explain"));

    const logger = createLogger("error");
    createAcpServer(registry, config, logger);
    handler = (globalThis as any).__acpHandler;
  });

  describe("initialize", () => {
    it("should return capabilities with skill list", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      });

      expect(res.result).toBeDefined();
      const result = res.result as any;
      expect(result.name).toBe("dex");
      expect(result.version).toBe("1.0.0-test");
      expect(result.capabilities.skills).toHaveLength(2);
      expect(result.capabilities.skills[0].name).toBe("review");
    });
  });

  describe("session/new", () => {
    it("should create a session", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 2,
        method: "session/new",
        params: { skill: "review" },
      });

      expect(res.error).toBeUndefined();
      const result = res.result as any;
      expect(result.sessionId).toBeDefined();
      expect(result.skill).toBe("review");
    });

    it("should reject missing skill name", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 3,
        method: "session/new",
        params: {},
      });

      expect(res.error).toBeDefined();
      expect(res.error!.code).toBe(-32602);
    });

    it("should reject unknown skill", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 4,
        method: "session/new",
        params: { skill: "nonexistent" },
      });

      expect(res.error).toBeDefined();
      expect(res.error!.message).toContain("Unknown skill");
    });

    it("should reject non-string skill name", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 5,
        method: "session/new",
        params: { skill: 123 },
      });

      expect(res.error).toBeDefined();
      expect(res.error!.code).toBe(-32602);
    });
  });

  describe("session/prompt", () => {
    it("should reject invalid session", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 6,
        method: "session/prompt",
        params: { sessionId: "fake-id", prompt: "test" },
      });

      expect(res.error).toBeDefined();
      expect(res.error!.message).toContain("Invalid session");
    });

    it("should reject missing sessionId", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 7,
        method: "session/prompt",
        params: { prompt: "test" },
      });

      expect(res.error).toBeDefined();
      expect(res.error!.message).toContain("sessionId");
    });

    it("should reject missing prompt", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 8,
        method: "session/prompt",
        params: { sessionId: "some-id" },
      });

      expect(res.error).toBeDefined();
      expect(res.error!.message).toContain("prompt");
    });

    it("should execute prompt with valid session", async () => {
      // Create session first
      const createRes = await handler({
        jsonrpc: "2.0",
        id: 9,
        method: "session/new",
        params: { skill: "review" },
      });
      const sessionId = (createRes.result as any).sessionId;

      // Execute prompt
      const res = await handler({
        jsonrpc: "2.0",
        id: 10,
        method: "session/prompt",
        params: { sessionId, prompt: "review this code" },
      });

      expect(res.error).toBeUndefined();
      expect(res.result).toBeDefined();
    });

    it("should reject prompt on completed session", async () => {
      // Create and complete session
      const createRes = await handler({
        jsonrpc: "2.0",
        id: 11,
        method: "session/new",
        params: { skill: "review" },
      });
      const sessionId = (createRes.result as any).sessionId;

      await handler({
        jsonrpc: "2.0",
        id: 12,
        method: "session/prompt",
        params: { sessionId, prompt: "first" },
      });

      // Try again on completed session
      const res = await handler({
        jsonrpc: "2.0",
        id: 13,
        method: "session/prompt",
        params: { sessionId, prompt: "second" },
      });

      expect(res.error).toBeDefined();
      expect(res.error!.message).toContain("completed");
    });
  });

  describe("session/cancel", () => {
    it("should cancel a session", async () => {
      const createRes = await handler({
        jsonrpc: "2.0",
        id: 14,
        method: "session/new",
        params: { skill: "review" },
      });
      const sessionId = (createRes.result as any).sessionId;

      const res = await handler({
        jsonrpc: "2.0",
        id: 15,
        method: "session/cancel",
        params: { sessionId },
      });

      expect(res.error).toBeUndefined();
      expect((res.result as any).cancelled).toBe(true);
    });

    it("should reject missing sessionId", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 16,
        method: "session/cancel",
        params: {},
      });

      expect(res.error).toBeDefined();
    });
  });

  describe("unknown method", () => {
    it("should return method not found error", async () => {
      const res = await handler({
        jsonrpc: "2.0",
        id: 17,
        method: "bogus/method",
      });

      expect(res.error).toBeDefined();
      expect(res.error!.code).toBe(-32601);
    });
  });
});
