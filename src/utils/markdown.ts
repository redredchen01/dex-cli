import chalk from "chalk";

export interface MarkdownRenderer {
  write(chunk: string): void;
  flush(): void;
}

export function createMarkdownRenderer(): MarkdownRenderer {
  let buffer = "";
  let inCodeBlock = false;

  function processLine(line: string): string {
    // Header
    const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      return chalk.bold.underline(headerMatch[2]);
    }

    // Bullet list
    if (line.match(/^\s*[-*]\s+/)) {
      const content = line.replace(/^\s*[-*]\s+/, "");
      return `  • ${processInline(content)}`;
    }

    // Numbered list — keep as-is but process inline
    if (line.match(/^\s*\d+\.\s+/)) {
      const match = line.match(/^(\s*\d+\.\s+)(.*)/);
      if (match) {
        return `${match[1]}${processInline(match[2])}`;
      }
    }

    return processInline(line);
  }

  function processInline(text: string): string {
    // Bold: **text**
    text = text.replace(/\*\*(.+?)\*\*/g, (_m, p1: string) => chalk.bold(p1));

    // Italic: *text*
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_m, p1: string) =>
      chalk.italic(p1),
    );

    // Inline code: `text`
    text = text.replace(/`([^`]+)`/g, (_m, p1: string) => chalk.cyan(p1));

    return text;
  }

  function emitLine(line: string): void {
    if (inCodeBlock) {
      process.stdout.write(chalk.gray("│ " + line) + "\n");
    } else {
      process.stdout.write(processLine(line) + "\n");
    }
  }

  return {
    write(chunk: string): void {
      buffer += chunk;

      // Process complete lines from the buffer
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) segment in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        // Toggle code block state on fence markers
        if (line.trimStart().startsWith("```")) {
          if (!inCodeBlock) {
            inCodeBlock = true;
            process.stdout.write(chalk.gray("┌─────────") + "\n");
          } else {
            inCodeBlock = false;
            process.stdout.write(chalk.gray("└─────────") + "\n");
          }
          continue;
        }
        emitLine(line);
      }
    },

    flush(): void {
      if (buffer.length > 0) {
        // Check for dangling code fence
        if (buffer.trimStart().startsWith("```")) {
          if (!inCodeBlock) {
            inCodeBlock = true;
            process.stdout.write(chalk.gray("┌─────────") + "\n");
          } else {
            inCodeBlock = false;
            process.stdout.write(chalk.gray("└─────────") + "\n");
          }
        } else {
          emitLine(buffer);
        }
        buffer = "";
      }
      inCodeBlock = false;
    },
  };
}
