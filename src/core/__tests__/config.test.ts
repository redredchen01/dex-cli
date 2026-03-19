import { describe, it, expect, afterEach, vi } from "vitest";
import { loadConfig, getGlobalConfigDir, getProjectConfigDir } from "../config.js";
import { homedir } from "node:os";
import { join } from "node:path";

describe("config", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEX_MODEL;
  });

  it("getGlobalConfigDir should return ~/.dex", () => {
    expect(getGlobalConfigDir()).toBe(join(homedir(), ".dex"));
  });

  it("getProjectConfigDir should return .dex in given dir", () => {
    expect(getProjectConfigDir("/tmp/project")).toBe("/tmp/project/.dex");
  });

  it("loadConfig should return defaults when no config files exist", async () => {
    const config = await loadConfig("/tmp/nonexistent-project-dir");
    expect(config.model).toBe("claude-sonnet-4-6-20250527");
    expect(config.maxTurns).toBe(10);
    expect(config.verbose).toBe(false);
    expect(config.skillDirs).toEqual([]);
  });

  it("should use ANTHROPIC_API_KEY env var", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-123";
    const config = await loadConfig("/tmp/nonexistent");
    expect(config.apiKey).toBe("test-key-123");
  });

  it("should use DEX_MODEL env var", async () => {
    process.env.DEX_MODEL = "claude-opus-4-20250514";
    const config = await loadConfig("/tmp/nonexistent");
    expect(config.model).toBe("claude-opus-4-20250514");
  });
});
