import { describe, it, expect } from "vitest";
import { SkillRegistry } from "../registry.js";
import { SkillNotFoundError } from "../../core/errors.js";
import type { LoadedSkill } from "../types.js";

function makeSkill(
  name: string,
  aliases?: string[],
): LoadedSkill {
  return {
    manifest: {
      name,
      version: "1.0.0",
      description: `${name} skill`,
      inputs: {},
      aliases,
    },
    handler: async () => {},
    path: `/skills/${name}`,
    source: "built-in",
  };
}

describe("SkillRegistry", () => {
  it("should register and retrieve a skill", () => {
    const reg = new SkillRegistry();
    const skill = makeSkill("review");
    reg.register(skill);

    expect(reg.get("review")).toBe(skill);
    expect(reg.has("review")).toBe(true);
  });

  it("should list all skills", () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill("review"));
    reg.register(makeSkill("explain"));

    expect(reg.list()).toHaveLength(2);
    expect(reg.names()).toEqual(["review", "explain"]);
  });

  it("should resolve aliases", () => {
    const reg = new SkillRegistry();
    const skill = makeSkill("commit-msg", ["cm"]);
    reg.register(skill);

    expect(reg.get("cm")).toBe(skill);
    expect(reg.has("cm")).toBe(true);
  });

  it("should return all names including aliases", () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill("test-gen", ["tg"]));

    expect(reg.allNames()).toContain("test-gen");
    expect(reg.allNames()).toContain("tg");
  });

  it("should throw SkillNotFoundError for unknown skill", () => {
    const reg = new SkillRegistry();
    expect(() => reg.get("nonexistent")).toThrow(SkillNotFoundError);
  });

  it("should remove a skill and its aliases", () => {
    const reg = new SkillRegistry();
    reg.register(makeSkill("review", ["rv"]));

    expect(reg.remove("review")).toBe(true);
    expect(reg.has("review")).toBe(false);
    expect(reg.has("rv")).toBe(false);
  });

  it("should return false when removing nonexistent skill", () => {
    const reg = new SkillRegistry();
    expect(reg.remove("nope")).toBe(false);
  });

  it("should overwrite skill with same name", () => {
    const reg = new SkillRegistry();
    const s1 = makeSkill("review");
    const s2 = makeSkill("review");
    reg.register(s1);
    reg.register(s2);

    expect(reg.get("review")).toBe(s2);
    expect(reg.list()).toHaveLength(1);
  });
});
