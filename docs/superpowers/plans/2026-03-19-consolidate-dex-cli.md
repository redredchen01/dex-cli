# Dex CLI Service Consolidation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce code duplication, remove dead code, drop unnecessary dependencies, and consolidate files — without changing any external behavior.

**Architecture:** Extract shared skill handler boilerplate into a helper. Replace Zod with manual validation. Merge small utility files. Remove dead exports. Unify executeSkill/executeSkillForAcp.

**Tech Stack:** TypeScript, Node.js, vitest

---

## File Structure (Changes)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/skills/handler-utils.ts` | Shared query-and-stream helper for all handlers |
| Modify | `src/skills/built-in/*/handler.ts` (6 files) | Use shared helper, remove boilerplate |
| Modify | `src/skills/executor.ts` | Unify executeSkill + executeSkillForAcp into single function |
| Rewrite | `src/skills/validator.ts` | Manual validation, drop Zod |
| Delete | `src/utils/prompt.ts` | Dead code (buildPrompt never used outside tests) |
| Merge into | `src/utils/text.ts` | Combine truncate.ts + stdin.ts (both small text utilities) |
| Delete | `src/utils/truncate.ts` | Merged into text.ts |
| Delete | `src/utils/stdin.ts` | Merged into text.ts |
| Modify | `src/index.ts` | Remove dead exports, clean up public API |
| Modify | `src/core/config.ts` | Remove unused getConfigValue() |
| Modify | `package.json` | Remove `zod` dependency |
| Delete | `src/utils/__tests__/prompt.test.ts` | Test for deleted file |
| Modify | `src/utils/__tests__/truncate.test.ts` | Update imports to text.ts |
| Modify | `src/utils/__tests__/stdin.test.ts` | Update imports to text.ts |

---

### Task 1: Extract shared skill handler helper

**Files:**
- Create: `src/skills/handler-utils.ts`
- Test: `src/skills/__tests__/handler-utils.test.ts`

All 6 built-in handlers repeat this identical pattern:

```typescript
for await (const msg of ctx.agent.query(prompt, { systemPrompt })) {
  if (msg.type === "text" && msg.content) {
    process.stdout.write(msg.content);
  }
}
process.stdout.write("\n");
```

- [ ] **Step 1: Write the failing test**

```typescript
// src/skills/__tests__/handler-utils.test.ts
import { describe, it, expect, vi } from "vitest";
import { streamQuery } from "../handler-utils.js";

describe("streamQuery", () => {
  it("should write text messages to stdout", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const agent = {
      async *query() {
        yield { type: "text" as const, content: "hello " };
        yield { type: "text" as const, content: "world" };
        yield { type: "done" as const };
      },
    };

    await streamQuery(agent as any, "prompt", { systemPrompt: "sys" });

    expect(writeSpy).toHaveBeenCalledWith("hello ");
    expect(writeSpy).toHaveBeenCalledWith("world");
    expect(writeSpy).toHaveBeenCalledWith("\n");
    writeSpy.mockRestore();
  });

  it("should skip non-text messages", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const agent = {
      async *query() {
        yield { type: "tool_use" as const, toolName: "bash" };
        yield { type: "text" as const, content: "result" };
        yield { type: "done" as const };
      },
    };

    await streamQuery(agent as any, "test", {});

    expect(writeSpy).toHaveBeenCalledWith("result");
    writeSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/__tests__/handler-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/skills/handler-utils.ts
import type { AgentInterface, AgentQueryOptions } from "./types.js";

export async function streamQuery(
  agent: AgentInterface,
  prompt: string,
  options: AgentQueryOptions,
): Promise<void> {
  for await (const msg of agent.query(prompt, options)) {
    if (msg.type === "text" && msg.content) {
      process.stdout.write(msg.content);
    }
  }
  process.stdout.write("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/__tests__/handler-utils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/skills/handler-utils.ts src/skills/__tests__/handler-utils.test.ts
git commit -m "refactor: extract shared streamQuery helper for skill handlers"
```

---

### Task 2: Simplify all 6 built-in handlers using streamQuery

