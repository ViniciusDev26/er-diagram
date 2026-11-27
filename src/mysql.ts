import mysql, { type RowDataPacket } from "mysql2/promise";
import type { Connection, ReadOptions } from "./connection.ts";
import { excluder } from "./exclude.ts";
import type { Column, Schema, Table } from "./schema.ts";

/** The values of `enum('a','it''s')` or `set(...)`, as MySQL quotes them. */
export function enumValues(columnType: string): string[] {
  const list = columnType.slice(columnType.indexOf("(") + 1, columnType.lastIndexOf(")"));
  return [...list.matchAll(/'((?:[^'\\]|''|\\.)*)'/g)].map(([, value]) =>
    (value as string).replaceAll("''", "'").replace(/\\(.)/g, "$1"),
  );
}

/**
 * The schema of a MySQL database: its base tables with their columns, primary keys, indexes and
 * foreign keys, from `information_schema`. Four queries, whatever the size.
 */
export async function readMysql(connection: Connection, options: ReadOptions = {}): Promise<Schema> {
  const isExcluded = excluder(options.exclude);
  const db = await mysql.createConnection({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ...(connection.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  try {
    const query = async (text: string) =>
      (await db.query<RowDataPacket[]>(text, [connection.database]))[0];
    const [tableRows, columnRows, keyRows, indexRows] = await Promise.all([
      query(`SELECT TABLE_NAME AS name FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`),
      query(`SELECT TABLE_NAME AS tbl, COLUMN_NAME AS name, COLUMN_TYPE AS type, DATA_TYPE AS data,
                    IS_NULLABLE = 'YES' AS nullable
             FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY ORDINAL_POSITION`),
      query(`SELECT k.TABLE_NAME AS tbl, k.CONSTRAINT_NAME AS name, c.CONSTRAINT_TYPE AS kind,
                    k.COLUMN_NAME AS col, k.REFERENCED_TABLE_SCHEMA AS refSchema,
                    k.REFERENCED_TABLE_NAME AS refTable, k.REFERENCED_COLUMN_NAME AS refCol
             FROM information_schema.KEY_COLUMN_USAGE k
             JOIN information_schema.TABLE_CONSTRAINTS c
               ON c.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND c.TABLE_NAME = k.TABLE_NAME
              AND c.CONSTRAINT_NAME = k.CONSTRAINT_NAME
             WHERE k.TABLE_SCHEMA = ? AND c.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY')
             ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`),
      query(`SELECT TABLE_NAME AS tbl, INDEX_NAME AS name, NON_UNIQUE = 0 AS isUnique,
                    COLUMN_NAME AS col
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND INDEX_NAME <> 'PRIMARY'
             ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`),
    ]);

    const tables = new Map<string, Table>();
    for (const { name } of tableRows) {
      if (isExcluded(name, `${connection.database}.${name}`)) continue;
      tables.set(name, { name, columns: [], primaryKey: [], indexes: [], foreignKeys: [] });
    }
    for (const row of columnRows) {
      const column: Column = { name: row.name, type: row.type, nullable: row.nullable === 1 };
      if (row.data === "enum" || row.data === "set") {
        column.type = row.data;
        column.values = enumValues(row.type);
      }
      tables.get(row.tbl)?.columns.push(column);
    }
    // Rows of one constraint or index are consecutive, in column order.
    let last = "";
    for (const row of keyRows) {
      const table = tables.get(row.tbl);
      if (!table) continue;
      if (row.kind === "PRIMARY KEY") {
        table.primaryKey.push(row.col);
        continue;
      }
      if (row.refSchema !== connection.database || !tables.has(row.refTable)) continue;
      const key = `${row.tbl}.${row.name}`;
      if (key !== last) table.foreignKeys.push({ columns: [], references: { table: row.refTable, columns: [] } });
      last = key;
      const fk = table.foreignKeys.at(-1) as Table["foreignKeys"][number];
      fk.columns.push(row.col);
      fk.references.columns.push(row.refCol);
    }
    const functional = new Set<string>();
    last = "";
    for (const row of indexRows) {
      const table = tables.get(row.tbl);
      if (!table) continue;
      const key = `${row.tbl}.${row.name}`;
      // A functional index has no column name for its expressions: no column to show.
      if (row.col === null) functional.add(key);
      if (key !== last) table.indexes.push({ name: row.name, columns: [], unique: row.isUnique === 1 });
      last = key;
      table.indexes.at(-1)?.columns.push(row.col);
    }
    for (const table of tables.values()) {
      table.indexes = table.indexes.filter((index) => !functional.has(`${table.name}.${index.name}`));
      table.foreignKeys.sort((a, b) => position(table, a.columns[0]) - position(table, b.columns[0]));
    }
    return { tables: [...tables.values()] };
  } finally {
    await db.end();
  }
}

const position = (table: Table, column: string | undefined) =>
  table.columns.findIndex((candidate) => candidate.name === column);
