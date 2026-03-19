import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitResult {
  output: string;
  error?: string;
}

async function git(
  args: string[],
  cwd: string,
): Promise<string> {
  try {
    const { stdout } = await exec("git", args, {
      cwd,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (err) {
    // git diff returns empty string when no changes — that's not an error.
    // But if git is not installed or cwd is not a repo, we should propagate.
    if (err instanceof Error && "code" in err) {
      const code = (err as { code: string | number }).code;
      // ENOENT = git not installed, 128 = not a git repo
      if (code === "ENOENT") {
        throw new Error("git is not installed or not in PATH");
      }
    }
    return "";
  }
}

export async function getGitDiff(cwd: string): Promise<string> {
  return git(["diff"], cwd);
}

export async function getGitDiffStaged(cwd: string): Promise<string> {
  return git(["diff", "--staged"], cwd);
}

export async function getGitLog(
  cwd: string,
  count: number = 10,
): Promise<string> {
  return git(["log", "--oneline", `-${count}`], cwd);
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const result = await git(
      ["rev-parse", "--is-inside-work-tree"],
      cwd,
    );
    return result === "true";
  } catch {
    return false;
  }
}
