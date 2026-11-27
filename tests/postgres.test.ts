import { readFileSync } from "node:fs";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Connection } from "../src/connection.ts";
import { postgresSsl, readPostgres } from "../src/postgres.ts";
import type { Schema, Table } from "../src/schema.ts";

const find = (schema: Schema, name: string): Table | undefined =>
  schema.tables.find((table) => table.name === name);

describe("postgresSsl", () => {
  test("encrypts, and verifies the certificate when asked to", () => {
    const base = { host: "h", port: 1, database: "d", user: "u", password: "p" };
    expect(postgresSsl(base)).toBe(false);
    expect(postgresSsl({ ...base, ssl: "require" })).toEqual({ rejectUnauthorized: false });
    expect(postgresSsl({ ...base, ssl: "verify-full" })).toEqual({ rejectUnauthorized: true });
    expect(postgresSsl({ ...base, ssl: "verify-full", ca: "PEM" })).toEqual({
      rejectUnauthorized: true,
      ca: "PEM",
    });
    // verify-ca trusts the chain without matching the host name.
    const verifyCa = postgresSsl({ ...base, ssl: "verify-ca", ca: "PEM" });
    expect(verifyCa).toMatchObject({ rejectUnauthorized: true, ca: "PEM" });
    expect((verifyCa as { checkServerIdentity: () => unknown }).checkServerIdentity()).toBe(
      undefined,
    );
  });
});

// The oldest PostgreSQL supported and the newest.
describe.each(["postgres:13-alpine", "postgres:17-alpine"])("readPostgres on %s", (image) => {
  let container: StartedPostgreSqlContainer;
  let connection: Connection;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(image).start();
    connection = {
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    };
    const fixture = readFileSync(new URL("fixtures/postgres.sql", import.meta.url), "utf8");
    const result = await container.exec([
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      connection.user,
      "-d",
      connection.database,
      "-c",
      fixture,
    ]);
    expect(result.exitCode, result.output).toBe(0);
  });

  afterAll(async () => {
    await container?.stop();
  });

  test("reads the tables of the public schema, sorted, without views, partitions or exclusions", async () => {
    const schema = await readPostgres(connection, { exclude: ["flyway_*"] });
    expect(schema.tables.map((table) => table.name)).toEqual([
      "coupons",
      "events",
      "order_items",
      "orders",
      "products",
      "profiles",
      "shipments",
      "users",
    ]);
  });

  test("reads columns with compact types, nullability and enum values", async () => {
    const users = find(await readPostgres(connection), "users");
    expect(users).toEqual({
      name: "users",
      columns: [
        { name: "id", type: "integer", nullable: false },
        {
          name: "email",
          type: "varchar(255)",
          nullable: false,
          comment: "Where the receipts go",
        },
        { name: "name", type: "text", nullable: false },
        {
          name: "status",
          type: "user_status",
          nullable: false,
          values: ["active", "inactive", "suspended"],
        },
        { name: "invited_by", type: "integer", nullable: true },
        { name: "created_at", type: "timestamptz", nullable: false },
      ],
      primaryKey: ["id"],
      // The expression index has no column to show.
      indexes: [{ name: "users_email_key", columns: ["email"], unique: true }],
      foreignKeys: [{ columns: ["invited_by"], references: { table: "users", columns: ["id"] } }],
    });
  });

  test("reads composite keys and indexes in their column order", async () => {
    const schema = await readPostgres(connection);
    expect(find(schema, "shipments")).toMatchObject({
      columns: [
        { name: "id", type: "bigint" },
        { name: "order_id" },
        { name: "product_id" },
        { name: "shipped_at", type: "timestamp", nullable: true },
      ],
      indexes: [
        {
          name: "shipments_order_id_product_id_key",
          columns: ["order_id", "product_id"],
          unique: true,
        },
      ],
      foreignKeys: [
        {
          columns: ["order_id", "product_id"],
          references: { table: "order_items", columns: ["order_id", "product_id"] },
        },
      ],
    });
    expect(find(schema, "order_items")).toMatchObject({
      primaryKey: ["order_id", "product_id"],
      foreignKeys: [
        { columns: ["order_id"], references: { table: "orders" } },
        { columns: ["product_id"], references: { table: "products" } },
      ],
    });
    expect(find(schema, "orders")?.indexes).toEqual([
      { name: "one_pending_order_per_user", columns: ["user_id"], unique: true, partial: true },
      { name: "orders_by_user_and_status", columns: ["user_id", "status"], unique: false },
    ]);
    // The covering index's key is the name; the price is only stored in it.
    expect(find(schema, "products")?.indexes).toEqual([
      { name: "products_by_name", columns: ["name"], unique: false },
      { name: "products_name_key", columns: ["name"], unique: true },
    ]);
    expect(find(schema, "profiles")?.columns[2]).toEqual({
      name: "tags",
      type: "text[]",
      nullable: true,
    });
    expect(find(schema, "products")?.columns[2]).toEqual({
      name: "price",
      type: "numeric(10,2)",
      nullable: false,
    });
  });

  test("qualifies the names when it reads several schemas", async () => {
    const schema = await readPostgres(connection, {
      schemas: ["public", "billing"],
      exclude: ["flyway_schema_history", "public.events"],
    });
    const names = schema.tables.map((table) => table.name);
    expect(names).toContain("billing.invoices");
    expect(names).toContain("public.users");
    expect(names).not.toContain("public.events");
    expect(names).not.toContain("public.flyway_schema_history");
    expect(find(schema, "billing.invoices")?.foreignKeys).toEqual([
      { columns: ["order_id"], references: { table: "public.orders", columns: ["id"] } },
    ]);
  });

  test("include keeps only the tables it matches", async () => {
    const schema = await readPostgres(connection, { include: ["order*"] });
    expect(schema.tables.map((table) => table.name)).toEqual(["order_items", "orders"]);
  });

  test("a foreign key to a table it does not read names it by its qualified name", async () => {
    const schema = await readPostgres(connection, { schemas: ["billing"] });
    expect(schema.tables).toEqual([
      {
        name: "invoices",
        columns: [
          { name: "id", type: "integer", nullable: false },
          { name: "order_id", type: "integer", nullable: false },
        ],
        primaryKey: ["id"],
        indexes: [],
        foreignKeys: [
          { columns: ["order_id"], references: { table: "public.orders", columns: ["id"] } },
        ],
      },
    ]);
  });

  test("ssl asks the server for an encrypted connection", async () => {
    // The test server has no certificate: asking for SSL is what fails.
    await expect(readPostgres({ ...connection, ssl: "require" })).rejects.toThrow(/SSL/);
  });

  test("a wrong password is an error that names the database", async () => {
    await expect(readPostgres({ ...connection, password: "wrong" })).rejects.toThrow(/password/);
  });
});
