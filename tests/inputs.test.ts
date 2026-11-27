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
      },
      read: { schemas: ["public"], include: [], exclude: DEFAULT_EXCLUDE },
      output: "docs/database.mmd",
      indexes: false,
      check: false,
    });
  });

  test("mysql listens on 3306 and reads the connection's database by default", () => {
    const config = inputs({ type: "mysql", database: "shop", user: "app" });
    expect(config.connection).toMatchObject({ port: 3306, password: "" });
    expect(config.read.schemas).toEqual(["shop"]);
    expect(inputs({ type: "mariadb", database: "shop", user: "app" }).type).toBe("mysql");
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
      ssl: "require",
    });
    expect(inputs({ url: "mysql://root@localhost/shop" })).toMatchObject({
      type: "mysql",
      connection: { port: 3306, user: "root", password: "" },
      read: { schemas: ["shop"] },
    });
    expect(inputs({ url: "mariadb://root@localhost/shop" }).type).toBe("mysql");
  });

  test("ssl comes from the input, else from the URL's sslmode or ssl-mode", () => {
    const ssl = (values: Record<string, string>) => inputs(values).connection.ssl;
    expect(ssl({ url: "postgresql://u@h/d", ssl: "true" })).toBe("require");
    expect(ssl({ url: "postgresql://u@h/d?sslmode=verify-ca" })).toBe("verify-ca");
    expect(ssl({ url: "postgresql://u@h/d?sslmode=verify-full" })).toBe("verify-full");
    expect(ssl({ url: "postgresql://u@h/d?sslmode=disable" })).toBeUndefined();
    expect(ssl({ url: "postgresql://u@h/d?sslmode=verify-full", ssl: "false" })).toBeUndefined();
    expect(ssl({ url: "mysql://u@h/d?ssl-mode=REQUIRED" })).toBe("require");
    expect(ssl({ url: "mysql://u@h/d?ssl-mode=VERIFY_CA" })).toBe("verify-ca");
    expect(ssl({ url: "mysql://u@h/d?ssl-mode=VERIFY_IDENTITY" })).toBe("verify-full");
    expect(ssl({ database: "d", user: "u", ssl: "verify-ca" })).toBe("verify-ca");
  });

  test("a CA certificate verifies the server, fully unless ssl says otherwise", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----";
    expect(inputs({ database: "d", user: "u", "ssl-ca": pem }).connection).toMatchObject({
      ssl: "verify-full",
      ca: pem,
    });
    expect(
      inputs({ database: "d", user: "u", "ssl-ca": pem, ssl: "verify-ca" }).connection.ssl,
    ).toBe("verify-ca");
  });

  test("every option", () => {
    const config = inputs({
      type: "postgresql",
      host: "db",
      port: "15432",
      database: "shop",
      user: "app",
      schemas: "public, billing",
      include: "order*, users",
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
      read: {
        schemas: ["public", "billing"],
        include: ["order*", "users"],
        exclude: [...DEFAULT_EXCLUDE, "audit_*", "tmp"],
      },
      output: "schema.mmd",
      readme: "docs/README.md",
      indexes: true,
      check: false,
      commit: { message: "docs: schema", name: "Bot", email: "bot@example.com" },
    });
    expect(inputs({ database: "d", user: "u", check: "true" }).check).toBe(true);
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
      "type must be postgresql, mysql or mariadb, not 'oracle'",
    );
    expect(() => inputs({ url: "sqlite:///x.db" })).toThrow(
      "url must start with postgres://, postgresql://, mysql:// or mariadb://",
    );
    expect(() => inputs({ url: "not a url" })).toThrow("url is not a URL");
    expect(() => inputs({ database: "d", user: "u", port: "54x" })).toThrow(
      "port must be a number, not '54x'",
    );
    expect(() => inputs({ database: "d", user: "u", indexes: "yes" })).toThrow(
      "indexes must be true or false, not 'yes'",
    );
    expect(() => inputs({ database: "d", user: "u", ssl: "maybe" })).toThrow(
      "ssl must be true, false, require, verify-ca or verify-full, not 'maybe'",
    );
    expect(() => inputs({ database: "d", user: "u", "commit-author": "Bot" })).toThrow(
      "commit-author must be 'Name <email>', not 'Bot'",
    );
    expect(() => inputs({ database: "d", user: "u", check: "true", commit: "true" })).toThrow(
      "check only reads: it cannot commit",
    );
  });
});
