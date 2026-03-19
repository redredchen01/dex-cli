import { describe, it, expect } from "vitest";
import { getGitDiff, getGitDiffStaged, getGitLog, isGitRepo } from "../git.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

describe("git utils", () => {
  describe("isGitRepo", () => {
    it("should return true for a git repo", async () => {
      // This project itself is a git repo
      const result = await isGitRepo(process.cwd());
      expect(result).toBe(true);
    });

    it("should return false for a non-git directory", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "dex-test-"));
      try {
        const result = await isGitRepo(tmpDir);
        expect(result).toBe(false);
      } finally {
        await rm(tmpDir, { recursive: true });
      }
    });
  });

  describe("getGitDiff", () => {
    it("should return a string (may be empty)", async () => {
      const result = await getGitDiff(process.cwd());
      expect(typeof result).toBe("string");
    });
  });

  describe("getGitDiffStaged", () => {
    it("should return a string (may be empty)", async () => {
      const result = await getGitDiffStaged(process.cwd());
      expect(typeof result).toBe("string");
    });
  });

  describe("getGitLog", () => {
    it("should return a string (may be empty for new repo)", async () => {
      const result = await getGitLog(process.cwd());
      expect(typeof result).toBe("string");
    });
  });

  describe("error handling", () => {
    it("should return empty string for non-git directory", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "dex-test-"));
      try {
        const result = await getGitDiff(tmpDir);
        expect(result).toBe("");
      } finally {
        await rm(tmpDir, { recursive: true });
      }
    });
  });
});
