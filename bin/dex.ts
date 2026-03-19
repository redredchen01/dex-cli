import { createProgram } from "../src/cli/program.js";

try {
  const program = await createProgram();
  await program.parseAsync(process.argv);
} catch (err) {
  // Commander throws on --help and --version with specific codes
  if (err instanceof Error && "code" in err) {
    const code = (err as { code: string }).code;
    if (
      code === "commander.helpDisplayed" ||
      code === "commander.version"
    ) {
      process.exit(0);
    }
  }

  const isJson = process.argv.includes("--json");
  if (isJson) {
    console.log(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  } else {
    console.error(
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  process.exit(1);
}
