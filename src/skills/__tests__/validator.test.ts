import { describe, it, expect } from "vitest";
import { validateManifest } from "../validator.js";
import { SkillValidationError } from "../../core/errors.js";

describe("validateManifest", () => {
  const validManifest = {
    name: "review",
    version: "1.0.0",
    description: "Code review",
    inputs: {
      args: [{ name: "file", description: "File to review" }],
      flags: [
        { name: "staged", type: "boolean", default: false },
      ],
      context: ["git-diff", "file-tree"],
    },
  };

  it("should accept a valid manifest", () => {
    const result = validateManifest(validManifest);
    expect(result.name).toBe("review");
    expect(result.version).toBe("1.0.0");
    expect(result.inputs.context).toEqual(["git-diff", "file-tree"]);
  });

  it("should accept minimal manifest", () => {
    const result = validateManifest({
      name: "my-skill",
      version: "0.1.0",
      description: "A skill",
      inputs: {},
    });
    expect(result.name).toBe("my-skill");
  });

  it("should accept manifest with aliases", () => {
    const result = validateManifest({
      ...validManifest,
      aliases: ["rv", "r"],
    });
    expect(result.aliases).toEqual(["rv", "r"]);
  });

  it("should accept manifest with agent config", () => {
    const result = validateManifest({
      ...validManifest,
      agent: { maxTurns: 5, systemPromptFile: "prompt.md" },
    });
    expect(result.agent?.maxTurns).toBe(5);
  });

  it("should reject invalid name format", () => {
    expect(() =>
      validateManifest({ ...validManifest, name: "MySkill" }),
    ).toThrow(SkillValidationError);
  });

  it("should reject name starting with number", () => {
    expect(() =>
      validateManifest({ ...validManifest, name: "1skill" }),
    ).toThrow(SkillValidationError);
  });

  it("should reject missing required fields", () => {
    expect(() => validateManifest({ name: "test" })).toThrow(
      SkillValidationError,
    );
  });

  it("should reject invalid context source", () => {
    expect(() =>
      validateManifest({
        ...validManifest,
        inputs: { context: ["invalid-source"] },
      }),
    ).toThrow(SkillValidationError);
  });

  it("should reject invalid flag type", () => {
    expect(() =>
      validateManifest({
        ...validManifest,
        inputs: { flags: [{ name: "f", type: "array" }] },
      }),
    ).toThrow(SkillValidationError);
  });
});
