import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type Io, run } from "../src/run.ts";

let container: StartedPostgreSqlContainer;
let url: string;
let cwd: string;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  url = container.getConnectionUri();
  const fixture = readFileSync(new URL("fixtures/postgres.sql", import.meta.url), "utf8");
  const result = await container.exec([
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    container.getUsername(),
    "-d",
    container.getDatabase(),
    "-c",
    fixture,
  ]);
  expect(result.exitCode, result.output).toBe(0);
});

afterAll(async () => {
  await container?.stop();
});

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "er-run-"));
});

/** Runs the action with these inputs, and records what it says. */
async function action(inputs: Record<string, string>) {
  const said = {
    outputs: {} as Record<string, string>,
    info: [] as string[],
    warnings: [] as string[],
    secrets: [] as string[],
    printed: "",
    failed: undefined as string | undefined,
  };
  const io: Io = {
    cwd,
    getInput: (name) => inputs[name] ?? "",
    setOutput: (name, value) => {
      said.outputs[name] = value;
    },
    info: (message) => said.info.push(message),
    warning: (message) => said.warnings.push(message),
    setSecret: (secret) => said.secrets.push(secret),
    print: (text) => {
      said.printed += text;
    },
    setFailed: (message) => {
      said.failed = message;
    },
  };
  await run(io);
  return said;
}

describe("run", () => {
  test("writes the diagram, and the example stays what it shows", async () => {
    const said = await action({ url });
    expect(said.failed).toBeUndefined();
    const diagram = readFileSync(join(cwd, "docs/database.mmd"), "utf8");
    expect(said.outputs).toEqual({ diagram, path: "docs/database.mmd", changed: "true" });
    expect(said.info).toEqual(["8 tables in docs/database.mmd"]);
    // `UPDATE_EXAMPLES=1 npm test` writes the example again after a change to the diagram.
    const example = new URL("../example/database.mmd", import.meta.url);
    if (process.env.UPDATE_EXAMPLES) writeFileSync(example, diagram);
    expect(diagram).toBe(readFileSync(example, "utf8"));
  });

  test("updates the README, and a second run changes nothing", async () => {
    writeFileSync(join(cwd, "README.md"), "# Shop\n");
    await action({ url, readme: "README.md", output: "schema.mmd", indexes: "true" });
    const readme = readFileSync(join(cwd, "README.md"), "utf8");
    expect(readme).toContain("## Database diagram");
    expect(readme).toContain(
      'integer user_id FK "index orders_by_user_and_status (user_id, status)"',
    );

    const again = await action({ url, readme: "README.md", output: "schema.mmd", indexes: "true" });
    expect(again.outputs.changed).toBe("false");
  });

  test("commits and pushes what changed", async () => {
    const remote = join(cwd, "remote.git");
    execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", remote]);
    execFileSync("git", ["init", "--quiet", "--initial-branch=main", cwd]);
    execFileSync("git", ["remote", "add", "origin", remote], { cwd });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=x",
        "-c",
        "user.email=x@x",
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "init",
      ],
      { cwd },
    );

    const said = await action({ url, readme: "README.md", commit: "true" });
    expect(said.info).toContain("committed and pushed docs/database.mmd, README.md");
    const log = execFileSync("git", ["log", "-1", "--format=%an %s", "main"], {
      cwd: remote,
      encoding: "utf8",
    });
    expect(log.trim()).toBe("github-actions[bot] docs: update the database diagram");

    const again = await action({ url, readme: "README.md", commit: "true" });
    expect(again.info).toContain("nothing changed: no commit");
  });

  test("the password is a secret, kept out of the logs", async () => {
    const said = await action({ url });
    expect(said.secrets).toEqual([container.getPassword()]);
    expect((await action({ database: "d", user: "u" })).secrets).toEqual([]);
  });

  test("check fails when the files are not the diagram, and writes nothing", async () => {
    await action({ url, readme: "README.md" });
    const ok = await action({ url, readme: "README.md", check: "true" });
    expect(ok.failed).toBeUndefined();
    expect(ok.outputs.changed).toBe("false");
    expect(ok.info).toContain("docs/database.mmd and README.md are up to date");

    writeFileSync(join(cwd, "README.md"), "# Shop\n");
    const stale = await action({ url, readme: "README.md", check: "true" });
    expect(stale.outputs.changed).toBe("true");
    expect(stale.failed).toBe(
      "README.md is not the diagram of the database: run erdraw and commit it",
    );
    expect(readFileSync(join(cwd, "README.md"), "utf8")).toBe("# Shop\n");

    const missing = await action({ url, output: "other.mmd", check: "true" });
    expect(missing.failed).toBe(
      "other.mmd is not the diagram of the database: run erdraw and commit it",
    );
    expect(existsSync(join(cwd, "other.mmd"))).toBe(false);
  });

  test("an output of - prints the diagram instead of writing it", async () => {
    const said = await action({ url, output: "-" });
    expect(said.printed).toMatch(/^erDiagram\n/);
    expect(said.outputs.diagram).toBe(said.printed);
    expect(existsSync(join(cwd, "-"))).toBe(false);
  });

  test("says which foreign keys point outside the diagram", async () => {
    const said = await action({ url, schemas: "billing" });
    expect(said.info).toContain("invoices (order_id) references public.orders: not drawn");
  });

  test("an empty database is a warning, not a failure", async () => {
    const said = await action({ url, schemas: "nothing_here" });
    expect(said.failed).toBeUndefined();
    expect(said.warnings).toEqual(["no tables found in nothing_here: is it the right database?"]);
  });

  test("an error fails the action with its message", async () => {
    expect((await action({ database: "d" })).failed).toBe("user is required (or a url)");
    expect(existsSync(join(cwd, "docs"))).toBe(false);
    const mysql = await action({
      type: "mysql",
      host: "127.0.0.1",
      port: "1",
      database: "d",
      user: "u",
    });
    expect(mysql.failed).toMatch(/ECONNREFUSED/);
  });
});
