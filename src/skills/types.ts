import type { Logger } from "../core/logger.js";
import type { DexConfig } from "../core/config.js";

export interface SkillManifestArg {
  name: string;
  description: string;
  required?: boolean;
}

export interface SkillManifestFlag {
  name: string;
  short?: string;
  type: "string" | "boolean" | "number";
  description?: string;
  default?: string | boolean | number;
}

export type ContextSource =
  | "git-diff"
  | "git-diff-staged"
  | "git-log"
  | "file-tree"
  | "current-file"
  | "package-json"
  | "stdin";

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  inputs: {
    args?: SkillManifestArg[];
    flags?: SkillManifestFlag[];
    context?: ContextSource[];
  };
  agent?: {
    systemPromptFile?: string;
    maxTurns?: number;
    allowedTools?: string[];
  };
  aliases?: string[];
}

export interface AgentMessage {
  type: "text" | "tool_use" | "tool_result" | "error" | "done";
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolCallId?: string;
}

export interface AgentQueryOptions {
  systemPrompt?: string;
  maxTurns?: number;
  maxTokens?: number;
  tools?: string[];
  cwd?: string;
}

export interface AgentInterface {
  query(
    prompt: string,
    options?: AgentQueryOptions,
  ): AsyncGenerator<AgentMessage>;
}

export interface SkillContext {
  args: Record<string, string>;
  flags: Record<string, string | boolean | number>;
  context: {
    gitDiff?: string;
    gitDiffStaged?: string;
    gitLog?: string;
    fileTree?: string;
    currentFile?: { path: string; content: string };
    packageJson?: Record<string, unknown>;
    stdin?: string;
    cwd: string;
  };
  agent: AgentInterface;
  logger: Logger;
  config: DexConfig;
}

export type SkillHandler = (ctx: SkillContext) => Promise<void>;

export interface LoadedSkill {
  manifest: SkillManifest;
  handler: SkillHandler;
  path: string;
  builtIn: boolean;
}