**Files:**
- Modify: `src/skills/built-in/review/handler.ts`
- Modify: `src/skills/built-in/commit-msg/handler.ts`
- Modify: `src/skills/built-in/explain/handler.ts`
- Modify: `src/skills/built-in/refactor/handler.ts`
- Modify: `src/skills/built-in/test-gen/handler.ts`
- Modify: `src/skills/built-in/fix/handler.ts`

- [ ] **Step 1: Refactor review handler**

Replace the for-await-write pattern with `streamQuery`:

```typescript
// src/skills/built-in/review/handler.ts
import type { SkillHandler } from "../../types.js";
import { streamQuery } from "../../handler-utils.js";

const SYSTEM_PROMPT = `...`; // unchanged

const handler: SkillHandler = async (ctx) => {
  const staged = ctx.flags.staged as boolean;
  const diff = ctx.context.stdin ?? (staged ? ctx.context.gitDiffStaged : ctx.context.gitDiff);
  if (!diff) {
    ctx.logger.info(staged ? "No staged changes to review." : "No changes to review. Use --staged or pipe a diff: git diff | dex review");
    return;
  }
  const prompt = `Review the following code changes:\n\n\`\`\`diff\n${diff}\n\`\`\`\n\n${ctx.context.fileTree ? `Project structure:\n\`\`\`\n${ctx.context.fileTree}\n\`\`\`` : ""}`;
  await streamQuery(ctx.agent, prompt, { systemPrompt: SYSTEM_PROMPT });
};

export default handler;
```

- [ ] **Step 2: Refactor remaining 5 handlers** (same pattern — replace for-await loop with `streamQuery`)

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (handlers are tested via executor tests)

- [ ] **Step 4: Verify built CLI still works**

Run: `npm run build && node dist/bin/dex.js review 2>&1`
Expected: `[review] No changes to review.`

- [ ] **Step 5: Commit**

```bash
git add src/skills/built-in/
git commit -m "refactor: simplify all skill handlers using streamQuery helper"
```

---

### Task 3: Replace Zod with manual validation

**Files:**
- Modify: `src/skills/validator.ts`
- Modify: `package.json` (remove `zod`)
- Test: `src/skills/__tests__/validator.test.ts` (update, tests stay same)

- [ ] **Step 1: Run existing validator tests to establish baseline**

Run: `npx vitest run src/skills/__tests__/validator.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 2: Rewrite validator.ts without Zod**

```typescript
// src/skills/validator.ts
import { SkillValidationError } from "../core/errors.js";
import type { SkillManifest } from "./types.js";

const VALID_NAME = /^[a-z][a-z0-9-]*$/;
const VALID_CONTEXT = ["git-diff","git-diff-staged","git-log","file-tree","current-file","package-json","stdin"];
const VALID_FLAG_TYPES = ["string","boolean","number"];

function fail(msg: string): never {
  throw new SkillValidationError(`Invalid manifest: ${msg}`);
}

export function validateManifest(data: unknown): SkillManifest {
  if (!data || typeof data !== "object") fail("must be an object");
  const d = data as Record<string, unknown>;

  if (typeof d.name !== "string" || !VALID_NAME.test(d.name))
    fail("name: must be lowercase alphanumeric with hyphens");
  if (typeof d.version !== "string") fail("version: required");
  if (typeof d.description !== "string") fail("description: required");
  if (!d.inputs || typeof d.inputs !== "object") fail("inputs: required");

  const inputs = d.inputs as Record<string, unknown>;

  if (inputs.args !== undefined) {
    if (!Array.isArray(inputs.args)) fail("inputs.args: must be an array");
    for (const a of inputs.args) {
      if (typeof a.name !== "string") fail("inputs.args[].name: required");
      if (typeof a.description !== "string") fail("inputs.args[].description: required");
    }
  }

  if (inputs.flags !== undefined) {
    if (!Array.isArray(inputs.flags)) fail("inputs.flags: must be an array");
    for (const f of inputs.flags) {
      if (typeof f.name !== "string") fail("inputs.flags[].name: required");
      if (!VALID_FLAG_TYPES.includes(f.type)) fail(`inputs.flags[].type: must be one of ${VALID_FLAG_TYPES.join(", ")}`);
    }
  }

  if (inputs.context !== undefined) {
    if (!Array.isArray(inputs.context)) fail("inputs.context: must be an array");
    for (const c of inputs.context) {
      if (!VALID_CONTEXT.includes(c)) fail(`inputs.context: unknown source "${c}"`);
    }
  }

  if (d.agent !== undefined) {
    if (typeof d.agent !== "object") fail("agent: must be an object");
  }

  if (d.aliases !== undefined) {
    if (!Array.isArray(d.aliases)) fail("aliases: must be an array");
  }

  return data as SkillManifest;
}
```

- [ ] **Step 3: Run validator tests — all 9 should still pass**

Run: `npx vitest run src/skills/__tests__/validator.test.ts`
Expected: All 9 PASS

- [ ] **Step 4: Verify no other file imports Zod**

Run: `grep -r "from.*zod" src/`
Expected: Only `src/skills/validator.ts` (which was just rewritten without zod)

- [ ] **Step 5: Remove Zod from package.json**

```bash
npm uninstall zod
```

- [ ] **Step 6: Run full test suite + build**

Run: `npx vitest run && npm run build`
Expected: All pass, build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/skills/validator.ts package.json package-lock.json
git commit -m "refactor: replace zod with manual validation (-8KB)"
```

