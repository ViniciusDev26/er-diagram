/** What a database is made of, as the diagram needs it: read from PostgreSQL or MySQL. */

export interface Column {
  name: string;
  /** The type as the database writes it, e.g. `varchar(255)` or `numeric(10,2)`. */
  type: string;
  nullable: boolean;
  /** The values of an enum column. */
  values?: string[];
  /** The column's comment in the database (`COMMENT ON COLUMN`, `COMMENT '...'`). */
  comment?: string;
}

export interface Index {
  name: string;
  columns: string[];
  unique: boolean;
  /** Covers only some rows (`WHERE ...`): unique among them, so not a key of the table. */
  partial?: boolean;
}

export interface ForeignKey {
  columns: string[];
  /** The referenced table: qualified (`schema.table`) when it is not in the diagram. */
  references: { table: string; columns: string[] };
}

export interface Table {
  /** Qualified by its schema (`billing.invoices`) when the diagram covers more than one. */
  name: string;
  columns: Column[];
  primaryKey: string[];
  /** Every index but the primary key's, unique constraints included. */
  indexes: Index[];
  foreignKeys: ForeignKey[];
}

export interface Schema {
  tables: Table[];
}
