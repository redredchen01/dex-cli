/**
 * Simple TypeScript → JavaScript transform by stripping type annotations.
 * Handles common patterns used in skill handlers without needing a full compiler.
 */
export function stripTypes(code: string): string {
  return code
    // Remove `import type { ... } from "..."` lines
    .replace(
      /^import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm,
      "",
    )
    // Remove type annotations on variables/parameters (`: Type`)
    .replace(/:\s*SkillHandler/g, "")
    .replace(/:\s*SkillContext/g, "")
    // Remove `as type` casts
    .replace(/\s+as\s+(string|boolean|number)/g, "");
}
