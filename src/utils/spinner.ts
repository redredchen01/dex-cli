import chalk from "chalk";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
  start(text: string): void;
  update(text: string): void;
  succeed(text: string): void;
  fail(text: string): void;
  stop(): void;
}

/**
 * Simple terminal spinner. Writes to stderr to keep stdout clean for skill output.
 * Automatically disabled when not a TTY (piped output, CI, ACP server).
 */
export function createSpinner(): Spinner {
  const isTTY = process.stderr.isTTY;
  let timer: ReturnType<typeof setInterval> | null = null;
  let frameIdx = 0;
  let currentText = "";

  function clear() {
    if (isTTY) {
      process.stderr.write("\r\x1b[K");
    }
  }

  function render() {
    if (!isTTY) return;
    const frame = chalk.cyan(FRAMES[frameIdx % FRAMES.length]);
    process.stderr.write(`\r${frame} ${currentText}`);
    frameIdx++;
  }

  return {
    start(text: string) {
      currentText = text;
      if (!isTTY) {
        process.stderr.write(`${text}\n`);
        return;
      }
      frameIdx = 0;
      render();
      timer = setInterval(render, 80);
    },

    update(text: string) {
      currentText = text;
      if (!isTTY) return;
      clear();
      render();
    },

    succeed(text: string) {
      this.stop();
      if (isTTY) {
        process.stderr.write(`${chalk.green("✔")} ${text}\n`);
      }
    },

    fail(text: string) {
      this.stop();
      process.stderr.write(`${chalk.red("✖")} ${text}\n`);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      clear();
    },
  };
}
