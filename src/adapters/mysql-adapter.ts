import mysql from "mysql2/promise";
import type { Connection } from "mysql2/promise";
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

export interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export class MySQLAdapter implements DatabaseAdapter {
  private connection!: Connection;

  constructor(private config: MySQLConfig) {}

  async connect(): Promise<void> {
    this.connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
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
    // MySQL doesn't have native ENUM types in the same way PostgreSQL does
    // But we can extract ENUM column definitions
    const [rows] = await this.connection.execute<any[]>(
      `
      SELECT DISTINCT
        COLUMN_TYPE as enum_definition,
        COLUMN_NAME as column_name,
        TABLE_NAME as table_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND DATA_TYPE = 'enum'
      ORDER BY COLUMN_TYPE
      `,
      [this.config.database]
    );

    const enumMap = new Map<string, Set<string>>();

    for (const row of rows) {
      const enumDef = row.enum_definition;
      // Extract values from enum('value1','value2',...)
      const match = enumDef.match(/enum\((.*)\)/i);
      if (match) {
        const values = match[1]
          .split(",")
          .map((v: string) => v.trim().replace(/^'|'$/g, ""));

        // Use the enum definition as the key to group same ENUMs
        const enumName = `${row.table_name}_${row.column_name}_enum`;
        if (!enumMap.has(enumName)) {
          enumMap.set(enumName, new Set(values));
        }
      }
    }

    const enums: EnumType[] = [];
    for (const [name, valuesSet] of enumMap) {
      enums.push({
        name,
        values: Array.from(valuesSet),
      });
    }

    return enums;
  }

  private async getTables(excludedTables: string[], showIndexes = false): Promise<Table[]> {
    const placeholders = excludedTables.map(() => "?").join(",");
    const query = excludedTables.length > 0
      ? `
        SELECT TABLE_NAME as table_name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_TYPE = 'BASE TABLE'
          AND TABLE_NAME NOT IN (${placeholders})
        ORDER BY TABLE_NAME
      `
      : `
        SELECT TABLE_NAME as table_name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `;

    const params = excludedTables.length > 0
      ? [this.config.database, ...excludedTables]
      : [this.config.database];

    const [rows] = await this.connection.execute<any[]>(query, params);

    const tables: Table[] = [];

    for (const row of rows) {
      const columns = await this.getColumns(row.table_name);
      const table: Table = {
        name: row.table_name,
        columns,
      };

      if (showIndexes) {
        table.indexes = await this.getIndexes(row.table_name);
      }

      tables.push(table);
    }

    return tables;
  }

  private async getColumns(tableName: string): Promise<Column[]> {
    const [rows] = await this.connection.execute<any[]>(
      `
      SELECT
        COLUMN_NAME as column_name,
        CASE
          WHEN DATA_TYPE = 'varchar' THEN CONCAT('varchar(', CHARACTER_MAXIMUM_LENGTH, ')')
          WHEN DATA_TYPE = 'char' THEN CONCAT('char(', CHARACTER_MAXIMUM_LENGTH, ')')
          WHEN DATA_TYPE = 'decimal' AND NUMERIC_SCALE > 0
            THEN CONCAT('decimal(', NUMERIC_PRECISION, ',', NUMERIC_SCALE, ')')
          WHEN DATA_TYPE = 'decimal'
            THEN CONCAT('decimal(', NUMERIC_PRECISION, ')')
          WHEN DATA_TYPE = 'enum' THEN COLUMN_TYPE
          ELSE DATA_TYPE
        END as full_type
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
      `,
      [this.config.database, tableName]
    );

    const columns: Column[] = [];

    for (const row of rows) {
      const isPrimaryKey = await this.isPrimaryKey(tableName, row.column_name);
      const isForeignKey = await this.isForeignKey(tableName, row.column_name);
      const isUnique = await this.isUnique(tableName, row.column_name);

      columns.push({
        name: row.column_name,
        type: row.full_type,
        isPrimaryKey,
        isForeignKey,
        isUnique,
      });
    }

    return columns;
  }

  private async isPrimaryKey(tableName: string, columnName: string): Promise<boolean> {
    const [rows] = await this.connection.execute<any[]>(
      `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND CONSTRAINT_NAME = 'PRIMARY'
      `,
      [this.config.database, tableName, columnName]
    );

    return rows[0].count > 0;
  }

  private async isForeignKey(tableName: string, columnName: string): Promise<boolean> {
    const [rows] = await this.connection.execute<any[]>(
      `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `,
      [this.config.database, tableName, columnName]
    );

    return rows[0].count > 0;
  }

  private async isUnique(tableName: string, columnName: string): Promise<boolean> {
    const [rows] = await this.connection.execute<any[]>(
      `
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND NON_UNIQUE = 0
        AND INDEX_NAME != 'PRIMARY'
      `,
      [this.config.database, tableName, columnName]
    );

    return rows[0].count > 0;
  }

  private async getRelationships(excludedTables: string[]): Promise<Relationship[]> {
    const placeholders = excludedTables.map(() => "?").join(",");
    const query = excludedTables.length > 0
      ? `
        SELECT DISTINCT
          kcu.TABLE_NAME as table_name,
          kcu.REFERENCED_TABLE_NAME as foreign_table_name,
          rc.DELETE_RULE as delete_rule
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
          ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
          AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ?
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
          AND kcu.TABLE_NAME NOT IN (${placeholders})
        ORDER BY kcu.TABLE_NAME
      `
      : `
        SELECT DISTINCT
          kcu.TABLE_NAME as table_name,
          kcu.REFERENCED_TABLE_NAME as foreign_table_name,
          rc.DELETE_RULE as delete_rule
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
          ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
          AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ?
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY kcu.TABLE_NAME
      `;

    const params = excludedTables.length > 0
      ? [this.config.database, ...excludedTables]
      : [this.config.database];

    const [rows] = await this.connection.execute<any[]>(query, params);

    return rows.map((row) => ({
      fromTable: row.foreign_table_name,
      toTable: row.table_name,
      type: row.delete_rule === "CASCADE" ? "identifying" : "non-identifying",
    }));
  }

  private async getEnumRelationships(excludedTables: string[]): Promise<EnumRelationship[]> {
    const placeholders = excludedTables.map(() => "?").join(",");
    const query = excludedTables.length > 0
      ? `
        SELECT
          TABLE_NAME as table_name,
          COLUMN_NAME as column_name
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND DATA_TYPE = 'enum'
          AND TABLE_NAME NOT IN (${placeholders})
        ORDER BY TABLE_NAME
      `
      : `
        SELECT
          TABLE_NAME as table_name,
          COLUMN_NAME as column_name
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND DATA_TYPE = 'enum'
        ORDER BY TABLE_NAME
      `;

    const params = excludedTables.length > 0
      ? [this.config.database, ...excludedTables]
      : [this.config.database];

    const [rows] = await this.connection.execute<any[]>(query, params);

    return rows.map((row) => ({
      table: row.table_name,
      enumType: `${row.table_name}_${row.column_name}_enum`,
    }));
  }

  private async getIndexes(tableName: string): Promise<Index[]> {
    const [rows] = await this.connection.execute<any[]>(
      `
      SELECT
        INDEX_NAME as index_name,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as column_names,
        CASE WHEN NON_UNIQUE = 0 THEN 1 ELSE 0 END as is_unique
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND INDEX_NAME != 'PRIMARY'
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME
      `,
      [this.config.database, tableName]
    );

    return rows.map((row) => ({
      name: row.index_name,
      columns: row.column_names.split(','),
      isUnique: row.is_unique === 1,
    }));
  }
}
