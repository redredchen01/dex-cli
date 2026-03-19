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
