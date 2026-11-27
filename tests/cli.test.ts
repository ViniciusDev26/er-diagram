import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, expect, test } from "vitest";
import { cli } from "../src/cli.ts";

let container: StartedPostgreSqlContainer;
let url: string;

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

/** Runs the command line in a new directory, and records what it says. */
async function erdraw(args: string[], env: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "er-cli-"));
  const said = { cwd, stdout: "", stderr: "", code: -1 };
  said.code = await cli(args, {
    cwd,
    env,
    stdout: (text) => {
      said.stdout += text;
    },
    stderr: (text) => {
      said.stderr += text;
    },
  });
  return said;
}

const example = readFileSync(new URL("../example/database.mmd", import.meta.url), "utf8");

test("--help and --version", async () => {
  const help = await erdraw(["--help"]);
  expect(help.code).toBe(0);
  expect(help.stdout).toMatch(/^Usage: erdraw \[options\]/);
  expect(help.stdout).toContain("--check");
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(await erdraw(["-v"])).toMatchObject({ code: 0, stdout: `erdraw ${version}\n` });
});

test("prints the diagram of DATABASE_URL with -o -", async () => {
  const said = await erdraw(["-o", "-"], { DATABASE_URL: url });
  expect(said.code).toBe(0);
  expect(said.stdout).toBe(example);
  expect(said.stderr).toBe("8 tables in stdout\n");
});

test("writes the files like the Action, and --check says when they are stale", async () => {
  const written = await erdraw(["--url", url, "--readme", "README.md", "--indexes"]);
  expect(written.code).toBe(0);
  expect(readFileSync(join(written.cwd, "README.md"), "utf8")).toContain("ER_DIAGRAM_START");

  const stale = await erdraw(["--url", url, "--check"]);
  expect(stale.code).toBe(1);
  expect(stale.stderr).toContain(
    "erdraw: docs/database.mmd is not the diagram of the database: run erdraw and commit it\n",
  );
});

test("warnings say so, and --ssl-ca reads a file", async () => {
  const empty = await erdraw(["--url", url, "-s", "nothing_here", "-o", "-"]);
  expect(empty.stderr).toContain("warning: no tables found in nothing_here");

  const said = await erdraw(["--url", url, "--ssl-ca", "missing.pem"]);
  expect(said.code).toBe(1);
  expect(said.stderr).toMatch(/^erdraw: .*missing\.pem/);
  const cwd = mkdtempSync(join(tmpdir(), "er-ca-"));
  writeFileSync(join(cwd, "ca.pem"), "not a certificate");
  const bad = await erdraw(["--url", url, "--ssl-ca", join(cwd, "ca.pem")]);
  expect(bad.code).toBe(1);
});

test("a wrong option is a usage error", async () => {
  const said = await erdraw(["--colour"]);
  expect(said.code).toBe(2);
  expect(said.stderr).toMatch(/^erdraw: .*--colour.*\nRun erdraw --help/s);
});
