/** What a database is made of, as the diagram needs it: read from PostgreSQL or MySQL. */

export interface Column {
  name: string;
  /** The type as the database writes it, e.g. `varchar(255)` or `numeric(10,2)`. */
  type: string;
  nullable: boolean;
  /** The values of an enum column. */
  values?: string[];
}

export interface Index {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ForeignKey {
  columns: string[];
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
