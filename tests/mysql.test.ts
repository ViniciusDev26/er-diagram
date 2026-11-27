import { readFileSync } from "node:fs";
import { MariaDbContainer } from "@testcontainers/mariadb";
import { MySqlContainer } from "@testcontainers/mysql";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Connection } from "../src/connection.ts";
import { readMysql } from "../src/mysql.ts";
import type { Schema, Table } from "../src/schema.ts";

const find = (schema: Schema, name: string): Table | undefined =>
  schema.tables.find((table) => table.name === name);

const engines = [
  { engine: "MySQL", start: () => new MySqlContainer("mysql:8.4").start() },
  { engine: "MariaDB", start: () => new MariaDbContainer("mariadb:11.4").start() },
];

describe.each(engines)("readMysql on $engine", ({ engine, start }) => {
  let container: Awaited<ReturnType<typeof start>>;
  let connection: Connection;
  let database: string;

  beforeAll(async () => {
    container = await start();
    database = container.getDatabase();
    connection = {
      host: container.getHost(),
      port: container.getPort(),
      database,
      user: container.getUsername(),
      password: container.getUserPassword(),
    };
    let fixture = readFileSync(new URL("fixtures/mysql.sql", import.meta.url), "utf8");
    if (engine === "MariaDB")
      fixture = fixture.replace(/^CREATE INDEX users_by_lower_email.*$/m, "");
    const db = await mysql.createConnection({
      host: connection.host,
      port: connection.port,
      database,
      user: "root",
      password: container.getRootPassword(),
      multipleStatements: true,
    });
    await db.query(
      `CREATE DATABASE other; CREATE TABLE other.accounts (id INT PRIMARY KEY);
       GRANT SELECT ON other.* TO '${connection.user}'@'%';`,
    );
    await db.query(fixture);
    await db.end();
  });

  afterAll(async () => {
    await container?.stop();
  });

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

  test("reads columns, comments, enum values, keys and indexes", async () => {
    const users = find(await readMysql(connection), "users");
    expect(users).toEqual({
      name: "users",
      columns: [
        // MariaDB writes int(11): the display width says nothing about the column.
        { name: "id", type: "int", nullable: false },
        {
          name: "email",
          type: "varchar(255)",
          nullable: false,
          comment: "Where the receipts go",
        },
        {
          name: "status",
          type: "enum",
          nullable: false,
          values: ["active", "inactive", "it's off"],
        },
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
        {
          columns: ["order_id", "line"],
          references: { table: "order_items", columns: ["order_id", "line"] },
        },
      ],
    });
    expect(find(schema, "order_items")).toMatchObject({
      primaryKey: ["order_id", "line"],
      foreignKeys: [
        { columns: ["order_id"], references: { table: "orders", columns: ["id"] } },
        { columns: ["product_code"], references: { table: "products", columns: ["code"] } },
      ],
    });
    expect(find(schema, "orders")?.indexes).toEqual([
      { name: "orders_by_user_and_date", columns: ["user_id", "created_at"], unique: false },
    ]);
  });

  test("a foreign key to a table it does not read names it by its qualified name", async () => {
    const schema = await readMysql(connection, { exclude: ["users"] });
    expect(find(schema, "profiles")?.foreignKeys).toEqual([
      { columns: ["user_id"], references: { table: `${database}.users`, columns: ["id"] } },
    ]);
    expect(find(schema, "wallets")?.foreignKeys).toEqual([
      { columns: ["account_id"], references: { table: "other.accounts", columns: ["id"] } },
    ]);
  });

  test("reads several databases, with qualified names", async () => {
    const schema = await readMysql(connection, {
      schemas: [database, "other"],
      include: ["other.*", "wallets"],
    });
    expect(schema.tables.map((table) => table.name)).toEqual([
      "other.accounts",
      `${database}.wallets`,
    ]);
    expect(find(schema, `${database}.wallets`)?.foreignKeys).toEqual([
      { columns: ["account_id"], references: { table: "other.accounts", columns: ["id"] } },
    ]);
  });

  test("ssl require encrypts the connection", async () => {
    const schema = await readMysql({ ...connection, ssl: "require" }, { exclude: ["*"] });
    expect(schema.tables).toEqual([]);
  });

  test.runIf(engine === "MySQL")(
    "ssl verify-ca and verify-full check the certificate",
    async () => {
      // MySQL signs its certificate with a CA of its own, for a server name that is not the host.
      const ca = (await container.exec(["cat", "/var/lib/mysql/ca.pem"])).output;
      const read = (ssl: Connection["ssl"], extra: Partial<Connection> = {}) =>
        readMysql({ ...connection, ssl, ...extra }, { exclude: ["*"] });
      await expect(read("verify-ca", { ca })).resolves.toEqual({ tables: [] });
      await expect(read("verify-ca")).rejects.toThrow(/certificate/);
      await expect(read("verify-full", { ca })).rejects.toThrow(/Hostname|altnames|certificate/i);
    },
  );

  test("a wrong password is an error", async () => {
    await expect(readMysql({ ...connection, password: "wrong" })).rejects.toThrow(/Access denied/);
  });
});
