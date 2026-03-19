import { z } from "zod";
import { SkillValidationError } from "../core/errors.js";
import type { SkillManifest } from "./types.js";

const manifestArgSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
});

const manifestFlagSchema = z.object({
  name: z.string(),
  short: z.string().optional(),
  type: z.enum(["string", "boolean", "number"]),
  description: z.string().optional(),
  default: z.union([z.string(), z.boolean(), z.number()]).optional(),
});

const contextSourceSchema = z.enum([
  "git-diff",
  "git-diff-staged",
  "git-log",
  "file-tree",
  "current-file",
  "package-json",
  "stdin",
]);

const manifestSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-z][a-z0-9-]*$/,
      "Skill name must be lowercase alphanumeric with hyphens",
    ),
  version: z.string(),
  description: z.string(),
  inputs: z.object({
    args: z.array(manifestArgSchema).optional(),
    flags: z.array(manifestFlagSchema).optional(),
    context: z.array(contextSourceSchema).optional(),
  }),
  agent: z
    .object({
      systemPromptFile: z.string().optional(),
      maxTurns: z.number().optional(),
      allowedTools: z.array(z.string()).optional(),
    })
    .optional(),
  aliases: z.array(z.string()).optional(),
});

export function validateManifest(data: unknown): SkillManifest {
  const result = manifestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new SkillValidationError(`Invalid manifest: ${issues}`);
  }
  return result.data;
}
