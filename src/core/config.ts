import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface DexConfig {
  apiKey?: string;
  model: string;
  maxTurns: number;
  skillDirs: string[];
  verbose: boolean;
  activeProfile?: string;
  provider?: "anthropic" | "openai" | "ollama";
  openaiApiKey?: string;
  ollamaHost?: string;
  [key: string]: unknown;
}

export interface ProfilePreset {
  model: string;
  maxTokens: number;
}

export const PRESET_PROFILES: Record<string, ProfilePreset> = {
  fast: { model: "claude-haiku-4-5-20251001", maxTokens: 4096 },
  quality: { model: "claude-sonnet-4-6-20250527", maxTokens: 8192 },
  max: { model: "claude-opus-4-20250514", maxTokens: 16384 },
};

const DEFAULT_CONFIG: DexConfig = {
  model: "claude-sonnet-4-6-20250527",
  maxTurns: 10,
  skillDirs: [],
  verbose: false,
};

export function getGlobalConfigDir(): string {
  return join(homedir(), ".dex");
}

export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), "config.json");
}

export function getProjectConfigDir(cwd: string = process.cwd()): string {
  return join(cwd, ".dex");
}

async function loadJsonFile(path: string): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {};
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function getProfilesDir(): string {
  return join(getGlobalConfigDir(), "profiles");
}

function getProfilePath(name: string): string {
  return join(getProfilesDir(), `${name}.json`);
}

export async function loadProfile(
  name: string,
): Promise<Partial<DexConfig> | null> {
  const profilePath = getProfilePath(name);
  if (!existsSync(profilePath)) return null;
  try {
    const content = await readFile(profilePath, "utf-8");
    return JSON.parse(content) as Partial<DexConfig>;
  } catch {
    return null;
  }
}

export async function saveProfile(
  name: string,
  config: Partial<DexConfig>,
): Promise<void> {
  const dir = getProfilesDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  const clean = { ...config };
  delete clean.apiKey;
  delete clean.activeProfile;
  await writeFile(getProfilePath(name), JSON.stringify(clean, null, 2) + "\n");
}

export async function deleteProfile(name: string): Promise<boolean> {
  const profilePath = getProfilePath(name);
  if (!existsSync(profilePath)) return false;
  await unlink(profilePath);
  return true;
}

export async function listProfiles(): Promise<string[]> {
  const dir = getProfilesDir();
  if (!existsSync(dir)) return [];
  try {
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

export async function ensurePresetProfiles(): Promise<void> {
  const dir = getProfilesDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  for (const [name, preset] of Object.entries(PRESET_PROFILES)) {
    const profilePath = getProfilePath(name);
    if (!existsSync(profilePath)) {
      await writeFile(
        profilePath,
        JSON.stringify(preset, null, 2) + "\n",
      );
    }
  }
}

export async function loadConfig(cwd?: string): Promise<DexConfig> {
  const globalConfig = await loadJsonFile(getGlobalConfigPath());
  const projectConfig = await loadJsonFile(
    join(getProjectConfigDir(cwd), "config.json"),
  );

  const merged = {
    ...DEFAULT_CONFIG,
    ...globalConfig,
    ...projectConfig,
  } as DexConfig;

  // If an active profile is set, merge it on top
  if (merged.activeProfile) {
    const profile = await loadProfile(merged.activeProfile);
    if (profile) {
      Object.assign(merged, profile);
      // Preserve activeProfile after merge
      merged.activeProfile = (globalConfig.activeProfile ??
        projectConfig.activeProfile) as string | undefined;
    }
  }

  // Environment variable override
  if (process.env.ANTHROPIC_API_KEY) {
    merged.apiKey = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.DEX_MODEL) {
    merged.model = process.env.DEX_MODEL;
  }
  if (process.env.OPENAI_API_KEY) {
    merged.openaiApiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.DEX_PROVIDER) {
    merged.provider = process.env.DEX_PROVIDER as DexConfig["provider"];
  }

  return merged;
}

export async function setConfigValue(
  key: string,
  value: unknown,
  global: boolean = true,
): Promise<void> {
  const configPath = global
    ? getGlobalConfigPath()
    : join(getProjectConfigDir(), "config.json");

  const dir = global ? getGlobalConfigDir() : getProjectConfigDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const config = await loadJsonFile(configPath);
  config[key] = value;
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}