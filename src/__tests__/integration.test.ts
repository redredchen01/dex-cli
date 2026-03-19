import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgram } from "../cli/program.js";

// Mock the agent so we don't need an API key
vi.mock("../core/agent.js", () => ({
  createAgent: () => ({
    async *query(prompt: string) {
      yield { type: "text" as const, content: "Mock output" };
      yield { type: "done" as const };
    },
  }),
}));

describe("CLI integration", () => {
  let originalArgv: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalArgv = process.argv;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("should parse config list command and show settings", async () => {
    process.argv = ["node", "dex", "config", "list"];
    const program = await createProgram();
    await program.parseAsync(process.argv);

    const calls = logSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("model");
    expect(calls).toContain("maxTurns");
  });

  it("should parse config get command", async () => {
    process.argv = ["node", "dex", "config", "get", "model"];
    const program = await createProgram();
    await program.parseAsync(process.argv);

    const calls = logSpy.mock.calls.flat().join(" ");
    expect(calls).toContain("claude-sonnet");
  });

  it("should create program with skills loaded", async () => {
    process.argv = ["node", "dex", "--help"];
    const program = await createProgram();

    // Program should have run, serve, skill, config, init commands at minimum
    const cmdNames = program.commands.map((c) => c.name());
    expect(cmdNames).toContain("run");
    expect(cmdNames).toContain("serve");
    expect(cmdNames).toContain("skill");
    expect(cmdNames).toContain("config");
    expect(cmdNames).toContain("init");
  });

  it("should throw on unknown command", async () => {
    process.argv = ["node", "dex", "totally-unknown"];
    const program = await createProgram();

    await expect(program.parseAsync(process.argv)).rejects.toThrow();
  });

  it("should handle --json flag on config list", async () => {
    process.argv = ["node", "dex", "--json", "config", "list"];
    const program = await createProgram();
    await program.parseAsync(process.argv);

    const calls = logSpy.mock.calls.flat().join("");
    // Should output valid JSON
    const parsed = JSON.parse(calls);
    expect(parsed).toHaveProperty("model");
    expect(parsed).toHaveProperty("maxTurns");
  });

  it("should handle run command with unknown skill", async () => {
    process.argv = ["node", "dex", "run", "nonexistent"];
    const program = await createProgram();

    await expect(program.parseAsync(process.argv)).rejects.toThrow(
      "Skill not found",
    );
  });
});
