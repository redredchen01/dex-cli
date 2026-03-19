import { describe, it, expect } from "vitest";
import { getFileTree, readFileContent, readPackageJson } from "../fs.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("fs utils", () => {
  describe("getFileTree", () => {
    it("should return tree structure", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "dex-test-"));
      try {
        await mkdir(join(tmpDir, "src"));
        await writeFile(join(tmpDir, "src", "index.ts"), "");
        await writeFile(join(tmpDir, "README.md"), "");

        const tree = await getFileTree(tmpDir);
        expect(tree).toContain("src");
        expect(tree).toContain("index.ts");
        expect(tree).toContain("README.md");
      } finally {
        await rm(tmpDir, { recursive: true });
      }
    });

    it("should exclude node_modules and .git", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "dex-test-"));
      try {
        await mkdir(join(tmpDir, "node_modules"));
        await mkdir(join(tmpDir, ".git"));
        await writeFile(join(tmpDir, "index.ts"), "");

        const tree = await getFileTree(tmpDir);
        expect(tree).not.toContain("node_modules");
        expect(tree).not.toContain(".git");
        expect(tree).toContain("index.ts");
      } finally {
        await rm(tmpDir, { recursive: true });
      }
    });

    it("should respect maxDepth", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "dex-test-"));
      try {
        await mkdir(join(tmpDir, "a", "b", "c", "d"), { recursive: true });
        await writeFile(join(tmpDir, "a", "b", "c", "d", "deep.ts"), "");

        const tree = await getFileTree(tmpDir, 2);
        expect(tree).toContain("a");
        expect(tree).toContain("b");
        expect(tree).not.toContain("deep.ts");
      } finally {
        await rm(tmpDir, { recursive: true });
      }
    });
  });

  describe("readFileContent", () => {
    it("should read file and return path + content", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "dex-test-"));
      const filePath = join(tmpDir, "test.ts");
      try {
        await writeFile(filePath, "const x = 1;");
        const result = await readFileContent(filePath);
        expect(result).not.toBeNull();
        expect(result!.path).toBe(filePath);
        expect(result!.content).toBe("const x = 1;");
      } finally {
        await rm(tmpDir, { recursive: true });
      }
    });

    it("should return null for nonexistent file", async () => {
      const result = await readFileContent("/tmp/nonexistent-file-xxx.ts");
      expect(result).toBeNull();
    });
  });

  describe("readPackageJson", () => {
    it("should read package.json from directory", async () => {
      // Use this project's own package.json
      const result = await readPackageJson(process.cwd());
      expect(result).not.toBeNull();
      expect(result!.name).toBe("dex-cli");
    });

    it("should return null when no package.json exists", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "dex-test-"));
      try {
        const result = await readPackageJson(tmpDir);
        expect(result).toBeNull();
      } finally {
        await rm(tmpDir, { recursive: true });
      }
    });
  });
});
