// Force chalk ANSI output in non-TTY test environment
process.env.FORCE_COLOR = "3";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import chalk from "chalk";
import { createMarkdownRenderer } from "../markdown.js";

describe("createMarkdownRenderer", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;
  let output: string;

  beforeEach(() => {
    output = "";
    writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        output += String(chunk);
        return true;
      });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("should render bold text", () => {
    const renderer = createMarkdownRenderer();
    renderer.write("This is **bold** text\n");
    renderer.flush();
    expect(output).toContain(chalk.bold("bold"));
    expect(output).toContain("This is");
    expect(output).toContain("text");
  });

  it("should render headers with bold and underline", () => {
    const renderer = createMarkdownRenderer();
    renderer.write("# My Header\n");
    renderer.flush();
    expect(output).toContain(chalk.bold.underline("My Header"));
  });

  it("should render code blocks with gray borders", () => {
    const renderer = createMarkdownRenderer();
    renderer.write("```\nconst x = 1;\n```\n");
    renderer.flush();
    expect(output).toContain("const x = 1;");
    // Check for border characters (rendered via chalk.gray)
    expect(output).toContain("┌─────────");
    expect(output).toContain("└─────────");
  });

  it("should handle partial chunks correctly", () => {
    const renderer = createMarkdownRenderer();
    // Split "**bold**" across two chunks
    renderer.write("This is **bo");
    renderer.write("ld** text\n");
    renderer.flush();
    expect(output).toContain(chalk.bold("bold"));
  });

  it("should render bullet lists with bullet prefix", () => {
    const renderer = createMarkdownRenderer();
    renderer.write("- item one\n- item two\n");
    renderer.flush();
    expect(output).toContain("  • item one");
    expect(output).toContain("  • item two");
  });

  it("should render inline code with cyan", () => {
    const renderer = createMarkdownRenderer();
    renderer.write("Use `console.log` here\n");
    renderer.flush();
    expect(output).toContain(chalk.cyan("console.log"));
  });

  it("should render italic text", () => {
    const renderer = createMarkdownRenderer();
    renderer.write("This is *italic* text\n");
    renderer.flush();
    expect(output).toContain(chalk.italic("italic"));
  });

  it("should keep numbered lists as-is", () => {
    const renderer = createMarkdownRenderer();
    renderer.write("1. first\n2. second\n");
    renderer.flush();
    expect(output).toContain("1. first");
    expect(output).toContain("2. second");
  });

  it("should flush remaining buffer content", () => {
    const renderer = createMarkdownRenderer();
    renderer.write("no newline at end");
    renderer.flush();
    expect(output).toContain("no newline at end");
  });
});