---

### Task 4: Remove dead code

**Files:**
- Delete: `src/utils/prompt.ts`
- Delete: `src/utils/__tests__/prompt.test.ts`
- Modify: `src/core/config.ts` (remove `getConfigValue`)
- Modify: `src/index.ts` (remove dead exports)

- [ ] **Step 1: Delete prompt.ts and its test**

```bash
rm src/utils/prompt.ts src/utils/__tests__/prompt.test.ts
```

- [ ] **Step 2: Remove getConfigValue from config.ts**

Delete lines 86-92 of `src/core/config.ts`:
```typescript
// DELETE THIS:
export async function getConfigValue(key: string, config?: DexConfig): Promise<unknown> {
  const cfg = config ?? (await loadConfig());
  return cfg[key];
}
```

- [ ] **Step 3: Clean up index.ts exports**

Remove from `src/index.ts`:
- `getConfigValue` export (never called by anyone)
- `stripTypes` export (internal build utility, `skill.ts` imports directly from `utils/typescript.js`)

Keep:
- `estimateTokens` (useful for library consumers)

> **Note:** These are public API removals. Acceptable for v1.x since no external consumers exist yet. If breaking changes become a concern later, bump to v2.0.0.

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run && npm run build`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore: remove dead code (prompt.ts, getConfigValue, unused exports)"
```

---

### Task 5: Merge small text utilities

**Files:**
- Create: `src/utils/text.ts`
- Create: `src/utils/__tests__/text.test.ts` (merge both old test files)
- Delete: `src/utils/truncate.ts`
- Delete: `src/utils/stdin.ts`
- Delete: `src/utils/__tests__/truncate.test.ts`
- Delete: `src/utils/__tests__/stdin.test.ts`
- Modify: `src/skills/executor.ts` (update imports)
- Modify: `src/core/tools.ts` (update `truncateText` import from `../utils/truncate.js` → `../utils/text.js`)
- Modify: `src/index.ts` (update re-exports)

- [ ] **Step 1: Create text.ts combining truncate + stdin**

```typescript
// src/utils/text.ts
// -- from truncate.ts --
const DEFAULT_MAX_CHARS = 40_000;

export interface TruncateResult {
  text: string;
  truncated: boolean;
  originalLength: number;
}

export function truncateText(text: string, maxChars: number = DEFAULT_MAX_CHARS): TruncateResult {
  if (text.length <= maxChars) return { text, truncated: false, originalLength: text.length };
  const headSize = Math.floor(maxChars * 0.7);
  const tailSize = Math.floor(maxChars * 0.2);
  const omitted = text.length - headSize - tailSize;
  return {
    text: text.slice(0, headSize) + `\n\n... [${omitted.toLocaleString()} characters omitted] ...\n\n` + text.slice(-tailSize),
    truncated: true,
    originalLength: text.length,
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// -- from stdin.ts --
export async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf-8").trim();
  return text.length > 0 ? text : null;
}
```

- [ ] **Step 2: Update all imports**

Files to update:
- `src/skills/executor.ts`: change `from "../utils/truncate.js"` → `from "../utils/text.js"` AND `from "../utils/stdin.js"` → `from "../utils/text.js"`
- `src/core/tools.ts`: change `from "../utils/truncate.js"` → `from "../utils/text.js"`
- `src/index.ts`: change `from "./utils/truncate.js"` → `from "./utils/text.js"`

