export interface EnumType {
  name: string;
  values: string[];
}

export interface Column {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  isIndexed?: boolean;
}

export interface Index {
  name: string;
  columns: string[];
  isUnique: boolean;
}

export interface Table {
  name: string;
  columns: Column[];
  indexes?: Index[];
}

export interface Relationship {
  fromTable: string;
  toTable: string;
  type: "identifying" | "non-identifying";
}

export interface EnumRelationship {
  table: string;
  enumType: string;
}

export interface DatabaseSchema {
  enums: EnumType[];
  tables: Table[];
  relationships: Relationship[];
  enumRelationships: EnumRelationship[];
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getSchema(excludedTables: string[], showIndexes?: boolean): Promise<DatabaseSchema>;
}
