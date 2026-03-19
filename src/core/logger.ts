import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  child(prefix: string): Logger;
}

export function createLogger(
  level: LogLevel = "info",
  prefix?: string,
): Logger {
  const shouldLog = (msgLevel: LogLevel) =>
    LEVEL_ORDER[msgLevel] >= LEVEL_ORDER[level];

  const fmt = (lvl: LogLevel, msg: string) => {
    const tag = prefix ? `[${prefix}] ` : "";
    switch (lvl) {
      case "debug":
        return chalk.gray(`${tag}${msg}`);
      case "info":
        return `${tag}${msg}`;
      case "warn":
        return chalk.yellow(`${tag}⚠ ${msg}`);
      case "error":
        return chalk.red(`${tag}✖ ${msg}`);
    }
  };

  return {
    debug(msg, ...args) {
      if (shouldLog("debug")) console.error(fmt("debug", msg), ...args);
    },
    info(msg, ...args) {
      if (shouldLog("info")) console.error(fmt("info", msg), ...args);
    },
    warn(msg, ...args) {
      if (shouldLog("warn")) console.error(fmt("warn", msg), ...args);
    },
    error(msg, ...args) {
      if (shouldLog("error")) console.error(fmt("error", msg), ...args);
    },
    child(childPrefix: string) {
      const newPrefix = prefix ? `${prefix}:${childPrefix}` : childPrefix;
      return createLogger(level, newPrefix);
    },
  };
}
