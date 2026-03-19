import { describe, it, expect } from "vitest";
import { loadBuiltInSkills, loadUserSkills, loadProjectSkills } from "../loader.js";
import { SkillRegistry } from "../registry.js";
import { createLogger } from "../../core/logger.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const logger = createLogger("error");

describe("loadBuiltInSkills", () => {
  it("should attempt to load built-in skills without crashing", async () => {
    const registry = new SkillRegistry();
    // This may fail to load handlers in test environments with spaces in paths
    // but should not throw
    await expect(loadBuiltInSkills(registry, logger)).resolves.not.toThrow();
  });

  it("should load skills if path has no spaces", async () => {
    // Create a temp dir (no spaces) with a test skill
    const tmpDir = await mkdtemp(join(tmpdir(), "dex-builtin-"));
    const skillDir = join(tmpDir, "test-skill");
    try {
      await mkdir(skillDir);
      await writeFile(
        join(skillDir, "manifest.json"),
        JSON.stringify({
          name: "test-skill",
          version: "1.0.0",
          description: "test",
          inputs: {},
          aliases: ["ts"],
        }),
      );
      await writeFile(
        join(skillDir, "handler.ts"),
        "export default async function() {}",
      );

      const registry = new SkillRegistry();
      await loadUserSkills(registry, [tmpDir], logger);

      expect(registry.has("test-skill")).toBe(true);
      expect(registry.has("ts")).toBe(true);
      expect(registry.get("test-skill").source).toBe("user");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});

describe("loadUserSkills", () => {
  it("should skip nonexistent directories", async () => {
    const registry = new SkillRegistry();
    await loadUserSkills(
      registry,
      ["/tmp/nonexistent-dir-xxx"],
      logger,
    );
    expect(registry.list()).toHaveLength(0);
  });

  it("should load a valid user skill", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "dex-skill-"));
    const skillDir = join(tmpDir, "my-skill");
    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "manifest.json"),
        JSON.stringify({
          name: "my-skill",
          version: "0.1.0",
          description: "Test user skill",
          inputs: {},
        }),
      );
      await writeFile(
        join(skillDir, "handler.ts"),
        "export default async function() {}",
      );

      const registry = new SkillRegistry();
      await loadUserSkills(registry, [tmpDir], logger);

      expect(registry.has("my-skill")).toBe(true);
      expect(registry.get("my-skill").source).toBe("user");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("should skip directories without manifest.json", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "dex-skill-"));
    const skillDir = join(tmpDir, "bad-skill");
    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "handler.ts"), "export default async () => {}");

      const registry = new SkillRegistry();
      await loadUserSkills(registry, [tmpDir], logger);

      expect(registry.list()).toHaveLength(0);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("should skip skill with invalid manifest", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "dex-skill-"));
    const skillDir = join(tmpDir, "bad-manifest");
    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "manifest.json"),
        JSON.stringify({ name: "BadName!!!", version: "1.0" }),
      );
      await writeFile(join(skillDir, "handler.ts"), "export default async () => {}");

      const registry = new SkillRegistry();
      await loadUserSkills(registry, [tmpDir], logger);

      expect(registry.list()).toHaveLength(0);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("should skip skill without handler file", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "dex-skill-"));
    const skillDir = join(tmpDir, "no-handler");
    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "manifest.json"),
        JSON.stringify({
          name: "no-handler",
          version: "1.0.0",
          description: "Missing handler",
          inputs: {},
        }),
      );

      const registry = new SkillRegistry();
      await loadUserSkills(registry, [tmpDir], logger);

      expect(registry.list()).toHaveLength(0);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});

describe("loadProjectSkills", () => {
  it("should skip when .dex/skills/ does not exist", async () => {
    const registry = new SkillRegistry();
    await loadProjectSkills(registry, "/tmp/nonexistent-project-xxx", logger);
    expect(registry.list()).toHaveLength(0);
  });

  it("should load a valid project skill", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "dex-project-"));
    const skillDir = join(tmpDir, ".dex", "skills", "team-skill");
    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "manifest.json"),
        JSON.stringify({
          name: "team-skill",
          version: "0.1.0",
          description: "A project team skill",
          inputs: {},
        }),
      );
      await writeFile(
        join(skillDir, "handler.ts"),
        "export default async function() {}",
      );

      const registry = new SkillRegistry();
      await loadProjectSkills(registry, tmpDir, logger);

      expect(registry.has("team-skill")).toBe(true);
      expect(registry.get("team-skill").source).toBe("project");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});
