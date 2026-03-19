// Compile built-in skill handlers from .ts to .js
import { readdir, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const SRC = "src/skills/built-in";
const DEST = "dist/built-in";

// Must match src/utils/typescript.ts stripTypes()
function stripTypes(code) {
  return code
    .replace(/^import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, "")
    .replace(/:\s*SkillHandler/g, "")
    .replace(/:\s*SkillContext/g, "")
    .replace(/\s+as\s+(string|boolean|number)/g, "");
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`Source directory not found: ${SRC}`);
    process.exit(1);
  }

  if (existsSync(DEST)) await rm(DEST, { recursive: true });

  const entries = await readdir(SRC, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const srcDir = join(SRC, entry.name);
    const destDir = join(DEST, entry.name);
    await mkdir(destDir, { recursive: true });

    // Copy manifest.json
    const manifestSrc = join(srcDir, "manifest.json");
    if (existsSync(manifestSrc)) {
      await cp(manifestSrc, join(destDir, "manifest.json"));
    }

    // Compile handler.ts → handler.js
    const handlerSrc = join(srcDir, "handler.ts");
    if (existsSync(handlerSrc)) {
      const tsCode = await readFile(handlerSrc, "utf-8");
      await writeFile(join(destDir, "handler.js"), stripTypes(tsCode));
    }

    count++;
  }

  console.log(`Built ${count} skills to ${DEST}`);
}

main();
