/**
 * Text utilities: truncation, token estimation, and stdin reading.
 */

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CHARS = 40_000; // ~10K tokens

export interface TruncateResult {
  text: string;
  truncated: boolean;
  originalLength: number;
}

export function truncateText(
  text: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): TruncateResult {
  if (text.length <= maxChars) {
    return { text, truncated: false, originalLength: text.length };
  }

  // Keep the first portion and last portion for context
  const headSize = Math.floor(maxChars * 0.7);
  const tailSize = Math.floor(maxChars * 0.2);
  const omitted = text.length - headSize - tailSize;

  const truncated =
    text.slice(0, headSize) +
    `\n\n... [${omitted.toLocaleString()} characters omitted] ...\n\n` +
    text.slice(-tailSize);

  return {
    text: truncated,
    truncated: true,
    originalLength: text.length,
  };
}

/**
 * Estimate token count (rough: 1 token ≈ 4 chars for code).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Stdin
// ---------------------------------------------------------------------------

/**
 * Read all data from stdin if piped (non-TTY).
 * Returns null if stdin is a TTY (interactive).
 */
export async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf-8").trim();
  return text.length > 0 ? text : null;
}
