import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { getFileTree } from "../utils/fs.js";
import { truncateText } from "../utils/text.js";

const exec = promisify(execFile);

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>, cwd: string) => Promise<string>;
}

function assertSandboxed(filePath: string, cwd: string): void {
  const resolved = resolve(cwd, filePath);
  if (!resolved.startsWith(resolve(cwd))) {
    throw new Error(`Path "${filePath}" is outside the project directory`);
  }
}

const bashTool: ToolDefinition = {
  name: "bash",
  description:
    "Execute a bash command in the project directory. Use for running tests, git commands, build tools, etc.",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute",
      },
    },
    required: ["command"],
  },
  async execute(input, cwd) {
    const command = input.command as string;
    if (!command) throw new Error("Missing command");

    try {
      const { stdout, stderr } = await exec(
        "/bin/bash",
        ["-c", command],
        {
          cwd,
          timeout: 30_000,
          maxBuffer: 5 * 1024 * 1024,
          env: { ...process.env, TERM: "dumb" },
        },
      );
      const output = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : "")).trim();
      return truncateText(output, 50_000).text;
    } catch (err: any) {
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      return `Command failed (exit ${err.code ?? "?"}): ${output.trim()}`.slice(
        0,
        10_000,
      );
    }
  },
};

const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read the contents of a file",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file from project root",
      },
    },
    required: ["path"],
  },
  async execute(input, cwd) {
    const path = input.path as string;
    if (!path) throw new Error("Missing path");
    assertSandboxed(path, cwd);

    const fullPath = resolve(cwd, path);
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${path}`);
    }

    const content = await readFile(fullPath, "utf-8");
    return truncateText(content, 100_000).text;
  },
};

const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Write content to a file. Creates parent directories if needed.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file from project root",
      },
      content: {
        type: "string",
        description: "The content to write",
      },
    },
    required: ["path", "content"],
  },
  async execute(input, cwd) {
    const path = input.path as string;
    const content = input.content as string;
    if (!path || content === undefined) throw new Error("Missing path or content");
    assertSandboxed(path, cwd);

    const fullPath = resolve(cwd, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
    return `Wrote ${content.length} bytes to ${path}`;
  },
};

const listFilesTool: ToolDefinition = {
  name: "list_files",
  description: "List the file tree of a directory",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative directory path (default: project root)",
        default: ".",
      },
      depth: {
        type: "number",
        description: "Maximum depth (default: 3)",
        default: 3,
      },
    },
  },
  async execute(input, cwd) {
    const dirPath = (input.path as string) || ".";
    const depth = (input.depth as number) || 3;
    assertSandboxed(dirPath, cwd);

    const fullPath = resolve(cwd, dirPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    return await getFileTree(fullPath, depth);
  },
};

const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description:
    "Search for a text pattern across files using grep. Returns matching lines in file:line format.",
  input_schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The text or regex pattern to search for",
      },
      path: {
        type: "string",
        description:
          "Relative directory path to search in (default: project root)",
        default: ".",
      },
      include: {
        type: "string",
        description:
          'Glob pattern to filter files (e.g. "*.ts", "*.py")',
      },
    },
    required: ["pattern"],
  },
  async execute(input, cwd) {
    const pattern = input.pattern as string;
    if (!pattern) throw new Error("Missing pattern");
    const searchPath = (input.path as string) || ".";
    const include = input.include as string | undefined;
    assertSandboxed(searchPath, cwd);

    const args = ["-rn"];
    if (include) {
      args.push(`--include=${include}`);
    }
    args.push(pattern, searchPath);

    try {
      const { stdout } = await exec("/usr/bin/grep", args, {
        cwd,
        timeout: 15_000,
        maxBuffer: 5 * 1024 * 1024,
      });
      return truncateText(stdout.trim(), 50_000).text;
    } catch (err: any) {
      // grep exits with code 1 when no matches found
      if (err.code === 1) {
        return "No matches found.";
      }
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      return `Search failed: ${output.trim()}`.slice(0, 10_000);
    }
  },
};

const applyDiffTool: ToolDefinition = {
  name: "apply_diff",
  description:
    "Apply a unified diff patch to a file. The diff should use standard unified diff format with @@ hunks.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file to patch",
      },
      diff: {
        type: "string",
        description:
          "The unified diff content (with @@ hunk headers and +/- lines)",
      },
    },
    required: ["path", "diff"],
  },
  async execute(input, cwd) {
    const path = input.path as string;
    const diff = input.diff as string;
    if (!path) throw new Error("Missing path");
    if (!diff) throw new Error("Missing diff");
    assertSandboxed(path, cwd);

    const fullPath = resolve(cwd, path);
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${path}`);
    }

    const original = await readFile(fullPath, "utf-8");
    const lines = original.split("\n");

    // Parse hunks from the diff
    const hunkRegex = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/;
    const diffLines = diff.split("\n");
    let linesAdded = 0;
    let linesRemoved = 0;
    let offset = 0; // track cumulative shift from prior hunks

    let i = 0;
    while (i < diffLines.length) {
      const hunkMatch = hunkRegex.exec(diffLines[i]);
      if (!hunkMatch) {
        i++;
        continue;
      }

      const startLine = parseInt(hunkMatch[1], 10) - 1; // 0-indexed
      i++;

      // Collect the hunk body
      const removeLines: string[] = [];
      const addLines: string[] = [];
      const contextBefore: string[] = [];
      let seenChange = false;

      while (i < diffLines.length && !hunkRegex.test(diffLines[i])) {
        const line = diffLines[i];
        if (line.startsWith("-")) {
          seenChange = true;
          removeLines.push(line.slice(1));
        } else if (line.startsWith("+")) {
          seenChange = true;
          addLines.push(line.slice(1));
        } else if (line.startsWith(" ") || (line === "" && !seenChange)) {
          if (!seenChange) {
            contextBefore.push(line.startsWith(" ") ? line.slice(1) : line);
          }
        } else if (line.startsWith("\\")) {
          // "\ No newline at end of file" — skip
        } else {
          break; // next hunk or end
        }
        i++;
      }

      // Find the position to apply changes, accounting for offset from prior hunks
      const pos = startLine + contextBefore.length + offset;

      // Verify the lines to remove actually match
      for (let r = 0; r < removeLines.length; r++) {
        if (pos + r >= lines.length || lines[pos + r] !== removeLines[r]) {
          const found = lines[pos + r] ?? "<EOF>";
          throw new Error(
            "Diff mismatch at line " + (pos + r + 1) + ": expected \"" + removeLines[r] + "\", found \"" + found + "\"",
          );
        }
      }

      // Apply: splice out removed lines and insert added lines
      lines.splice(pos, removeLines.length, ...addLines);
      offset += addLines.length - removeLines.length;
      linesAdded += addLines.length;
      linesRemoved += removeLines.length;
    }

    await writeFile(fullPath, lines.join("\n"));
    return `Applied diff to ${path}: ${linesRemoved} line(s) removed, ${linesAdded} line(s) added`;
  },
};

