import mysql, { type RowDataPacket, type SslOptions } from "mysql2/promise";
import type { Connection, ReadOptions } from "./connection.ts";
import { tableFilter } from "./exclude.ts";
import type { Column, ForeignKey, Index, Schema, Table } from "./schema.ts";

/** The values of `enum('a','it''s')` or `set(...)`, as MySQL quotes them. */
export function enumValues(columnType: string): string[] {
  const list = columnType.slice(columnType.indexOf("(") + 1, columnType.lastIndexOf(")"));
  return [...list.matchAll(/'((?:[^'\\]|''|\\.)*)'/g)].map(([, value]) =>
    (value as string).replaceAll("''", "'").replace(/\\(.)/g, "$1"),
  );
}

/** `int(11)` is `int`: the display width (MariaDB, MySQL 5) says nothing about the column. */
const shortType = (type: string) => type.replace(/^((?:tiny|small|medium|big)?int)\(\d+\)/, "$1");

function ssl(connection: Connection): SslOptions | undefined {
  if (connection.ssl === undefined) return undefined;
  if (connection.ssl === "require") return { rejectUnauthorized: false };
  return {
    rejectUnauthorized: true,
    verifyIdentity: connection.ssl === "verify-full",
    ...(connection.ca ? { ca: connection.ca } : {}),
  };
}

/**
 * The schema of MySQL or MariaDB databases: their base tables with their columns, primary keys,
 * indexes and foreign keys, from `information_schema`. Four queries, whatever the size.
 */
export async function readMysql(
  connection: Connection,
  options: ReadOptions = {},
): Promise<Schema> {
  const databases = options.schemas ?? [connection.database];
  const qualify = databases.length > 1;
  const isDrawn = tableFilter(options.include, options.exclude);
  const tls = ssl(connection);
  const db = await mysql.createConnection({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ...(tls ? { ssl: tls } : {}),
  });
  try {
    const query = async (text: string) => (await db.query<RowDataPacket[]>(text, [databases]))[0];
    const [tableRows, columnRows, keyRows, indexRows] = await Promise.all([
      query(`SELECT TABLE_SCHEMA AS db, TABLE_NAME AS name FROM information_schema.TABLES
             WHERE TABLE_SCHEMA IN (?) AND TABLE_TYPE = 'BASE TABLE'`),
      query(`SELECT TABLE_SCHEMA AS db, TABLE_NAME AS tbl, COLUMN_NAME AS name,
                    COLUMN_TYPE AS type, DATA_TYPE AS data, IS_NULLABLE = 'YES' AS nullable,
                    COLUMN_COMMENT AS comment
             FROM information_schema.COLUMNS WHERE TABLE_SCHEMA IN (?)
             ORDER BY ORDINAL_POSITION`),
      query(`SELECT k.TABLE_SCHEMA AS db, k.TABLE_NAME AS tbl, k.CONSTRAINT_NAME AS name,
                    c.CONSTRAINT_TYPE AS kind, k.COLUMN_NAME AS col,
                    k.REFERENCED_TABLE_SCHEMA AS refDb, k.REFERENCED_TABLE_NAME AS refTable,
                    k.REFERENCED_COLUMN_NAME AS refCol
             FROM information_schema.KEY_COLUMN_USAGE k
             JOIN information_schema.TABLE_CONSTRAINTS c
               ON c.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND c.TABLE_NAME = k.TABLE_NAME
              AND c.CONSTRAINT_NAME = k.CONSTRAINT_NAME
             WHERE k.TABLE_SCHEMA IN (?) AND c.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY')
             ORDER BY k.TABLE_SCHEMA, k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`),
      query(`SELECT TABLE_SCHEMA AS db, TABLE_NAME AS tbl, INDEX_NAME AS name,
                    NON_UNIQUE = 0 AS isUnique, COLUMN_NAME AS col
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA IN (?) AND INDEX_NAME <> 'PRIMARY'
             ORDER BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`),
    ]);

    const name = (db: string, table: string) => (qualify ? `${db}.${table}` : table);
    const tables = new Map<string, Table>();
    for (const row of tableRows) {
      if (!isDrawn(row.name, `${row.db}.${row.name}`)) continue;
      tables.set(`${row.db}.${row.name}`, {
        name: name(row.db, row.name),
        columns: [],
        primaryKey: [],
        indexes: [],
        foreignKeys: [],
      });
    }
    for (const row of columnRows) {
      const column: Column = {
        name: row.name,
        type: shortType(row.type),
        nullable: row.nullable === 1,
      };
      if (row.data === "enum" || row.data === "set") {
        column.type = row.data;
        column.values = enumValues(row.type);
      }
      if (row.comment) column.comment = row.comment;
      tables.get(`${row.db}.${row.tbl}`)?.columns.push(column);
    }
    // Rows of one constraint or index are consecutive, in column order.
    let last = "";
    for (const row of keyRows) {
      const table = tables.get(`${row.db}.${row.tbl}`);
      if (!table) continue;
      if (row.kind === "PRIMARY KEY") {
        table.primaryKey.push(row.col);
        continue;
      }
      const key = `${row.db}.${row.tbl}.${row.name}`;
      if (key !== last) {
        const referenced = `${row.refDb}.${row.refTable}`;
        const references = tables.has(referenced) ? name(row.refDb, row.refTable) : referenced;
        table.foreignKeys.push({ columns: [], references: { table: references, columns: [] } });
      }
      last = key;
      const fk = table.foreignKeys.at(-1) as ForeignKey;
      fk.columns.push(row.col);
      fk.references.columns.push(row.refCol);
    }
    const functional = new Set<Index>();
    last = "";
    for (const row of indexRows) {
      const table = tables.get(`${row.db}.${row.tbl}`);
      if (!table) continue;
      const key = `${row.db}.${row.tbl}.${row.name}`;
      if (key !== last)
        table.indexes.push({ name: row.name, columns: [], unique: row.isUnique === 1 });
      last = key;
      const index = table.indexes.at(-1) as Index;
      // A functional index has no column name for its expressions: no column to show.
      if (row.col === null) functional.add(index);
      index.columns.push(row.col);
    }
    for (const table of tables.values()) {
      table.indexes = table.indexes.filter((index) => !functional.has(index));
      table.foreignKeys.sort(
        (a, b) => position(table, a.columns[0]) - position(table, b.columns[0]),
      );
    }
    return { tables: [...tables.values()].sort((a, b) => (a.name < b.name ? -1 : 1)) };
  } finally {
    await db.end();
  }
}

const position = (table: Table, column: string | undefined) =>
  table.columns.findIndex((candidate) => candidate.name === column);
