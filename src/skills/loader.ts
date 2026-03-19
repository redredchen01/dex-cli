import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { LoadedSkill, SkillHandler } from "./types.js";
import { SkillRegistry } from "./registry.js";
import { validateManifest } from "./validator.js";
import type { Logger } from "../core/logger.js";

// Resolve __dirname from import.meta.url (handles %20 and other encoding)
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Find built-in skills directory across different installation scenarios:
 * - Dev (tsx):         src/skills/built-in
 * - Dist (bundled):    dist/built-in (from dist/bin/dex.js → ../built-in)
 * - Global install:    <prefix>/lib/node_modules/dex-cli/dist/built-in
 */
function getBuiltInPath(logger: Logger): string | null {
  const candidates = [
    join(__dirname, "built-in"),
    join(__dirname, "..", "built-in"),
    join(__dirname, "..", "..", "built-in"),
    join(__dirname, "..", "..", "dist", "built-in"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      logger.debug(`Found built-in skills at: ${p}`);
      return p;
    }
  }

  logger.warn(
    `Built-in skills directory not found. Searched:\n${candidates.map((c) => `  - ${c}`).join("\n")}`,
  );
  return null;
}

async function loadSkillFromDir(
  dir: string,
  source: "built-in" | "user" | "project",
  logger: Logger,
): Promise<LoadedSkill | null> {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    logger.debug(`No manifest.json in ${dir}`);
    return null;
  }

  try {
    const raw = JSON.parse(await readFile(manifestPath, "utf-8"));
    const manifest = validateManifest(raw);

    const handlerPath = join(dir, "handler.js");
    const handlerTsPath = join(dir, "handler.ts");
    const resolvedPath = existsSync(handlerPath)
      ? handlerPath
      : handlerTsPath;

    if (!existsSync(resolvedPath)) {
      logger.warn(`No handler found for skill "${manifest.name}" in ${dir}`);
      return null;
    }

    const mod = await import(pathToFileURL(resolvedPath).href);
    const handler: SkillHandler = mod.default ?? mod.handler;

    if (typeof handler !== "function") {
      logger.warn(`Invalid handler for skill "${manifest.name}"`);
      return null;
    }

    return { manifest, handler, path: dir, source };
  } catch (err) {
    logger.warn(
      `Failed to load skill from ${dir}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

export async function loadBuiltInSkills(
  registry: SkillRegistry,
  logger: Logger,
): Promise<void> {
  const builtInPath = getBuiltInPath(logger);
  if (!builtInPath) return;

  const entries = await readdir(builtInPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skill = await loadSkillFromDir(
      join(builtInPath, entry.name),
      "built-in",
      logger,
    );
    if (skill) {
      registry.register(skill);
      logger.debug(`Loaded built-in skill: ${skill.manifest.name}`);
    }
  }
}

export async function loadUserSkills(
  registry: SkillRegistry,
  dirs: string[],
  logger: Logger,
): Promise<void> {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = await loadSkillFromDir(
        join(dir, entry.name),
        "user",
        logger,
      );
      if (skill) {
        registry.register(skill);
        logger.debug(`Loaded user skill: ${skill.manifest.name}`);
      }
    }
  }
}

export async function loadProjectSkills(
  registry: SkillRegistry,
  cwd: string,
  logger: Logger,
): Promise<void> {
  const projectSkillsDir = join(cwd, ".dex", "skills");
  if (!existsSync(projectSkillsDir)) return;

  const entries = await readdir(projectSkillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skill = await loadSkillFromDir(
      join(projectSkillsDir, entry.name),
      "project",
      logger,
    );
    if (skill) {
      registry.register(skill);
      logger.debug(`Loaded project skill: ${skill.manifest.name}`);
    }
  }
}
