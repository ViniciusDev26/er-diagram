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
  /** Masks a value in the logs. */
  setSecret(secret: string): void;
  /** Writes to the standard output: the diagram, for an output of `-`. */
  print(text: string): void;
}

const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : undefined);

/** "a is" or "a and b are". */
const are = (paths: string[]) => `${paths.join(" and ")} ${paths.length > 1 ? "are" : "is"}`;

/**
 * Reads the database and writes its diagram (and the README), or only compares them with `check`,
 * and commits them if asked to.
 */
export async function run(io: Io): Promise<void> {
  try {
    const config = parseInputs((name) => io.getInput(name));
    if (config.connection.password) io.setSecret(config.connection.password);
    const reader = config.type === "mysql" ? readMysql : readPostgres;
    const schema = await reader(config.connection, config.read);
    if (schema.tables.length === 0) {
      io.warning(
        `no tables found in ${config.read.schemas?.join(", ")}: is it the right database?`,
      );
    }
    const drawn = new Set(schema.tables.map((table) => table.name));
    for (const table of schema.tables) {
      for (const fk of table.foreignKeys) {
        if (drawn.has(fk.references.table)) continue;
        io.info(
          `${table.name} (${fk.columns.join(", ")}) references ${fk.references.table}: not drawn`,
        );
      }
    }
    const diagram = render(schema, { indexes: config.indexes });

    const files = new Map<string, string>();
    if (config.output === "-") io.print(diagram);
    else files.set(config.output, diagram);
    if (config.readme) {
      files.set(config.readme, embed(read(resolve(io.cwd, config.readme)), diagram));
    }
    const stale = [...files].filter(([path, content]) => read(resolve(io.cwd, path)) !== content);
    io.info(
      `${schema.tables.length} tables in ${config.output === "-" ? "stdout" : config.output}`,
    );
    io.setOutput("diagram", diagram);
    io.setOutput("path", config.output);
    io.setOutput("changed", String(stale.length > 0));

    if (config.check) {
      if (stale.length > 0) {
        const paths = stale.map(([path]) => path);
        io.setFailed(`${are(paths)} not the diagram of the database: run erdraw and commit it`);
      } else {
        io.info(`${are([...files.keys()])} up to date`);
      }
      return;
    }
    for (const [path, content] of stale) {
      const absolute = resolve(io.cwd, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
    }
    if (config.commit) {
      const paths = [...files.keys()];
      const committed = await commitFiles(io.cwd, paths, config.commit);
      io.info(
        committed ? `committed and pushed ${paths.join(", ")}` : "nothing changed: no commit",
      );
    }
  } catch (error) {
    io.setFailed((error as Error).message);
  }
}
