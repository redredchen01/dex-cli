export function buildPrompt(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
  }
  // Remove unreplaced placeholders
  result = result.replaceAll(/\{\{[^}]+\}\}/g, "");
  return result.trim();
}
