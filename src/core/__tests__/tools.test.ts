import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getToolsForSkill,
  toAnthropicToolSchema,
  executeToolCall,
  KNOWN_TOOLS,
} from "../tools.js";

describe("getToolsForSkill", () => {
  it("should return empty array when no tools specified", () => {
    expect(getToolsForSkill()).toEqual([]);
    expect(getToolsForSkill([])).toEqual([]);
  });

  it("should return matching tools", () => {
    const tools = getToolsForSkill(["bash", "read_file"]);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("bash");
    expect(tools[1].name).toBe("read_file");
  });

  it("should filter unknown tool names", () => {
    const tools = getToolsForSkill(["bash", "unknown_tool"]);
    expect(tools).toHaveLength(1);
  });
});

describe("toAnthropicToolSchema", () => {
  it("should convert tool to Anthropic format", () => {
    const tools = getToolsForSkill(["bash"]);
    const schema = toAnthropicToolSchema(tools[0]);
    expect(schema.name).toBe("bash");
    expect(schema.description).toBeTruthy();
    expect(schema.input_schema).toBeDefined();
    expect(schema.input_schema.type).toBe("object");
  });
});

describe("KNOWN_TOOLS", () => {
  it("should contain all 4 built-in tools", () => {
    expect(KNOWN_TOOLS).toContain("bash");
    expect(KNOWN_TOOLS).toContain("read_file");
    expect(KNOWN_TOOLS).toContain("write_file");
    expect(KNOWN_TOOLS).toContain("list_files");
    expect(KNOWN_TOOLS).toHaveLength(4);
  });
});

describe("executeToolCall", () => {
  let tmpDir: string;

  it("should reject disallowed tools", async () => {
    const result = await executeToolCall("bash", { command: "echo hi" }, "/tmp", [
      "read_file",
    ]);
    expect(result).toContain("not allowed");
  });

  it("should reject unknown tools", async () => {
    const result = await executeToolCall(
      "unknown",
      {},
      "/tmp",
      ["unknown"],
    );
    expect(result).toContain("Unknown tool");
  });

  describe("bash tool", () => {
    it("should execute a command", async () => {
      const result = await executeToolCall(
        "bash",
        { command: "echo hello" },
        "/tmp",
        ["bash"],
      );
      expect(result).toBe("hello");
    });

    it("should handle command failure", async () => {
      const result = await executeToolCall(
        "bash",
        { command: "exit 1" },
        "/tmp",
        ["bash"],
      );
      expect(result).toContain("Command failed");
    });
  });

  describe("read_file tool", () => {
    it("should read a file", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));
      await writeFile(join(tmpDir, "test.txt"), "hello world");

      const result = await executeToolCall(
        "read_file",
        { path: "test.txt" },
        tmpDir,
        ["read_file"],
      );
      expect(result).toBe("hello world");

      await rm(tmpDir, { recursive: true });
    });

    it("should reject path traversal", async () => {
      const result = await executeToolCall(
        "read_file",
        { path: "../../etc/passwd" },
        "/tmp/safe-dir",
        ["read_file"],
      );
      expect(result).toContain("outside");
    });
  });

  describe("write_file tool", () => {
    it("should write a file", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));

      const result = await executeToolCall(
        "write_file",
        { path: "output.txt", content: "new content" },
        tmpDir,
        ["write_file"],
      );
      expect(result).toContain("Wrote");

      const content = await readFile(join(tmpDir, "output.txt"), "utf-8");
      expect(content).toBe("new content");

      await rm(tmpDir, { recursive: true });
    });

    it("should create parent directories", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));

      await executeToolCall(
        "write_file",
        { path: "a/b/c.txt", content: "deep" },
        tmpDir,
        ["write_file"],
      );

      const content = await readFile(join(tmpDir, "a", "b", "c.txt"), "utf-8");
      expect(content).toBe("deep");

      await rm(tmpDir, { recursive: true });
    });
  });

  describe("list_files tool", () => {
    it("should list directory contents", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));
      await writeFile(join(tmpDir, "file1.ts"), "");
      await writeFile(join(tmpDir, "file2.ts"), "");

      const result = await executeToolCall(
        "list_files",
        { path: "." },
        tmpDir,
        ["list_files"],
      );
      expect(result).toContain("file1.ts");
      expect(result).toContain("file2.ts");

      await rm(tmpDir, { recursive: true });
    });
  });
});