// Tool registry
const TOOL_REGISTRY = new Map<string, ToolDefinition>([
  ["bash", bashTool],
  ["read_file", readFileTool],
  ["write_file", writeFileTool],
  ["list_files", listFilesTool],
  ["search_files", searchFilesTool],
  ["apply_diff", applyDiffTool],
]);

export const KNOWN_TOOLS = Array.from(TOOL_REGISTRY.keys());

export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(TOOL_REGISTRY.values());
}

export function getToolsForSkill(
  allowedTools?: string[],
): ToolDefinition[] {
  if (!allowedTools || allowedTools.length === 0) return [];
  return allowedTools
    .filter((name) => TOOL_REGISTRY.has(name))
    .map((name) => TOOL_REGISTRY.get(name)!);
}

export function toAnthropicToolSchema(
  tool: ToolDefinition,
): { name: string; description: string; input_schema: { type: "object"; properties?: Record<string, unknown>; required?: string[] } } {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as {
      type: "object";
      properties?: Record<string, unknown>;
      required?: string[];
    },
  };
}

export async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  cwd: string,
  allowedTools: string[],
): Promise<string> {
  if (!allowedTools.includes(name)) {
    return `Error: Tool "${name}" is not allowed for this skill`;
  }

  const tool = TOOL_REGISTRY.get(name);
  if (!tool) {
    return `Error: Unknown tool "${name}"`;
  }

  try {
    return await tool.execute(input, cwd);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
