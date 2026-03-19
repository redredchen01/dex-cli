import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm, readFile, mkdir } from "node:fs/promises";
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
  it("should contain all 6 built-in tools", () => {
    expect(KNOWN_TOOLS).toContain("bash");
    expect(KNOWN_TOOLS).toContain("read_file");
    expect(KNOWN_TOOLS).toContain("write_file");
    expect(KNOWN_TOOLS).toContain("list_files");
    expect(KNOWN_TOOLS).toContain("search_files");
    expect(KNOWN_TOOLS).toContain("apply_diff");
    expect(KNOWN_TOOLS).toHaveLength(6);
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

  describe("search_files tool", () => {
    it("should find matching lines", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));
      await writeFile(join(tmpDir, "hello.txt"), "hello world\nfoo bar\nhello again");

      const result = await executeToolCall(
        "search_files",
        { pattern: "hello", path: "." },
        tmpDir,
        ["search_files"],
      );
      expect(result).toContain("hello.txt");
      expect(result).toContain("hello world");
      expect(result).toContain("hello again");

      await rm(tmpDir, { recursive: true });
    });

    it("should return no matches message when nothing found", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));
      await writeFile(join(tmpDir, "hello.txt"), "hello world");

      const result = await executeToolCall(
        "search_files",
        { pattern: "zzzznotfound", path: "." },
        tmpDir,
        ["search_files"],
      );
      expect(result).toBe("No matches found.");

      await rm(tmpDir, { recursive: true });
    });

    it("should filter by include glob", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));
      await writeFile(join(tmpDir, "a.ts"), "target line");
      await writeFile(join(tmpDir, "b.js"), "target line");

      const result = await executeToolCall(
        "search_files",
        { pattern: "target", path: ".", include: "*.ts" },
        tmpDir,
        ["search_files"],
      );
      expect(result).toContain("a.ts");
      expect(result).not.toContain("b.js");

      await rm(tmpDir, { recursive: true });
    });

    it("should reject path traversal", async () => {
      const result = await executeToolCall(
        "search_files",
        { pattern: "root", path: "../../etc" },
        "/tmp/safe-dir",
        ["search_files"],
      );
      expect(result).toContain("outside");
    });
  });

  describe("apply_diff tool", () => {
    it("should apply a simple diff", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));
      await writeFile(
        join(tmpDir, "file.txt"),
        "line1\nline2\nline3\nline4\n",
      );

      const diff = [
        "@@ -1,4 +1,4 @@",
        " line1",
        "-line2",
        "+line2_modified",
        " line3",
      ].join("\n");

      const result = await executeToolCall(
        "apply_diff",
        { path: "file.txt", diff },
        tmpDir,
        ["apply_diff"],
      );

      expect(result).toContain("Applied diff");
      expect(result).toContain("1 line(s) removed");
      expect(result).toContain("1 line(s) added");

      const content = await readFile(join(tmpDir, "file.txt"), "utf-8");
      expect(content).toContain("line2_modified");
      expect(content).not.toContain("\nline2\n");

      await rm(tmpDir, { recursive: true });
    });

    it("should handle adding lines", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));
      await writeFile(
        join(tmpDir, "file.txt"),
        "aaa\nbbb\nccc\n",
      );

      const diff = [
        "@@ -1,3 +1,5 @@",
        " aaa",
        "-bbb",
        "+bbb",
        "+new1",
        "+new2",
        " ccc",
      ].join("\n");

      const result = await executeToolCall(
        "apply_diff",
        { path: "file.txt", diff },
        tmpDir,
        ["apply_diff"],
      );

      const content = await readFile(join(tmpDir, "file.txt"), "utf-8");
      expect(content).toContain("new1");
      expect(content).toContain("new2");
      expect(result).toContain("Applied diff");

      await rm(tmpDir, { recursive: true });
    });

    it("should handle removing lines", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));
      await writeFile(
        join(tmpDir, "file.txt"),
        "keep\nremove_me\nalso_remove\nkeep2\n",
      );

      const diff = [
        "@@ -1,4 +1,2 @@",
        " keep",
        "-remove_me",
        "-also_remove",
        " keep2",
      ].join("\n");

      const result = await executeToolCall(
        "apply_diff",
        { path: "file.txt", diff },
        tmpDir,
        ["apply_diff"],
      );

      const content = await readFile(join(tmpDir, "file.txt"), "utf-8");
      expect(content).not.toContain("remove_me");
      expect(content).not.toContain("also_remove");
      expect(content).toContain("keep");
      expect(content).toContain("keep2");
      expect(result).toContain("2 line(s) removed");
      expect(result).toContain("0 line(s) added");

      await rm(tmpDir, { recursive: true });
    });

    it("should error on diff mismatch", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));
      await writeFile(join(tmpDir, "file.txt"), "actual\n");

      const diff = [
        "@@ -1,1 +1,1 @@",
        "-wrong_content",
        "+replacement",
      ].join("\n");

      const result = await executeToolCall(
        "apply_diff",
        { path: "file.txt", diff },
        tmpDir,
        ["apply_diff"],
      );

      expect(result).toContain("Diff mismatch");

      await rm(tmpDir, { recursive: true });
    });

    it("should reject path traversal", async () => {
      const result = await executeToolCall(
        "apply_diff",
        { path: "../../etc/passwd", diff: "@@ -1,1 +1,1 @@\n-x\n+y" },
        "/tmp/safe-dir",
        ["apply_diff"],
      );
      expect(result).toContain("outside");
    });

    it("should error on missing file", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "dex-tools-"));

      const result = await executeToolCall(
        "apply_diff",
        { path: "nonexistent.txt", diff: "@@ -1,1 +1,1 @@\n-x\n+y" },
        tmpDir,
        ["apply_diff"],
      );
      expect(result).toContain("File not found");

      await rm(tmpDir, { recursive: true });
    });
  });
});
