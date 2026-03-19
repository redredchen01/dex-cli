import type { SkillRegistry } from "../skills/registry.js";
import { executeSkillForAcp } from "../skills/executor.js";
import type { DexConfig } from "../core/config.js";
import type { Logger } from "../core/logger.js";

export interface PromptRequest {
  sessionId: string;
  skillName: string;
  prompt: string;
  args?: Record<string, string>;
  flags?: Record<string, string | boolean | number>;
}

export interface PromptResult {
  content: string;
}

export async function handlePrompt(
  request: PromptRequest,
  registry: SkillRegistry,
  config: DexConfig,
  logger: Logger,
): Promise<PromptResult> {
  const skill = registry.get(request.skillName);

  const content = await executeSkillForAcp(skill, {
    args: request.args ?? {},
    flags: request.flags ?? {},
    cwd: process.cwd(),
    config,
    logger,
  });

  return { content };
}
