import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Connection } from "../src/connection.ts";
import { readMysql } from "../src/mysql.ts";
import type { Schema, Table } from "../src/schema.ts";

let container: StartedMySqlContainer;
let connection: Connection;

beforeAll(async () => {
  container = await new MySqlContainer("mysql:8.4").start();
  connection = {
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getUserPassword(),
  };
  const fixture = readFileSync(new URL("fixtures/mysql.sql", import.meta.url), "utf8");
  const db = await mysql.createConnection({
    ...connection,
    user: "root",
    password: container.getRootPassword(),
    multipleStatements: true,
  });
  await db.query("CREATE DATABASE other; CREATE TABLE other.accounts (id INT PRIMARY KEY);");
  await db.query(fixture);
  await db.end();
});

afterAll(async () => {
  await container?.stop();
});

const find = (schema: Schema, name: string): Table | undefined =>
  schema.tables.find((table) => table.name === name);

describe("readMysql", () => {
  test("reads the base tables of the database, sorted, without views or exclusions", async () => {
    const schema = await readMysql(connection, { exclude: ["flyway_schema_history"] });
    expect(schema.tables.map((table) => table.name)).toEqual([
      "order_items",
      "orders",
      "products",
      "profiles",
      "shipments",
      "users",
      "wallets",
    ]);
  });

  test("reads columns, enum values, keys and indexes", async () => {
    const users = find(await readMysql(connection), "users");
    expect(users).toEqual({
      name: "users",
      columns: [
        { name: "id", type: "int", nullable: false },
        { name: "email", type: "varchar(255)", nullable: false },
        { name: "status", type: "enum", nullable: false, values: ["active", "inactive", "it's off"] },
        { name: "invited_by", type: "int", nullable: true },
        { name: "credit", type: "decimal(10,2) unsigned", nullable: false },
      ],
      primaryKey: ["id"],
      // MySQL indexes every foreign key; the functional index has no column to show.
      indexes: [
        { name: "email", columns: ["email"], unique: true },
        { name: "invited_by", columns: ["invited_by"], unique: false },
      ],
      foreignKeys: [{ columns: ["invited_by"], references: { table: "users", columns: ["id"] } }],
    });
  });

  test("reads composite keys and indexes in their column order", async () => {
    const schema = await readMysql(connection);
    expect(find(schema, "shipments")).toMatchObject({
      indexes: [{ name: "shipments_once", columns: ["order_id", "line"], unique: true }],
      foreignKeys: [
        { columns: ["order_id", "line"], references: { table: "order_items", columns: ["order_id", "line"] } },
      ],
    });
    expect(find(schema, "order_items")).toMatchObject({
      primaryKey: ["order_id", "line"],
      foreignKeys: [
        { columns: ["order_id"], references: { table: "orders", columns: ["id"] } },
        { columns: ["product_code"], references: { table: "products", columns: ["code"] } },
      ],
    });
    expect(find(schema, "wallets")?.foreignKeys).toEqual([]);
    expect(find(schema, "orders")?.indexes).toEqual([
      { name: "orders_by_user_and_date", columns: ["user_id", "created_at"], unique: false },
    ]);
  });

  test("a foreign key to an excluded table is left out", async () => {
    const schema = await readMysql(connection, { exclude: ["users"] });
    expect(find(schema, "profiles")?.foreignKeys).toEqual([]);
  });

  test("ssl encrypts the connection", async () => {
    const schema = await readMysql({ ...connection, ssl: true }, { exclude: ["*"] });
    expect(schema.tables).toEqual([]);
  });

  test("a wrong password is an error", async () => {
    await expect(readMysql({ ...connection, password: "wrong" })).rejects.toThrow(/Access denied/);
  });
});
