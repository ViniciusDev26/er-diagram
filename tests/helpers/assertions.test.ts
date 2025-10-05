import { describe, test, expect } from "bun:test";
import type { DatabaseSchema } from "../../src/types/database-adapter";
import {
  assertSchemaHasBasicStructure,
  assertTableExists,
  assertEnumExists,
  assertColumnExists,
  assertColumnIsPrimaryKey,
  assertColumnIsForeignKey,
  assertRelationshipExists,
  assertMermaidDiagramValid,
  assertMermaidContainsTable,
  assertMermaidContainsEnum,
} from "../helpers/assertions";

const mockSchema: DatabaseSchema = {
  enums: [
    {
      name: "status_enum",
      values: ["active", "inactive"],
    },
    {
      name: "role_enum",
      values: ["admin", "user"],
    },
  ],
  tables: [
    {
      name: "users",
      columns: [
        {
          name: "id",
          type: "integer",
          isPrimaryKey: true,
          isForeignKey: false,
          isUnique: false,
        },
        {
          name: "email",
          type: "varchar",
          isPrimaryKey: false,
          isForeignKey: false,
          isUnique: true,
        },
        {
          name: "role_id",
          type: "integer",
          isPrimaryKey: false,
          isForeignKey: true,
          isUnique: false,
        },
      ],
    },
    {
      name: "posts",
      columns: [
        {
          name: "id",
          type: "integer",
          isPrimaryKey: true,
          isForeignKey: false,
          isUnique: false,
        },
        {
          name: "user_id",
          type: "integer",
          isPrimaryKey: false,
          isForeignKey: true,
          isUnique: false,
        },
      ],
    },
  ],
  relationships: [
    {
      fromTable: "users",
      toTable: "posts",
      type: "identifying",
    },
  ],
  enumRelationships: [
    {
      table: "users",
      enumType: "status_enum",
    },
  ],
};

const validMermaidDiagram = `erDiagram
    users {
        id integer PK
        name varchar
    }

    posts {
        id integer PK
        user_id integer FK
    }

    "status_enum (ENUM)" {
        active string
        inactive string
    }

    users ||--o{ posts : "has"
`;

describe("Assertions - assertSchemaHasBasicStructure", () => {
  test("should pass for valid schema", () => {
    expect(() => assertSchemaHasBasicStructure(mockSchema)).not.toThrow();
  });

  test("should throw error when no tables", () => {
    const schema = { ...mockSchema, tables: [] };
    expect(() => assertSchemaHasBasicStructure(schema)).toThrow("Schema should have tables");
  });

  test("should throw error when no enums", () => {
    const schema = { ...mockSchema, enums: [] };
    expect(() => assertSchemaHasBasicStructure(schema)).toThrow("Schema should have enums");
  });

  test("should throw error when no relationships", () => {
    const schema = { ...mockSchema, relationships: [] };
    expect(() => assertSchemaHasBasicStructure(schema)).toThrow("Schema should have relationships");
  });
});

describe("Assertions - assertTableExists", () => {
  test("should return table when it exists", () => {
    const table = assertTableExists(mockSchema, "users");
    expect(table).toBeDefined();
    expect(table.name).toBe("users");
  });

  test("should throw error when table does not exist", () => {
    expect(() => assertTableExists(mockSchema, "nonexistent")).toThrow(
      "Table nonexistent not found in schema"
    );
  });
});

describe("Assertions - assertEnumExists", () => {
  test("should return enum when it exists", () => {
    const enumType = assertEnumExists(mockSchema, "status_enum");
    expect(enumType).toBeDefined();
    expect(enumType.name).toBe("status_enum");
  });

  test("should find enum by partial name", () => {
    const enumType = assertEnumExists(mockSchema, "status");
    expect(enumType).toBeDefined();
    expect(enumType.name).toContain("status");
  });

  test("should throw error when enum does not exist", () => {
    expect(() => assertEnumExists(mockSchema, "nonexistent")).toThrow(
      "Enum nonexistent not found in schema"
    );
  });
});

describe("Assertions - assertColumnExists", () => {
  test("should return column when it exists", () => {
    const column = assertColumnExists(mockSchema, "users", "id");
    expect(column).toBeDefined();
    expect(column.name).toBe("id");
  });

  test("should throw error when table does not exist", () => {
    expect(() => assertColumnExists(mockSchema, "nonexistent", "id")).toThrow(
      "Table nonexistent not found in schema"
    );
  });

  test("should throw error when column does not exist", () => {
    expect(() => assertColumnExists(mockSchema, "users", "nonexistent")).toThrow(
      "Column nonexistent not found in table users"
    );
  });
});

