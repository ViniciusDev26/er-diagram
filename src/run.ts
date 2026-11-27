import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { commitFiles } from "./git.ts";
import { parseInputs } from "./inputs.ts";
import { render } from "./mermaid.ts";
import { readMysql } from "./mysql.ts";
import { readPostgres } from "./postgres.ts";
import { embed } from "./readme.ts";

/** What the action talks to: @actions/core in a workflow, a recorder in the tests. */
export interface Io {
  cwd: string;
  getInput(name: string): string;
  setOutput(name: string, value: string): void;
  info(message: string): void;
  warning(message: string): void;
  setFailed(message: string): void;
}

/** Writes the file if its content changes; says whether it did. */
function write(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return true;
}

/** Reads the database, writes its diagram (and the README), and commits them if asked to. */
export async function run(io: Io): Promise<void> {
  try {
    const config = parseInputs((name) => io.getInput(name));
    const read = config.type === "mysql" ? readMysql : readPostgres;
    const schema = await read(config.connection, config.read);
    if (schema.tables.length === 0) {
      io.warning(
        `no tables found in ${config.read.schemas?.join(", ")}: is it the right database?`,
      );
    }
    const diagram = render(schema, { indexes: config.indexes });

    const files = [config.output];
    let changed = write(resolve(io.cwd, config.output), diagram);
    if (config.readme) {
      const path = resolve(io.cwd, config.readme);
      const readme = existsSync(path) ? readFileSync(path, "utf8") : undefined;
      changed = write(path, embed(readme, diagram)) || changed;
      files.push(config.readme);
    }
    io.info(`${schema.tables.length} tables in ${config.output}`);
    io.setOutput("diagram", diagram);
    io.setOutput("path", config.output);
    io.setOutput("changed", String(changed));

    if (config.commit) {
      const committed = await commitFiles(io.cwd, files, config.commit);
      io.info(
        committed ? `committed and pushed ${files.join(", ")}` : "nothing changed: no commit",
      );
    }
  } catch (error) {
    io.setFailed((error as Error).message);
  }
}
