import postgres from "postgres";
import type { Connection, ReadOptions } from "./connection.ts";
import { excluder } from "./exclude.ts";
import type { ForeignKey, Index, Schema, Table } from "./schema.ts";

/** PostgreSQL's long type names, as people write them. */
const SHORT_TYPES: [RegExp, string][] = [
  [/^character varying/, "varchar"],
  [/^character/, "char"],
  [/^bit varying/, "varbit"],
  [/^double precision/, "double"],
  [/^timestamp\b(.*) with time zone/, "timestamptz$1"],
  [/^timestamp\b(.*) without time zone/, "timestamp$1"],
  [/^time\b(.*) with time zone/, "timetz$1"],
  [/^time\b(.*) without time zone/, "time$1"],
];

const shortType = (type: string) =>
  SHORT_TYPES.reduce((short, [pattern, replacement]) => short.replace(pattern, replacement), type);

interface TableRow {
  oid: string;
  schema: string;
  name: string;
}
interface ColumnRow {
  table: string;
  position: number;
  name: string;
  type: string;
  nullable: boolean;
  values: string[] | null;
}
interface ConstraintRow {
  table: string;
  kind: "p" | "f";
  columns: number[];
  references: string | null;
  referenced: number[] | null;
}
interface IndexRow {
  table: string;
  name: string;
  unique: boolean;
  columns: number[];
}

/**
 * The schema of a PostgreSQL database: its tables (partitioned ones once, views never) with their
 * columns, primary keys, indexes and foreign keys. Four queries, whatever the size.
 */
export async function readPostgres(connection: Connection, options: ReadOptions = {}): Promise<Schema> {
  const schemas = options.schemas ?? ["public"];
  const qualify = schemas.length > 1;
  const isExcluded = excluder(options.exclude);
  const sql = postgres({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.user,
    password: connection.password,
    max: 1,
    onnotice: () => {},
  });
  try {
    const tableRows = await sql<TableRow[]>`
      SELECT c.oid::text AS oid, n.nspname AS schema, c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition AND n.nspname = ANY(${schemas})`;
    const tables = tableRows.filter((row) => !isExcluded(row.name, `${row.schema}.${row.name}`));
    const oids = tables.map((row) => row.oid);
    const [columnRows, constraintRows, indexRows] = await Promise.all([
      sql<ColumnRow[]>`
        SELECT a.attrelid::text AS table, a.attnum AS position, a.attname AS name,
               format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
               (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
                FROM pg_enum e WHERE e.enumtypid = a.atttypid) AS values
        FROM pg_attribute a
        WHERE a.attrelid::text = ANY(${oids}) AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      sql<ConstraintRow[]>`
        SELECT conrelid::text AS table, contype AS kind, conkey AS columns,
               confrelid::text AS references, confkey AS referenced
        FROM pg_constraint
        WHERE conrelid::text = ANY(${oids}) AND contype IN ('p', 'f')
        ORDER BY conkey[1], conname`,
      sql<IndexRow[]>`
        SELECT i.indrelid::text AS table, c.relname AS name, i.indisunique AS unique,
               i.indkey::int2[] AS columns
        FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE i.indrelid::text = ANY(${oids}) AND NOT i.indisprimary
        ORDER BY c.relname`,
    ]);

    const names = new Map(tables.map((row) => [row.oid, qualify ? `${row.schema}.${row.name}` : row.name]));
    // Column names by table and position, for the keys, which PostgreSQL stores as positions.
    const positions = new Map<string, Map<number, string>>();
    const byOid = new Map<string, Table>();
    for (const row of tables) {
      byOid.set(row.oid, {
        name: names.get(row.oid) as string,
        columns: [],
        primaryKey: [],
        indexes: [],
        foreignKeys: [],
      });
      positions.set(row.oid, new Map());
    }
    for (const row of columnRows) {
      const column = { name: row.name, type: shortType(row.type), nullable: row.nullable };
      byOid.get(row.table)?.columns.push(row.values ? { ...column, values: row.values } : column);
      positions.get(row.table)?.set(row.position, row.name);
    }
    const named = (table: string, columns: number[]) =>
      columns.map((position) => positions.get(table)?.get(position) as string);
    for (const row of constraintRows) {
      const table = byOid.get(row.table) as Table;
      if (row.kind === "p") {
        table.primaryKey = named(row.table, row.columns);
        continue;
      }
      const references = names.get(row.references as string);
      if (references === undefined) continue;
      const fk: ForeignKey = {
        columns: named(row.table, row.columns),
        references: { table: references, columns: named(row.references as string, row.referenced as number[]) },
      };
      table.foreignKeys.push(fk);
    }
    for (const row of indexRows) {
      // An expression index has position 0 for its expressions: no column to show.
      if (row.columns.includes(0)) continue;
      const index: Index = { name: row.name, columns: named(row.table, row.columns), unique: row.unique };
      byOid.get(row.table)?.indexes.push(index);
    }
    return { tables: [...byOid.values()].sort((a, b) => (a.name < b.name ? -1 : 1)) };
  } finally {
    await sql.end();
  }
}
