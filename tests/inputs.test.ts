import { describe, expect, test } from "vitest";
import { DEFAULT_EXCLUDE, parseInputs } from "../src/inputs.ts";

const inputs = (values: Record<string, string>) => parseInputs((name) => values[name] ?? "");

describe("parseInputs", () => {
  test("defaults: postgresql on localhost, the public schema, docs/database.mmd, no README or commit", () => {
    expect(inputs({ database: "shop", user: "app", password: "secret" })).toEqual({
      type: "postgresql",
      connection: {
        host: "localhost",
        port: 5432,
        database: "shop",
        user: "app",
        password: "secret",
        ssl: false,
      },
      read: { schemas: ["public"], exclude: DEFAULT_EXCLUDE },
      output: "docs/database.mmd",
      indexes: false,
    });
  });

  test("mysql listens on 3306 by default", () => {
    expect(inputs({ type: "mysql", database: "shop", user: "app" }).connection).toMatchObject({
      port: 3306,
      password: "",
    });
  });

  test("a URL gives the type and the connection", () => {
    const config = inputs({ url: "postgres://app:p%40ss@db.internal:6543/shop?sslmode=require" });
    expect(config.type).toBe("postgresql");
    expect(config.connection).toEqual({
      host: "db.internal",
      port: 6543,
      database: "shop",
      user: "app",
      password: "p@ss",
      ssl: true,
    });
    expect(inputs({ url: "mysql://root@localhost/shop" })).toMatchObject({
      type: "mysql",
      connection: { port: 3306, user: "root", password: "", ssl: false },
    });
    expect(inputs({ url: "postgresql://u@h/d", ssl: "true" }).connection.ssl).toBe(true);
  });

  test("every option", () => {
    const config = inputs({
      type: "postgresql",
      host: "db",
      port: "15432",
      database: "shop",
      user: "app",
      schemas: "public, billing",
      exclude: "audit_*, tmp",
      output: "schema.mmd",
      readme: "docs/README.md",
      indexes: "true",
      commit: "true",
      "commit-message": "docs: schema",
      "commit-author": "Bot <bot@example.com>",
    });
    expect(config).toMatchObject({
      connection: { host: "db", port: 15432 },
      read: { schemas: ["public", "billing"], exclude: [...DEFAULT_EXCLUDE, "audit_*", "tmp"] },
      output: "schema.mmd",
      readme: "docs/README.md",
      indexes: true,
      commit: { message: "docs: schema", name: "Bot", email: "bot@example.com" },
    });
  });

  test("commit defaults to the github-actions bot", () => {
    expect(inputs({ database: "d", user: "u", commit: "true" }).commit).toEqual({
      message: "docs: update the database diagram",
      name: "github-actions[bot]",
      email: "41898282+github-actions[bot]@users.noreply.github.com",
    });
  });

  test("wrong inputs are errors that name the input", () => {
    expect(() => inputs({ user: "u" })).toThrow("database is required (or a url)");
    expect(() => inputs({ database: "d" })).toThrow("user is required (or a url)");
    expect(() => inputs({ database: "d", user: "u", type: "oracle" })).toThrow(
      "type must be postgresql or mysql, not 'oracle'",
    );
    expect(() => inputs({ url: "sqlite:///x.db" })).toThrow(
      "url must start with postgres://, postgresql:// or mysql://",
    );
    expect(() => inputs({ url: "not a url" })).toThrow("url is not a URL");
    expect(() => inputs({ database: "d", user: "u", port: "54x" })).toThrow(
      "port must be a number, not '54x'",
    );
    expect(() => inputs({ database: "d", user: "u", indexes: "yes" })).toThrow(
      "indexes must be true or false, not 'yes'",
    );
    expect(() => inputs({ database: "d", user: "u", "commit-author": "Bot" })).toThrow(
      "commit-author must be 'Name <email>', not 'Bot'",
    );
  });
});
