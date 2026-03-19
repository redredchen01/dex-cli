import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

export async function getFileTree(
  dir: string,
  maxDepth: number = 3,
): Promise<string> {
  const lines: string[] = [];

  async function walk(currentDir: string, depth: number, prefix: string) {
    if (depth > maxDepth) return;

    const entries = await readdir(currentDir, { withFileTypes: true });
    const filtered = entries.filter(
      (e) =>
        !e.name.startsWith(".") &&
        e.name !== "node_modules" &&
        e.name !== "dist" &&
        e.name !== "__pycache__",
    );

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      lines.push(`${prefix}${connector}${entry.name}`);

      if (entry.isDirectory()) {
        await walk(join(currentDir, entry.name), depth + 1, prefix + childPrefix);
      }
    }
  }

  await walk(dir, 0, "");
  return lines.join("\n");
}

export async function readFileContent(
  filePath: string,
): Promise<{ path: string; content: string } | null> {
  if (!existsSync(filePath)) return null;
  const content = await readFile(filePath, "utf-8");
  return { path: filePath, content };
}

export async function readPackageJson(
  cwd: string,
): Promise<Record<string, unknown> | null> {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const content = await readFile(pkgPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
