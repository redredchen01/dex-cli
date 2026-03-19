import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "bin/dex": "bin/dex.ts" },
    format: ["esm"],
    target: "node20",
    outDir: "dist",
    clean: true,
    sourcemap: false,
    splitting: false,
    shims: false,
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "node20",
    outDir: "dist",
    clean: false,
    dts: true,
    sourcemap: false,
    splitting: false,
  },
]);
