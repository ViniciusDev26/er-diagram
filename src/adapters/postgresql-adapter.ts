import postgres, { type Sql } from "postgres";
import type {
  DatabaseAdapter,
  DatabaseSchema,
  EnumType,
  Table,
  Column,
  Relationship,
  EnumRelationship,
  Index,
} from "../types/database-adapter";

export interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export class PostgreSQLAdapter implements DatabaseAdapter {
  private sql!: Sql;

  constructor(private config: PostgreSQLConfig) {}

  async connect(): Promise<void> {
    this.sql = postgres({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      username: this.config.username,
      password: this.config.password,
    });
  }

  async disconnect(): Promise<void> {
    if (this.sql) {
      await this.sql.end();
    }
  }

  async getSchema(excludedTables: string[], showIndexes = false): Promise<DatabaseSchema> {
    const enums = await this.getEnums();
    const tables = await this.getTables(excludedTables, showIndexes);
    const relationships = await this.getRelationships(excludedTables);
    const enumRelationships = await this.getEnumRelationships(excludedTables);

    return {
      enums,
      tables,
      relationships,
      enumRelationships,
    };
  }

  private async getEnums(): Promise<EnumType[]> {
    const enumRows = await this.sql<{ enum_name: string }[]>`
      SELECT t.typname AS enum_name
      FROM pg_type t
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
      ORDER BY t.typname;
    `;

    const enums: EnumType[] = [];

    for (const { enum_name } of enumRows) {
      const valueRows = await this.sql<{ enumlabel: string }[]>`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = ${enum_name}
        ORDER BY e.enumsortorder;
      `;

      enums.push({
        name: enum_name,
        values: valueRows.map((row) => row.enumlabel),
      });
    }

    return enums;
  }

  private async getTables(excludedTables: string[], showIndexes = false): Promise<Table[]> {
    const tableRows = await this.sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT IN ${this.sql(excludedTables)}
      ORDER BY tablename;
    `;

    const tables: Table[] = [];

    for (const { tablename } of tableRows) {
      const columns = await this.getColumns(tablename);
      const table: Table = {
        name: tablename,
        columns,
      };

      if (showIndexes) {
        table.indexes = await this.getIndexes(tablename);
      }

      tables.push(table);
    }

    return tables;
  }

  private async getColumns(tableName: string): Promise<Column[]> {
    const columnRows = await this.sql<{
      column_name: string;
      full_type: string;
    }[]>`
      SELECT
        column_name,
        CASE
          WHEN data_type = 'character varying' THEN 'varchar(' || COALESCE(character_maximum_length::text, '') || ')'
          WHEN data_type = 'numeric' AND numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL AND numeric_scale > 0
            THEN 'numeric(' || numeric_precision || ',' || numeric_scale || ')'
          WHEN data_type = 'numeric' AND numeric_precision IS NOT NULL
            THEN 'numeric(' || numeric_precision || ')'
          WHEN data_type = 'numeric' THEN 'numeric'
          WHEN data_type = 'integer' THEN 'integer'
          WHEN data_type = 'USER-DEFINED' THEN udt_name
          ELSE data_type
        END as full_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY ordinal_position;
    `;

    const columns: Column[] = [];

    for (const { column_name, full_type } of columnRows) {
      const isPrimaryKey = await this.isPrimaryKey(tableName, column_name);
      const isForeignKey = await this.isForeignKey(tableName, column_name);
      const isUnique = await this.isUnique(tableName, column_name);

      columns.push({
        name: column_name,
        type: full_type,
        isPrimaryKey,
        isForeignKey,
        isUnique,
      });
    }

    return columns;
  }

  private async isPrimaryKey(tableName: string, columnName: string): Promise<boolean> {
    const result = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = ${'public.' + tableName}::regclass
          AND i.indisprimary
          AND a.attname = ${columnName}
      );
    `;

    return result[0].exists;
  }

  private async isForeignKey(tableName: string, columnName: string): Promise<boolean> {
    const result = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = ${tableName}
          AND kcu.column_name = ${columnName}
      );
    `;

    return result[0].exists;
  }

  private async isUnique(tableName: string, columnName: string): Promise<boolean> {
    const result = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = 'public'
          AND tc.table_name = ${tableName}
          AND kcu.column_name = ${columnName}
      );
    `;

    return result[0].exists;
  }

  private async getRelationships(excludedTables: string[]): Promise<Relationship[]> {
    const fkRows = await this.sql<{
      table_name: string;
      foreign_table_name: string;
      delete_rule: string;
    }[]>`
      SELECT DISTINCT
        tc.table_name,
        ccu.table_name AS foreign_table_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name NOT IN ${this.sql(excludedTables)}
      ORDER BY tc.table_name;
    `;

    return fkRows.map((row) => ({
      fromTable: row.foreign_table_name,
      toTable: row.table_name,
      type: row.delete_rule === "CASCADE" ? "identifying" : "non-identifying",
    }));
  }

  private async getEnumRelationships(excludedTables: string[]): Promise<EnumRelationship[]> {
    const tableRows = await this.sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT IN ${this.sql(excludedTables)}
      ORDER BY tablename;
    `;

    const enumRelationships: EnumRelationship[] = [];

    for (const { tablename } of tableRows) {
      const enumColumns = await this.sql<{
        column_name: string;
        enum_type: string;
      }[]>`
        SELECT
          c.column_name,
          c.udt_name as enum_type
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = ${tablename}
          AND c.data_type = 'USER-DEFINED'
        ORDER BY c.ordinal_position;
      `;

      for (const { enum_type } of enumColumns) {
        enumRelationships.push({
          table: tablename,
          enumType: enum_type,
        });
      }
    }

    return enumRelationships;
  }

  private async getIndexes(tableName: string): Promise<Index[]> {
    const indexRows = await this.sql<{
      index_name: string;
      column_names: string;
      is_unique: boolean;
    }[]>`
      SELECT
        i.relname AS index_name,
        STRING_AGG(a.attname, ',' ORDER BY array_position(ix.indkey, a.attnum)) AS column_names,
        ix.indisunique AS is_unique
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE t.relname = ${tableName}
        AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND NOT ix.indisprimary
      GROUP BY i.relname, ix.indisunique
      ORDER BY i.relname;
    `;

    return indexRows.map((row) => ({
      name: row.index_name,
      columns: row.column_names.split(','),
      isUnique: row.is_unique,
    }));
  }
}
