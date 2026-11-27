import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { run } from "./run.ts";

const HELP = `Usage: erdraw [options]

Draws the Mermaid ER diagram of a PostgreSQL, MySQL or MariaDB database.

Connection (DATABASE_URL is the default url):
      --url <url>          postgres://, mysql:// or mariadb://user:password@host:port/database
      --type <type>        postgresql, mysql or mariadb, without a url (default: postgresql)
      --host <host>        (default: localhost)
      --port <port>        (default: 5432, or 3306)
      --database <name>
      --user <name>
      --password <secret>
      --ssl <mode>         true, false, require, verify-ca or verify-full
      --ssl-ca <file>      CA certificate (PEM) to verify the server with

Diagram:
  -s, --schemas <list>     PostgreSQL schemas or MySQL databases (default: public, or the database)
  -i, --include <list>     only these tables; * matches anything
  -e, --exclude <list>     not these tables
      --indexes            show indexes as comments
  -o, --output <file>      (default: docs/database.mmd; - prints it)
  -r, --readme <file>      also write it between <!-- ER_DIAGRAM_START --> and <!-- ER_DIAGRAM_END -->
      --check              write nothing; exit 1 when the files are not the diagram

  -h, --help
  -v, --version
`;

const text = (short?: string) => ({ type: "string", ...(short ? { short } : {}) }) as const;
const flag = (short?: string) => ({ type: "boolean", ...(short ? { short } : {}) }) as const;
const OPTIONS = {
  url: text(),
  type: text(),
  host: text(),
  port: text(),
  database: text(),
  user: text(),
  password: text(),
  ssl: text(),
  "ssl-ca": text(),
  schemas: text("s"),
  include: text("i"),
  exclude: text("e"),
  indexes: flag(),
  output: text("o"),
  readme: text("r"),
  check: flag(),
  help: flag("h"),
  version: flag("v"),
};

/** Where the command line runs. */
export interface Terminal {
  version: string;
  cwd: string;
  env: Record<string, string | undefined>;
  stdout(text: string): void;
  stderr(text: string): void;
}

/** Runs erdraw with these arguments; returns the exit code. */
export async function cli(args: string[], terminal: Terminal): Promise<number> {
  const fail = (message: string, code: number) => {
    terminal.stderr(`erdraw: ${message}\n`);
    return code;
  };
  let values: ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>["values"];
  try {
    values = parseArgs({ args, options: OPTIONS }).values;
  } catch (error) {
    return fail(`${(error as Error).message}\nRun erdraw --help for the options.`, 2);
  }
  if (values.help) {
    terminal.stdout(HELP);
    return 0;
  }
  if (values.version) {
    terminal.stdout(`erdraw ${terminal.version}\n`);
    return 0;
  }

  const inputs: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) inputs[name] = String(value);
  inputs.url ??= terminal.env.DATABASE_URL ?? "";
  const ca = values["ssl-ca"];
  if (ca) {
    try {
      inputs["ssl-ca"] = readFileSync(resolve(terminal.cwd, ca), "utf8");
    } catch (error) {
      return fail((error as Error).message, 1);
    }
  }

  let code = 0;
  await run({
    cwd: terminal.cwd,
    getInput: (name) => inputs[name] ?? "",
    setOutput: () => {},
    info: (message) => terminal.stderr(`${message}\n`),
    warning: (message) => terminal.stderr(`warning: ${message}\n`),
    setFailed: (message) => {
      code = fail(message, 1);
    },
    setSecret: () => {},
    print: (diagram) => terminal.stdout(diagram),
  });
  return code;
}
