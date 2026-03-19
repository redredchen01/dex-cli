import { resolve } from "node:path";
import type { LoadedSkill, SkillContext, ContextSource, AgentInterface } from "./types.js";
import type { DexConfig } from "../core/config.js";
import type { Logger } from "../core/logger.js";
import { createAgent } from "../core/agent.js";
import { createSpinner } from "../utils/spinner.js";
import { truncateText } from "../utils/truncate.js";
import {
  getGitDiff,
  getGitDiffStaged,
  getGitLog,
} from "../utils/git.js";
import { getFileTree, readFileContent, readPackageJson } from "../utils/fs.js";
import { readStdin } from "../utils/stdin.js";

export interface ExecuteOptions {
  args: Record<string, string>;
  flags: Record<string, string | boolean | number>;
  cwd: string;
  config: DexConfig;
  logger: Logger;
}

async function collectContext(
  sources: ContextSource[],
  opts: ExecuteOptions,
): Promise<SkillContext["context"]> {
  const ctx: SkillContext["context"] = { cwd: opts.cwd };
  const spinner = createSpinner();

  if (sources.length > 0) {
    spinner.start("Collecting context...");
  }

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      switch (source) {
        case "git-diff":
          ctx.gitDiff = await getGitDiff(opts.cwd);
          break;
        case "git-diff-staged":
          ctx.gitDiffStaged = await getGitDiffStaged(opts.cwd);
          break;
        case "git-log":
          ctx.gitLog = await getGitLog(opts.cwd);
          break;
        case "file-tree":
          ctx.fileTree = await getFileTree(opts.cwd);
          break;
        case "current-file": {
          const filePath = opts.args.file;
          if (filePath) {
            const resolved = resolve(opts.cwd, filePath);
            if (!resolved.startsWith(resolve(opts.cwd))) {
              opts.logger.warn(`File path "${filePath}" is outside project directory`);
              break;
            }
            ctx.currentFile = (await readFileContent(resolved)) ?? undefined;
          }
          break;
        }
        case "package-json":
          ctx.packageJson = (await readPackageJson(opts.cwd)) ?? undefined;
          break;
        case "stdin":
          ctx.stdin = (await readStdin()) ?? undefined;
          break;
      }
    }),
  );

  // Log failed context sources
  let failures = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "rejected") {
      failures++;
      const reason = (results[i] as PromiseRejectedResult).reason;
      opts.logger.warn(
        `Failed to collect context "${sources[i]}": ${reason instanceof Error ? reason.message : reason}`,
      );
    }
  }

  if (sources.length > 0) {
    if (failures > 0) {
      spinner.fail(`Context collected (${failures} source(s) failed)`);
    } else {
      spinner.succeed("Context collected");
    }
  }

  // Truncate large diffs to prevent token budget blowout
  if (ctx.gitDiff) {
    const result = truncateText(ctx.gitDiff);
    if (result.truncated) {
      ctx.gitDiff = result.text;
      opts.logger.warn(
        `Diff truncated: ${(result.originalLength / 1024).toFixed(0)}KB → ${(result.text.length / 1024).toFixed(0)}KB`,
      );
    }
  }
  if (ctx.gitDiffStaged) {
    const result = truncateText(ctx.gitDiffStaged);
    if (result.truncated) {
      ctx.gitDiffStaged = result.text;
      opts.logger.warn(
        `Staged diff truncated: ${(result.originalLength / 1024).toFixed(0)}KB → ${(result.text.length / 1024).toFixed(0)}KB`,
      );
    }
  }

  return ctx;
}

function buildSkillContext(
  skill: LoadedSkill,
  context: SkillContext["context"],
  agent: AgentInterface,
  opts: ExecuteOptions,
): SkillContext {
  return {
    args: opts.args,
    flags: opts.flags,
    context,
    agent,
    logger: opts.logger.child(skill.manifest.name),
    config: opts.config,
  };
}

export async function executeSkill(
  skill: LoadedSkill,
  opts: ExecuteOptions,
): Promise<void> {
  const { manifest, handler } = skill;
  const logger = opts.logger.child(manifest.name);

  const context = await collectContext(manifest.inputs.context ?? [], opts);
  const agent = createAgent(opts.config);
  const ctx = buildSkillContext(skill, context, agent, opts);

  // Inject manifest agent config + spinner UX
  const spinner = createSpinner();
  const manifestAgent = manifest.agent;
  let firstToken = false;
  const originalQuery = agent.query.bind(agent);

  agent.query = async function* (prompt, options) {
    // Merge manifest config: tools, maxTurns, cwd
    const mergedOptions = {
      ...options,
      tools: options?.tools ?? manifestAgent?.allowedTools,
      maxTurns: options?.maxTurns ?? manifestAgent?.maxTurns,
      cwd: options?.cwd ?? opts.cwd,
    };

    spinner.start("Thinking...");
    for await (const msg of originalQuery(prompt, mergedOptions)) {
      if (msg.type === "text" && !firstToken) {
        firstToken = true;
        spinner.stop();
      }
      if (msg.type === "tool_use") {
        spinner.start(`Running ${msg.toolName}...`);
      }
      if (msg.type === "tool_result") {
        spinner.succeed(`${msg.toolName} done`);
        firstToken = false; // Reset for next text block
        spinner.start("Thinking...");
      }
      if (msg.type === "done" && msg.content) {
        try {
          const usage = JSON.parse(msg.content);
          if (opts.config.verbose) {
            const turns = usage.turns ? `, ${usage.turns} turn(s)` : "";
            logger.debug(
              `Tokens: ${usage.inputTokens} in / ${usage.outputTokens} out (${usage.stopReason}${turns})`,
            );
          }
        } catch {}
      }
      if (msg.type === "error" && !firstToken) {
        spinner.update(msg.content ?? "Retrying...");
      }
      yield msg;
    }
    if (!firstToken) spinner.stop();
  };

  await handler(ctx);
}

/**
 * Execute a skill and capture output as a string (for ACP server).
 */
export async function executeSkillForAcp(
  skill: LoadedSkill,
  opts: ExecuteOptions,
): Promise<string> {
  const { manifest, handler } = skill;
  const logger = opts.logger.child(manifest.name);

  const context = await collectContext(manifest.inputs.context ?? [], opts);
  const realAgent = createAgent(opts.config);

  const capturingAgent: AgentInterface = {
    async *query(prompt, options) {
      for await (const msg of realAgent.query(prompt, options)) {
        yield msg;
      }
    },
  };

  const ctx = buildSkillContext(skill, context, capturingAgent, opts);

  // Capture both stdout and stderr
  const chunks: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  const capture = (chunk: string | Uint8Array, ...args: unknown[]) => {
    chunks.push(String(chunk));
    return true;
  };

  process.stdout.write = capture;
  process.stderr.write = capture;
  try {
    await handler(ctx);
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  return chunks.join("");
}
