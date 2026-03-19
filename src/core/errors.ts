export class DexError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "DexError";
  }
}

export class SkillNotFoundError extends DexError {
  constructor(name: string) {
    super(`Skill not found: ${name}`, "SKILL_NOT_FOUND");
    this.name = "SkillNotFoundError";
  }
}

export class SkillValidationError extends DexError {
  constructor(message: string) {
    super(message, "SKILL_VALIDATION_ERROR");
    this.name = "SkillValidationError";
  }
}

export class ConfigError extends DexError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

export class AgentError extends DexError {
  constructor(message: string) {
    super(message, "AGENT_ERROR");
    this.name = "AgentError";
  }
}
