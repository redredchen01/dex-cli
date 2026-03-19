import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

// Run dex commands via tsx, capturing both stdout and stderr
function dex(args: string[], cwd: string): string {
  const binPath = join(process.cwd(), "bin", "dex.ts");
  const cmd = `npx tsx "${binPath}" ${args.join(" ")} 2>&1`;
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: 15000,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
  } catch (err: any) {
    return err.stdout ?? "";
  }
}

describe("skill workflow", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "dex-workflow-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("dex skill init should create handler.ts and manifest.json", () => {
    const output = dex(["skill", "init", "my-tool"], tmpDir);

    expect(output).toContain("Created skill skeleton");
    expect(existsSync(join(tmpDir, "my-tool", "manifest.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "my-tool", "handler.ts"))).toBe(true);
  });

  it("dex skill init should reject invalid names", () => {
    const output = dex(["skill", "init", "Bad-Name!"], tmpDir);
    // Error goes to stderr, which is captured in output
    expect(output).toContain("lowercase");
    expect(existsSync(join(tmpDir, "Bad-Name!"))).toBe(false);
  });

  it("dex skill init → add should compile handler.ts to handler.js", async () => {
    // Init a skill
    dex(["skill", "init", "test-skill"], tmpDir);

    // Add it (installs to ~/.dex/skills/)
    const output = dex(["skill", "add", "./test-skill"], tmpDir);
    expect(output).toContain("Installed");

    // Check that handler.js was compiled
    const globalSkillDir = join(
      process.env.HOME ?? "",
      ".dex",
      "skills",
      "test-skill",
    );

    if (existsSync(globalSkillDir)) {
      const files = await readdir(globalSkillDir);
      expect(files).toContain("handler.js");
      expect(files).toContain("manifest.json");

      // Verify handler.js is valid JS (no TypeScript syntax)
      const js = await readFile(join(globalSkillDir, "handler.js"), "utf-8");
      expect(js).not.toContain("import type");
      expect(js).not.toContain(": SkillHandler");

      // Clean up
      await rm(globalSkillDir, { recursive: true });
    }
  });
});
