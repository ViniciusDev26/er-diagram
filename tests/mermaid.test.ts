import { describe, expect, test } from "vitest";
import { render } from "../src/mermaid.ts";
import type { Column, Table } from "../src/schema.ts";

const column = (name: string, type = "integer", extra: Partial<Column> = {}): Column => ({
  name,
  type,
  nullable: false,
  ...extra,
});

const table = (name: string, extra: Partial<Table> = {}): Table => ({
  name,
  columns: [column("id")],
  primaryKey: ["id"],
  indexes: [],
  foreignKeys: [],
  ...extra,
});

const lines = (diagram: string) => diagram.split("\n");

describe("render", () => {
  test("writes each attribute as type, then name, then its keys", () => {
    const users = table("users", {
      columns: [column("id"), column("email", "varchar(255)"), column("team_id")],
      indexes: [{ name: "users_email_key", columns: ["email"], unique: true }],
      foreignKeys: [{ columns: ["team_id"], references: { table: "teams", columns: ["id"] } }],
    });
    expect(render({ tables: [users, table("teams")] })).toBe(
      [
        "erDiagram",
        "    teams {",
        "        integer id PK",
        "    }",
        "    users {",
        "        integer id PK",
        "        varchar(255) email UK",
        "        integer team_id FK",
        "    }",
        "    teams ||..o{ users : team_id",
        "",
      ].join("\n"),
    );
  });

  test("a column can be several keys at once", () => {
    const profiles = table("profiles", {
      columns: [column("user_id")],
      primaryKey: ["user_id"],
      foreignKeys: [{ columns: ["user_id"], references: { table: "users", columns: ["id"] } }],
    });
    expect(render({ tables: [profiles, table("users")] })).toContain("integer user_id PK, FK");
  });

  test("a unique index on several columns marks none of them UK", () => {
    const reviews = table("reviews", {
      columns: [column("id"), column("product_id"), column("user_id")],
      indexes: [{ name: "reviews_once", columns: ["product_id", "user_id"], unique: true }],
    });
    expect(render({ tables: [reviews] })).not.toContain("UK");
  });

  describe("relationships", () => {
    const child = (fk: string[], extra: Partial<Table> = {}) =>
      table("child", {
        columns: [column("id"), column("a"), column("b")],
        foreignKeys: [{ columns: fk, references: { table: "parent", columns: ["id"] } }],
        ...extra,
      });
    const relationship = (child: Table) =>
      lines(render({ tables: [table("parent"), child] })).find((line) => line.includes(" : "));

    test("a required foreign key is exactly one parent for zero or more children", () => {
      expect(relationship(child(["a"]))).toBe("    parent ||..o{ child : a");
    });

    test("a nullable foreign key is zero or one parent", () => {
      const nullable = child(["a"], {
        columns: [column("id"), column("a", "integer", { nullable: true })],
      });
      expect(relationship(nullable)).toBe("    parent |o..o{ child : a");
    });

    test("a unique foreign key is zero or one child: one to one", () => {
      const unique = child(["a"], { indexes: [{ name: "one", columns: ["a"], unique: true }] });
      expect(relationship(unique)).toBe("    parent ||..o| child : a");
    });

    test("a foreign key that is the primary key is one to one and identifying", () => {
      expect(relationship(child(["id"]))).toBe("    parent ||--o| child : id");
    });

    test("a foreign key inside a composite primary key identifies the child", () => {
      expect(relationship(child(["a"], { primaryKey: ["a", "b"] }))).toBe(
        "    parent ||--o{ child : a",
      );
    });

    test("a non-unique index on the foreign key does not make it one to one", () => {
      const indexed = child(["a"], { indexes: [{ name: "by_a", columns: ["a"], unique: false }] });
      expect(relationship(indexed)).toBe("    parent ||..o{ child : a");
    });

    test("a composite foreign key names all its columns", () => {
      expect(relationship(child(["a", "b"]))).toBe('    parent ||..o{ child : "a, b"');
    });

    test("a foreign key to a table outside the diagram is left out", () => {
      expect(render({ tables: [child(["a"])] })).not.toContain(" : ");
    });

    test("a table can reference itself", () => {
      const tree = table("nodes", {
        columns: [column("id"), column("parent_id", "integer", { nullable: true })],
        foreignKeys: [{ columns: ["parent_id"], references: { table: "nodes", columns: ["id"] } }],
      });
      expect(render({ tables: [tree] })).toContain("    nodes |o..o{ nodes : parent_id");
    });
  });

  test("enum values are the attribute's comment", () => {
    const users = table("users", {
      columns: [column("status", "user_status", { values: ["active", 'say "hi"'] })],
    });
    expect(render({ tables: [users] })).toContain(
      "        user_status status \"active, say 'hi'\"",
    );
  });

  test("types and names keep only what Mermaid accepts", () => {
    const odd = table("odd", {
      columns: [
        column("price", "numeric(10,2)"),
        column("at", "timestamp with time zone"),
        column("tags", "text[]"),
        column("1st", "public.mood"),
        column("ação", "int unsigned"),
      ],
    });
    expect(lines(render({ tables: [odd] })).slice(2, 7)).toEqual([
      "        numeric(10_2) price",
      "        timestamp_with_time_zone at",
      "        text[] tags",
      "        public_mood _1st",
      "        int_unsigned a__o",
    ]);
  });

  test("a table name Mermaid cannot read gets an alias", () => {
    const tables = [
      table("billing.invoices", {
        foreignKeys: [{ columns: ["id"], references: { table: "my table", columns: ["id"] } }],
      }),
      table("my table"),
      table("my-table"),
    ];
    const diagram = render({ tables });
    expect(diagram).toContain('    billing_invoices["billing.invoices"] {');
    expect(diagram).toContain('    my_table["my table"] {');
    expect(diagram).toContain("    my-table {");
    expect(diagram).toContain("    my_table ||--o| billing_invoices : id");
  });

  test("two names that read the same get different ids", () => {
    const diagram = render({ tables: [table("a.b"), table("a b"), table("a_b")] });
    expect(diagram).toContain('    a_b_2["a b"] {');
    expect(diagram).toContain('    a_b_3["a.b"] {');
    expect(diagram).toContain("    a_b {");
  });

  describe("indexes", () => {
    const orders = table("orders", {
      columns: [column("id"), column("user_id"), column("status", "text"), column("code", "text")],
      indexes: [
        { name: "orders_by_user", columns: ["user_id", "status"], unique: false },
        { name: "orders_by_status", columns: ["status"], unique: false },
        { name: "orders_code_key", columns: ["code"], unique: true },
      ],
    });

    test("are left out by default", () => {
      expect(render({ tables: [orders] })).not.toContain("orders_by");
    });

    test("are the comment of their first column when asked for", () => {
      const diagram = render({ tables: [orders] }, { indexes: true });
      expect(diagram).toContain('        integer user_id "index orders_by_user (user_id, status)"');
      expect(diagram).toContain('        text status "index orders_by_status"');
      expect(diagram).toContain("        text code UK");
    });

    test("join an enum's values in the comment", () => {
      const typed = table("t", {
        columns: [column("mood", "mood", { values: ["ok"] })],
        indexes: [
          { name: "by_mood", columns: ["mood"], unique: false },
          { name: "mood_once", columns: ["mood", "id"], unique: true },
        ],
      });
      expect(render({ tables: [typed] }, { indexes: true })).toContain(
        '        mood mood "ok; index by_mood; unique mood_once (mood, id)"',
      );
    });
  });

  test("an empty database is an empty diagram", () => {
    expect(render({ tables: [] })).toBe("erDiagram\n");
  });
});
