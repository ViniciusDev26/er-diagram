import type { DatabaseSchema } from "../../src/types/database-adapter";

export function assertSchemaHasBasicStructure(schema: DatabaseSchema) {
  // Check that we have tables
  if (schema.tables.length === 0) {
    throw new Error("Schema should have tables");
  }

  // Check that we have enums
  if (schema.enums.length === 0) {
    throw new Error("Schema should have enums");
  }

  // Check that we have relationships
  if (schema.relationships.length === 0) {
    throw new Error("Schema should have relationships");
  }
}

export function assertTableExists(schema: DatabaseSchema, tableName: string) {
  const table = schema.tables.find((t) => t.name === tableName);
  if (!table) {
    throw new Error(`Table ${tableName} not found in schema`);
  }
  return table;
}

export function assertEnumExists(schema: DatabaseSchema, enumName: string) {
  const enumType = schema.enums.find((e) => e.name.includes(enumName));
  if (!enumType) {
    throw new Error(`Enum ${enumName} not found in schema`);
  }
  return enumType;
}

export function assertColumnExists(
  schema: DatabaseSchema,
  tableName: string,
  columnName: string
) {
  const table = assertTableExists(schema, tableName);
  const column = table.columns.find((c) => c.name === columnName);
  if (!column) {
    throw new Error(`Column ${columnName} not found in table ${tableName}`);
  }
  return column;
}

export function assertColumnIsPrimaryKey(
  schema: DatabaseSchema,
  tableName: string,
  columnName: string
) {
  const column = assertColumnExists(schema, tableName, columnName);
  if (!column.isPrimaryKey) {
    throw new Error(`Column ${columnName} in ${tableName} is not a primary key`);
  }
}

export function assertColumnIsForeignKey(
  schema: DatabaseSchema,
  tableName: string,
  columnName: string
) {
  const column = assertColumnExists(schema, tableName, columnName);
  if (!column.isForeignKey) {
    throw new Error(`Column ${columnName} in ${tableName} is not a foreign key`);
  }
}

export function assertRelationshipExists(
  schema: DatabaseSchema,
  fromTable: string,
  toTable: string
) {
  const relationship = schema.relationships.find(
    (r) => r.fromTable === fromTable && r.toTable === toTable
  );
  if (!relationship) {
    throw new Error(`Relationship from ${fromTable} to ${toTable} not found`);
  }
  return relationship;
}

export function assertMermaidDiagramValid(diagram: string) {
  if (!diagram.startsWith("erDiagram")) {
    throw new Error("Diagram should start with 'erDiagram'");
  }

  if (diagram.length < 50) {
    throw new Error("Diagram seems too short to be valid");
  }
}

export function assertMermaidContainsTable(diagram: string, tableName: string) {
  if (!diagram.includes(tableName)) {
    throw new Error(`Diagram should contain table ${tableName}`);
  }
}

export function assertMermaidContainsEnum(diagram: string, enumName: string) {
  const enumPattern = `"${enumName}`;
  if (!diagram.includes(enumPattern)) {
    throw new Error(`Diagram should contain enum ${enumName}`);
  }
}