- [ ] **Step 3: Create new text.test.ts**

Create `src/utils/__tests__/text.test.ts` by combining content from `truncate.test.ts` and `stdin.test.ts`, updating all imports to `../text.js`.

- [ ] **Step 4: Delete old files**

```bash
rm src/utils/truncate.ts src/utils/stdin.ts
rm src/utils/__tests__/truncate.test.ts src/utils/__tests__/stdin.test.ts
```

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run && npm run build`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: merge truncate.ts + stdin.ts into text.ts"
```

---

### Task 6: Unify executeSkill and executeSkillForAcp

**Files:**
- Modify: `src/skills/executor.ts`

- [ ] **Step 1: Run executor tests to establish baseline**

Run: `npx vitest run src/skills/__tests__/executor.test.ts src/skills/__tests__/executor-acp.test.ts`
Expected: 7 tests PASS

- [ ] **Step 2: Refactor to single function with output mode parameter**

Add `captureOutput?: boolean` to `ExecuteOptions`. Restructure:

```typescript
export async function executeSkill(
  skill: LoadedSkill,
  opts: ExecuteOptions,
): Promise<string | void> {
  const { manifest, handler } = skill;
  const logger = opts.logger.child(manifest.name);

  // 1. Shared: collect context (with spinner in CLI mode only)
  const context = await collectContext(manifest.inputs.context ?? [], opts);

  // 2. Shared: create agent + merge manifest config
  const agent = createAgent(opts.config);
  const manifestAgent = manifest.agent;
  const originalQuery = agent.query.bind(agent);

  agent.query = async function* (prompt, options) {
    const mergedOptions = {
      ...options,
      tools: options?.tools ?? manifestAgent?.allowedTools,
      maxTurns: options?.maxTurns ?? manifestAgent?.maxTurns,
      cwd: options?.cwd ?? opts.cwd,
    };

    // 3. Conditional: CLI mode gets spinner, ACP mode does not
    if (!opts.captureOutput) {
      // spinner logic (start "Thinking...", stop on first text, update on tool_use)
    }

    for await (const msg of originalQuery(prompt, mergedOptions)) {
      // verbose token logging (shared for both modes)
      yield msg;
    }
  };

  const ctx = buildSkillContext(skill, context, agent, opts);

  // 4. Conditional: ACP mode captures stdout/stderr
  if (opts.captureOutput) {
    const chunks: string[] = [];
    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    const capture = (chunk: string | Uint8Array) => { chunks.push(String(chunk)); return true; };
    process.stdout.write = capture;
    process.stderr.write = capture;
    try { await handler(ctx); } finally {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    }
    return chunks.join("");
  }

  // 5. CLI mode: handler writes directly to stdout
  await handler(ctx);
}

// Backward-compatible alias
export async function executeSkillForAcp(
  skill: LoadedSkill, opts: ExecuteOptions,
): Promise<string> {
  return (await executeSkill(skill, { ...opts, captureOutput: true })) as string;
}
```

Note: After Task 5, the import for `truncateText` will be from `../utils/text.js` and `readStdin` from `../utils/text.js`. Ensure these are correct.

- [ ] **Step 3: Run tests — all should still pass**

Run: `npx vitest run src/skills/__tests__/executor.test.ts src/skills/__tests__/executor-acp.test.ts`
Expected: 7 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/skills/executor.ts
git commit -m "refactor: unify executeSkill and executeSkillForAcp"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build + npm pack**

Run: `npm run build && npm pack --dry-run`
Expected: Package < 25 kB (down from 30 kB after removing Zod)

- [ ] **Step 4: Functional smoke test**

```bash
node dist/bin/dex.js --version
node dist/bin/dex.js skill list
node dist/bin/dex.js review
node dist/bin/dex.js doctor
echo '{"jsonrpc":"2.0","method":"initialize","id":1}' | node dist/bin/dex.js serve 2>/dev/null
```

- [ ] **Step 5: Commit + push**

```bash
git add -A
git commit -m "chore: consolidation complete — reduced deps, removed dead code, merged utils"
git push
```
