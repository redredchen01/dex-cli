import { describe, it, expect } from "vitest";
import { truncateText, estimateTokens } from "../truncate.js";

describe("truncateText", () => {
  it("should not truncate short text", () => {
    const result = truncateText("hello world", 100);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("hello world");
  });

  it("should truncate text exceeding limit", () => {
    const long = "x".repeat(1000);
    const result = truncateText(long, 100);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(1000);
    expect(result.originalLength).toBe(1000);
    expect(result.text).toContain("characters omitted");
  });

  it("should keep head (70%) and tail (20%) of original", () => {
    const long = "A".repeat(500) + "B".repeat(500);
    const result = truncateText(long, 200);
    expect(result.truncated).toBe(true);
    // Head should be mostly A's
    expect(result.text.startsWith("A")).toBe(true);
    // Tail should be B's
    expect(result.text.endsWith("B")).toBe(true);
  });

  it("should handle exact limit", () => {
    const text = "x".repeat(100);
    const result = truncateText(text, 100);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
  });

  it("should use default limit of 40K chars", () => {
    const small = "x".repeat(30_000);
    expect(truncateText(small).truncated).toBe(false);

    const large = "x".repeat(50_000);
    expect(truncateText(large).truncated).toBe(true);
  });
});

describe("estimateTokens", () => {
  it("should estimate ~1 token per 4 chars", () => {
    expect(estimateTokens("hello world")).toBe(3); // 11 / 4 = 2.75 → 3
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("should return 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});
