import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cli } from "./cli.ts";

// dist/cli.cjs is next to the package.json release-please writes the version in.
const { version } = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

void cli(process.argv.slice(2), {
  version,
  cwd: process.cwd(),
  env: process.env,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
}).then((code) => {
  process.exitCode = code;
});
