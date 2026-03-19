import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findPackageJson(): string {
  // Search upward from __dirname for package.json
  const candidates = [
    join(__dirname, "..", "..", "package.json"),  // dist/core → root
    join(__dirname, "..", "package.json"),         // src/core → root
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

let cachedVersion: string = "";

export function getVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(readFileSync(findPackageJson(), "utf-8"));
    cachedVersion = pkg.version ?? "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion;
}
