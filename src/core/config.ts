import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface DexConfig {
  apiKey?: string;
  model: string;
  maxTurns: number;
  skillDirs: string[];
  verbose: boolean;
  [key: string]: unknown;
}

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

  // Environment variable override
  if (process.env.ANTHROPIC_API_KEY) {
    merged.apiKey = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.DEX_MODEL) {
    merged.model = process.env.DEX_MODEL;
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