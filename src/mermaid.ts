import type { Column, ForeignKey, Schema, Table } from "./schema.ts";

export interface RenderOptions {
  /** Write each index as a comment on its first column. */
  indexes?: boolean;
}

/** A word Mermaid reads as an entity, attribute or label without quotes. */
const WORD = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** What Mermaid accepts in an attribute's type or name: anything else becomes `_`. */
function attributeWord(text: string): string {
  const word = text.replace(/[^A-Za-z0-9_()[\]-]/g, "_");
  return /^[A-Za-z_*]/.test(word) ? word : `_${word}`;
}

const quoted = (text: string) => `"${text.replaceAll('"', "'")}"`;

/**
 * The Mermaid id of each table. A name Mermaid cannot read is written as an id with the name as
 * its alias (`billing_invoices["billing.invoices"]`); ids never collide with each other.
 */
function entityIds(tables: Table[]): Map<string, string> {
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  for (const { name } of tables) {
    if (WORD.test(name)) {
      ids.set(name, name);
      taken.add(name);
    }
  }
  for (const { name } of tables) {
    if (ids.has(name)) continue;
    const base = name.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^(?=[^A-Za-z_])/, "_");
    let id = base;
    for (let suffix = 2; taken.has(id); suffix++) id = `${base}_${suffix}`;
    ids.set(name, id);
    taken.add(id);
  }
  return ids;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

function keys(table: Table, column: Column): string[] {
  const found: string[] = [];
  if (table.primaryKey.includes(column.name)) found.push("PK");
  if (table.foreignKeys.some((fk) => fk.columns.includes(column.name))) found.push("FK");
  if (table.indexes.some((index) => index.unique && sameSet(index.columns, [column.name]))) {
    found.push("UK");
  }
  return found;
}

function comment(table: Table, column: Column, options: RenderOptions): string[] {
  const parts: string[] = [];
  if (column.values) parts.push(column.values.join(", "));
  if (options.indexes) {
    for (const index of table.indexes) {
      if (index.columns[0] !== column.name) continue;
      if (index.columns.length === 1) {
        // A unique index on one column is already the column's UK.
        if (!index.unique) parts.push(`index ${index.name}`);
      } else {
        const kind = index.unique ? "unique" : "index";
        parts.push(`${kind} ${index.name} (${index.columns.join(", ")})`);
      }
    }
  }
  return parts;
}

function attribute(table: Table, column: Column, options: RenderOptions): string {
  const words = [attributeWord(column.type), attributeWord(column.name)];
  const found = keys(table, column);
  if (found.length > 0) words.push(found.join(", "));
  const parts = comment(table, column, options);
  if (parts.length > 0) words.push(quoted(parts.join("; ")));
  return `        ${words.join(" ")}`;
}

/**
 * The cardinality of a foreign key, read from the child's columns: a nullable key is an optional
 * parent; a key that is unique (the primary key, or a unique index) is one child at most; a key
 * inside the primary key identifies the child (a solid line).
 */
function relationship(table: Table, fk: ForeignKey, ids: Map<string, string>): string {
  const columns = table.columns.filter((column) => fk.columns.includes(column.name));
  const parent = columns.some((column) => column.nullable) ? "|o" : "||";
  const unique =
    sameSet(fk.columns, table.primaryKey) ||
    table.indexes.some((index) => index.unique && sameSet(index.columns, fk.columns));
  const child = unique ? "o|" : "o{";
  const line = fk.columns.every((name) => table.primaryKey.includes(name)) ? "--" : "..";
  const label = fk.columns.join(", ");
  const from = ids.get(fk.references.table);
  const to = ids.get(table.name);
  return `    ${from} ${parent}${line}${child} ${to} : ${WORD.test(label) ? label : quoted(label)}`;
}

/** The Mermaid `erDiagram` of a schema: its tables by name, then their relationships. */
export function render(schema: Schema, options: RenderOptions = {}): string {
  const tables = [...schema.tables].sort((a, b) => (a.name < b.name ? -1 : 1));
  const ids = entityIds(tables);
  const lines = ["erDiagram"];
  for (const table of tables) {
    const id = ids.get(table.name);
    lines.push(`    ${id === table.name ? id : `${id}[${quoted(table.name)}]`} {`);
    for (const column of table.columns) lines.push(attribute(table, column, options));
    lines.push("    }");
  }
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      if (ids.has(fk.references.table)) lines.push(relationship(table, fk, ids));
    }
  }
  return `${lines.join("\n")}\n`;
}
