// Public API exports
export type {
  SkillManifest,
  SkillHandler,
  SkillContext,
  AgentMessage,
  AgentQueryOptions,
  AgentInterface,
  LoadedSkill,
  ContextSource,
} from "./skills/types.js";

export { SkillRegistry } from "./skills/registry.js";
export { validateManifest } from "./skills/validator.js";
export { executeSkill, executeSkillForAcp } from "./skills/executor.js";
export { loadConfig, setConfigValue } from "./core/config.js";
export type { DexConfig } from "./core/config.js";
export { createAgent } from "./core/agent.js";
export { createLogger } from "./core/logger.js";
export type { Logger } from "./core/logger.js";
export { getVersion } from "./core/version.js";
export {
  getToolsForSkill,
  executeToolCall,
  KNOWN_TOOLS,
} from "./core/tools.js";
export type { ToolDefinition } from "./core/tools.js";
export { createSpinner } from "./utils/spinner.js";
export type { Spinner } from "./utils/spinner.js";
export { truncateText, estimateTokens } from "./utils/text.js";
export {
  DexError,
  SkillNotFoundError,
  SkillValidationError,
  ConfigError,
  AgentError,
} from "./core/errors.js";
