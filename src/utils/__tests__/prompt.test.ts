import { describe, it, expect } from "vitest";
import { buildPrompt } from "../prompt.js";

describe("buildPrompt", () => {
  it("should replace template variables", () => {
    const result = buildPrompt("Hello {{name}}, welcome to {{place}}!", {
      name: "Alice",
      place: "Wonderland",
    });
    expect(result).toBe("Hello Alice, welcome to Wonderland!");
  });

  it("should remove unreplaced placeholders", () => {
    const result = buildPrompt("Hello {{name}}, {{greeting}}", {
      name: "Bob",
    });
    expect(result).toBe("Hello Bob,");
  });

  it("should skip undefined values", () => {
    const result = buildPrompt("{{a}} and {{b}}", {
      a: "first",
      b: undefined,
    });
    expect(result).toBe("first and");
  });

  it("should handle empty template", () => {
    const result = buildPrompt("", { a: "test" });
    expect(result).toBe("");
  });

  it("should replace multiple occurrences", () => {
    const result = buildPrompt("{{x}} + {{x}} = 2{{x}}", { x: "1" });
    expect(result).toBe("1 + 1 = 21");
  });
});
