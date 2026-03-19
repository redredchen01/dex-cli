import { SkillValidationError } from "../core/errors.js";
import type { SkillManifest } from "./types.js";

const VALID_NAME = /^[a-z][a-z0-9-]*$/;
const VALID_CONTEXT = [
  "git-diff",
  "git-diff-staged",
  "git-log",
  "file-tree",
  "current-file",
  "package-json",
  "stdin",
];
const VALID_FLAG_TYPES = ["string", "boolean", "number"];

function fail(msg: string): never {
  throw new SkillValidationError(`Invalid manifest: ${msg}`);
}

export function validateManifest(data: unknown): SkillManifest {
  if (!data || typeof data !== "object") fail("must be an object");
  const d = data as Record<string, unknown>;

  if (typeof d.name !== "string" || !VALID_NAME.test(d.name))
    fail("name: must be lowercase alphanumeric with hyphens");
  if (typeof d.version !== "string") fail("version: required");
  if (typeof d.description !== "string") fail("description: required");
  if (!d.inputs || typeof d.inputs !== "object") fail("inputs: required");

  const inputs = d.inputs as Record<string, unknown>;

  if (inputs.args !== undefined) {
    if (!Array.isArray(inputs.args)) fail("inputs.args: must be an array");
    for (const a of inputs.args) {
      if (typeof a.name !== "string") fail("inputs.args[].name: required");
      if (typeof a.description !== "string")
        fail("inputs.args[].description: required");
    }
  }

  if (inputs.flags !== undefined) {
    if (!Array.isArray(inputs.flags)) fail("inputs.flags: must be an array");
    for (const f of inputs.flags) {
      if (typeof f.name !== "string") fail("inputs.flags[].name: required");
      if (!VALID_FLAG_TYPES.includes(f.type))
        fail(
          `inputs.flags[].type: must be one of ${VALID_FLAG_TYPES.join(", ")}`,
        );
    }
  }

  if (inputs.context !== undefined) {
    if (!Array.isArray(inputs.context)) fail("inputs.context: must be an array");
    for (const c of inputs.context) {
      if (!VALID_CONTEXT.includes(c))
        fail(`inputs.context: unknown source "${c}"`);
    }
  }

  if (d.agent !== undefined) {
    if (typeof d.agent !== "object") fail("agent: must be an object");
  }

  if (d.aliases !== undefined) {
    if (!Array.isArray(d.aliases)) fail("aliases: must be an array");
  }

  return data as SkillManifest;
}
