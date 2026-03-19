import { describe, it, expect } from "vitest";
import { stripTypes } from "../typescript.js";

describe("stripTypes", () => {
  it("should remove import type statements", () => {
    const input = `import type { SkillHandler } from "../../types.js";
import type { Foo, Bar } from 'something';

const x = 1;`;
    const result = stripTypes(input);
    expect(result).not.toContain("import type");
    expect(result).toContain("const x = 1;");
  });

  it("should remove : SkillHandler annotation", () => {
    const input = `const handler: SkillHandler = async (ctx) => {};`;
    const result = stripTypes(input);
    expect(result).toBe(`const handler = async (ctx) => {};`);
  });

  it("should remove as string/boolean/number casts", () => {
    const input = `const x = ctx.flags.staged as boolean;
const y = ctx.flags.name as string;
const z = ctx.flags.count as number;`;
    const result = stripTypes(input);
    expect(result).toContain("ctx.flags.staged;");
    expect(result).toContain("ctx.flags.name;");
    expect(result).toContain("ctx.flags.count;");
    expect(result).not.toContain(" as ");
  });

  it("should preserve non-type code", () => {
    const input = `const handler = async (ctx) => {
  for await (const msg of ctx.agent.query("test")) {
    if (msg.type === "text" && msg.content) {
      process.stdout.write(msg.content);
    }
  }
};

export default handler;`;
    const result = stripTypes(input);
    expect(result).toBe(input); // No types to strip
  });

  it("should handle a realistic handler file", () => {
    const input = `import type { SkillHandler } from "../../types.js";

const PROMPT = "hello";

const handler: SkillHandler = async (ctx) => {
  const staged = ctx.flags.staged as boolean;
  for await (const msg of ctx.agent.query(PROMPT)) {
    if (msg.type === "text") {
      process.stdout.write(msg.content);
    }
  }
};

export default handler;`;

    const result = stripTypes(input);
    expect(result).not.toContain("import type");
    expect(result).not.toContain(": SkillHandler");
    expect(result).not.toContain("as boolean");
    expect(result).toContain("const PROMPT");
    expect(result).toContain("export default handler");

    // Should be valid JS (no syntax errors)
    expect(() => new Function(result)).not.toThrow;
  });
});
