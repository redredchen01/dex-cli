import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

export interface UsageEntry {
  skill: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  timestamp: number;
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  entries: number;
  perSkill: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
      invocations: number;
    }
  >;
}

// Rough cost estimation per 1M tokens
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-haiku-3-20250307": { input: 0.25, output: 1.25 },
};

const DEFAULT_COST = { input: 3, output: 15 }; // Sonnet-class default

function getUsageFilePath(): string {
  return join(homedir(), ".dex", "usage.json");
}

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const costs = MODEL_COSTS[model] ?? DEFAULT_COST;
  return (
    (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output
  );
}

export class UsageTracker {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getUsageFilePath();
  }

  async record(entry: UsageEntry): Promise<void> {
    const dir = join(this.filePath, "..");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const history = await this.loadHistory();
    history.push(entry);
    await writeFile(this.filePath, JSON.stringify(history, null, 2) + "\n");
  }

  async getHistory(days?: number): Promise<UsageEntry[]> {
    const history = await this.loadHistory();
    if (days === undefined) return history;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return history.filter((e) => e.timestamp >= cutoff);
  }

  async getSummary(days?: number): Promise<UsageSummary> {
    const entries = await this.getHistory(days);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    const perSkill: UsageSummary["perSkill"] = {};

    for (const entry of entries) {
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;
      const cost = estimateCost(
        entry.model,
        entry.inputTokens,
        entry.outputTokens,
      );
      totalCost += cost;

      if (!perSkill[entry.skill]) {
        perSkill[entry.skill] = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
          invocations: 0,
        };
      }
      const s = perSkill[entry.skill];
      s.inputTokens += entry.inputTokens;
      s.outputTokens += entry.outputTokens;
      s.totalTokens += entry.inputTokens + entry.outputTokens;
      s.estimatedCost += cost;
      s.invocations += 1;
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      estimatedCost: totalCost,
      entries: entries.length,
      perSkill,
    };
  }

  private async loadHistory(): Promise<UsageEntry[]> {
    if (!existsSync(this.filePath)) return [];
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