describe("Assertions - assertColumnIsPrimaryKey", () => {
  test("should pass when column is primary key", () => {
    expect(() => assertColumnIsPrimaryKey(mockSchema, "users", "id")).not.toThrow();
  });

  test("should throw error when column is not primary key", () => {
    expect(() => assertColumnIsPrimaryKey(mockSchema, "users", "email")).toThrow(
      "Column email in users is not a primary key"
    );
  });

  test("should throw error when table does not exist", () => {
    expect(() => assertColumnIsPrimaryKey(mockSchema, "nonexistent", "id")).toThrow(
      "Table nonexistent not found in schema"
    );
  });
});

describe("Assertions - assertColumnIsForeignKey", () => {
  test("should pass when column is foreign key", () => {
    expect(() => assertColumnIsForeignKey(mockSchema, "users", "role_id")).not.toThrow();
  });

  test("should throw error when column is not foreign key", () => {
    expect(() => assertColumnIsForeignKey(mockSchema, "users", "email")).toThrow(
      "Column email in users is not a foreign key"
    );
  });

  test("should throw error when table does not exist", () => {
    expect(() => assertColumnIsForeignKey(mockSchema, "nonexistent", "id")).toThrow(
      "Table nonexistent not found in schema"
    );
  });
});

describe("Assertions - assertRelationshipExists", () => {
  test("should return relationship when it exists", () => {
    const rel = assertRelationshipExists(mockSchema, "users", "posts");
    expect(rel).toBeDefined();
    expect(rel.fromTable).toBe("users");
    expect(rel.toTable).toBe("posts");
  });

  test("should throw error when relationship does not exist", () => {
    expect(() => assertRelationshipExists(mockSchema, "posts", "users")).toThrow(
      "Relationship from posts to users not found"
    );
  });
});

describe("Assertions - assertMermaidDiagramValid", () => {
  test("should pass for valid diagram", () => {
    expect(() => assertMermaidDiagramValid(validMermaidDiagram)).not.toThrow();
  });

  test("should throw error when diagram does not start with erDiagram", () => {
    expect(() => assertMermaidDiagramValid("invalid diagram")).toThrow(
      "Diagram should start with 'erDiagram'"
    );
  });

  test("should throw error when diagram is too short", () => {
    expect(() => assertMermaidDiagramValid("erDiagram")).toThrow(
      "Diagram seems too short to be valid"
    );
  });
});

describe("Assertions - assertMermaidContainsTable", () => {
  test("should pass when diagram contains table", () => {
    expect(() => assertMermaidContainsTable(validMermaidDiagram, "users")).not.toThrow();
  });

  test("should throw error when diagram does not contain table", () => {
    expect(() => assertMermaidContainsTable(validMermaidDiagram, "nonexistent")).toThrow(
      "Diagram should contain table nonexistent"
    );
  });
});

describe("Assertions - assertMermaidContainsEnum", () => {
  test("should pass when diagram contains enum", () => {
    expect(() => assertMermaidContainsEnum(validMermaidDiagram, "status_enum (ENUM)")).not.toThrow();
  });

  test("should throw error when diagram does not contain enum", () => {
    expect(() => assertMermaidContainsEnum(validMermaidDiagram, "nonexistent (ENUM)")).toThrow(
      "Diagram should contain enum nonexistent (ENUM)"
    );
  });
});

describe("Assertions - Edge Cases", () => {
  test("assertTableExists should work with special characters in table name", () => {
    const schema: DatabaseSchema = {
      ...mockSchema,
      tables: [{ name: "users_archive", columns: [] }],
    };
    expect(() => assertTableExists(schema, "users_archive")).not.toThrow();
  });

  test("assertColumnExists should handle columns with same name in different tables", () => {
    const id1 = assertColumnExists(mockSchema, "users", "id");
    const id2 = assertColumnExists(mockSchema, "posts", "id");

    expect(id1.name).toBe("id");
    expect(id2.name).toBe("id");
  });

  test("assertEnumExists should be case-sensitive", () => {
    expect(() => assertEnumExists(mockSchema, "STATUS_ENUM")).toThrow();
  });

  test("assertMermaidDiagramValid should accept diagrams with varying whitespace", () => {
    const diagram = "erDiagram\n\n\n    users {\n        id integer\n    }\n\n";
    expect(() => assertMermaidDiagramValid(diagram)).not.toThrow();
  });
});
